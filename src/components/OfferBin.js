import { useRef, useState } from 'react';
import mammoth from 'mammoth/mammoth.browser';
import * as pdfjsLib from 'pdfjs-dist';
import { supabase } from '../lib/supabase';

// PDF.js needs a worker. Point to the CDN build that matches the locally
// installed version so the two never drift. The URL works in both dev
// and production (CRA doesn't need extra config).
try {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
} catch {}

// Offer Bin — drag & drop PDF/DOCX offer sheets. Extracts text locally,
// sends to Claude for structured extraction, upserts a pipeline row
// keyed on (artist_slug, event_date). The key matched this component's
// Claude call travels from browser → Anthropic directly; it relies on
// REACT_APP_ANTHROPIC_API_KEY being present in the bundle. See the
// security note in .env.example before deploying to a public URL.

const CLAUDE_MODEL = 'claude-sonnet-4-6';

const VALID_SLUGS = [
  'shogun','clawz','junkie-kid','anoluxx','anime','mad-dog','hellbound','mandy',
  'drakk','triptykh','morelia','sihk','jenna-shaw','lara-klart','ketting','the-purge',
  'dea-magna','taylor-torrence','jay-toledo','jayr','naomi-luna','gioh-cecato','cyboy',
  'death-code','dr-greco','fernanda-martins','pixie-dust','water-spirit',
];

const SYSTEM_PROMPT = `You are a booking agent assistant. Extract structured offer data from this music industry offer document. Return ONLY valid JSON — no prose, no markdown, no code fences — with these exact fields:

{
  "artist_slug": string (lowercase, hyphens, must be one of: ${VALID_SLUGS.join(', ')}; null if none fit),
  "event_date": string YYYY-MM-DD (null if not specified),
  "city": string,
  "state": string (2-letter US code or country name),
  "venue": string,
  "fee_offered": number (guaranteed fee only, no bonus; null if unknown),
  "bonus_structure": string (describe any bonus verbatim; null if none),
  "walkout_potential": number (max realistic walkout including bonuses; null if not knowable),
  "deal_type": string (one of: "Landed", "All In", "Fee+Flights", "TBD"),
  "hotel_included": boolean,
  "ground_included": boolean,
  "rider_included": boolean,
  "capacity": number (null if unknown),
  "event_type": string (one of: "Headline", "Direct Support", "Festival Stage", "B2B", "Club Night"; null if unclear),
  "age_restriction": string (e.g. "18+", "21+", "All Ages"; null if unspecified),
  "buyer": string (full name of the buyer/promoter),
  "buyer_email": string,
  "buyer_phone": string,
  "buyer_company": string (promoter / venue / festival name),
  "radius_clause": string (full radius-clause language if present; null if none),
  "set_time": string (start time or time range),
  "notes": string (anything important not captured by the fields above)
}

Omit the field entirely rather than guessing. Treat ambiguous numbers as null.`;

// ── helpers ────────────────────────────────────────────────────────────────
async function extractText(file) {
  const buf = await file.arrayBuffer();
  if (file.name.toLowerCase().endsWith('.docx') || file.type.includes('officedocument.wordprocessingml')) {
    const { value } = await mammoth.extractRawText({ arrayBuffer: buf });
    return value;
  }
  if (file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf') {
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    let out = '';
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      out += content.items.map(it => it.str).join(' ') + '\n';
    }
    return out;
  }
  throw new Error(`Unsupported file type: ${file.name}`);
}

async function callClaude(text) {
  const key = process.env.REACT_APP_ANTHROPIC_API_KEY;
  if (!key) throw new Error('REACT_APP_ANTHROPIC_API_KEY missing from .env.local');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: text.slice(0, 60_000) }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  const body = (json.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  const m = body.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('No JSON found in Claude response');
  return JSON.parse(m[0]);
}

// Maps the Claude extraction into the pipeline + buyers schemas
function toPipelineRow(x) {
  const row = {
    artist_slug: x.artist_slug || null,
    stage: 'Offer In + Negotiating',
    event_date: x.event_date || null,
    market: x.city || null,
    venue: x.venue || null,
    buyer: x.buyer || null,
    buyer_company: x.buyer_company || null,
    buyer_email: x.buyer_email || null,
    buyer_phone: x.buyer_phone || null,
    fee_offered: x.fee_offered != null ? String(x.fee_offered).trim() : null,
    bonus_structure: x.bonus_structure || null,
    walkout_potential: Number.isFinite(x.walkout_potential) ? x.walkout_potential : null,
    deal_type: x.deal_type || null,
    hotel_included: !!x.hotel_included,
    ground_included: !!x.ground_included,
    rider_included: !!x.rider_included,
    capacity: Number.isFinite(x.capacity) ? Math.floor(x.capacity) : null,
    event_type: x.event_type || null,
    age_restriction: x.age_restriction || null,
    radius_clause: x.radius_clause || null,
    set_time: x.set_time || null,
    notes: x.notes || null,
    sort_order: 0, // new inserts land at top of the kanban column
  };
  return row;
}

async function pushToSupabase(extracted) {
  if (!extracted.artist_slug || !VALID_SLUGS.includes(extracted.artist_slug)) {
    throw new Error(`Artist slug not recognized: "${extracted.artist_slug}"`);
  }
  if (!extracted.event_date || !/^\d{4}-\d{2}-\d{2}$/.test(extracted.event_date)) {
    throw new Error('event_date missing or not YYYY-MM-DD');
  }
  const row = toPipelineRow(extracted);

  // Upsert the pipeline deal by (artist_slug, event_date)
  const { data: existing } = await supabase
    .from('pipeline').select('id')
    .eq('artist_slug', row.artist_slug).eq('event_date', row.event_date).limit(1);

  let verb, dealRow, feeNote;
  if (existing && existing.length > 0) {
    // UPDATE — only non-null fields (don't wipe hand-edited values with nulls)
    const BOOL_KEYS = new Set(['hotel_included', 'ground_included', 'rider_included']);
    const patch = Object.fromEntries(
      Object.entries(row).filter(([k, v]) => BOOL_KEYS.has(k) || (v !== null && v !== ''))
    );
    const { data, error } = await supabase.from('pipeline').update(patch).eq('id', existing[0].id).select().single();
    if (error) throw error;
    verb = 'UPDATED';
    dealRow = data;
    feeNote = extracted.fee_offered != null ? ` — fee revised to $${extracted.fee_offered}` : '';
  } else {
    const { data, error } = await supabase.from('pipeline').insert(row).select().single();
    if (error) throw error;
    verb = 'CREATED';
    dealRow = data;
    feeNote = extracted.fee_offered != null ? ` $${extracted.fee_offered}` : '';
  }

  // Upsert buyer if we have an email — dedup by email
  if (extracted.buyer_email) {
    const email = String(extracted.buyer_email).trim().toLowerCase();
    const { data: bExisting } = await supabase.from('buyers').select('id').ilike('email', email).limit(1);
    if (!bExisting || bExisting.length === 0) {
      await supabase.from('buyers').insert({
        name: extracted.buyer || null,
        email,
        company: extracted.buyer_company || null,
        market: extracted.city ? `${extracted.city}${extracted.state ? ', ' + extracted.state : ''}` : null,
        status: 'Cold',
        last_contact: new Date().toISOString().slice(0, 10),
        notes: '[auto-imported from Offer Bin]',
      });
    } else {
      await supabase.from('buyers').update({ last_contact: new Date().toISOString().slice(0, 10) }).eq('id', bExisting[0].id);
    }
  }

  // Activity log
  const city = extracted.city || dealRow.market || '';
  const desc = verb === 'UPDATED'
    ? `Offer updated: ${row.artist_slug} ${row.event_date}${feeNote}`
    : `Offer processed via Offer Bin: ${row.artist_slug} ${city} ${row.event_date}${feeNote}`;
  await supabase.from('activity_log').insert({
    artist_slug: row.artist_slug,
    action: 'offer_bin',
    description: desc.slice(0, 500),
  });

  return { verb, slug: row.artist_slug, city, event_date: row.event_date };
}

function prettyDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── component ──────────────────────────────────────────────────────────────
export default function OfferBin() {
  const inputRef = useRef(null);
  const [state, setState] = useState({ phase: 'idle', msg: 'DROP OFFER' });

  async function processFile(file) {
    if (!file) return;
    const ok = /\.(pdf|docx)$/i.test(file.name) || /pdf|wordprocessingml/i.test(file.type);
    if (!ok) { setState({ phase: 'error', msg: 'PDF OR DOCX ONLY' }); resetSoon(); return; }
    setState({ phase: 'scanning', msg: 'SCANNING…' });
    try {
      const text = await extractText(file);
      if (!text || text.trim().length < 40) throw new Error('Document appears empty');
      setState({ phase: 'scanning', msg: 'ASKING CLAUDE…' });
      const extracted = await callClaude(text);
      setState({ phase: 'scanning', msg: 'WRITING TO SUPABASE…' });
      const { verb, slug, city, event_date } = await pushToSupabase(extracted);
      setState({
        phase: 'success',
        msg: `DEAL ${verb}: ${slug.toUpperCase()}${city ? ` — ${city}` : ''} ${prettyDate(event_date)}`,
      });
      resetSoon(4000);
    } catch (e) {
      setState({ phase: 'error', msg: (e.message || 'Failed').toUpperCase().slice(0, 80) });
      resetSoon(5000);
    }
  }

  function resetSoon(delay = 3500) {
    setTimeout(() => setState({ phase: 'idle', msg: 'DROP OFFER' }), delay);
  }

  function onDrop(e) {
    e.preventDefault();
    setState(s => s.phase === 'dragover' ? { phase: 'scanning', msg: 'SCANNING…' } : s);
    const file = e.dataTransfer?.files?.[0];
    processFile(file);
  }

  const phaseClass = {
    idle:     'ob-idle',
    dragover: 'ob-dragover',
    scanning: 'ob-scanning',
    success:  'ob-success',
    error:    'ob-error',
  }[state.phase] || 'ob-idle';

  return (
    <section className="mt-8">
      <style>{CSS}</style>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setState(s => s.phase === 'idle' ? { phase: 'dragover', msg: 'RELEASE TO SCAN' } : s); }}
        onDragLeave={() => setState(s => s.phase === 'dragover' ? { phase: 'idle', msg: 'DROP OFFER' } : s)}
        onDrop={onDrop}
        className={`ob-portal ${phaseClass}`}
      >
        <div className="ob-grid" aria-hidden />
        <div className="ob-ring" aria-hidden />
        <div className="ob-ring ob-ring-outer" aria-hidden />
        <div className="ob-inner">
          <svg className="ob-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <div className="ob-label">{state.msg}</div>
          <div className="ob-hint">
            {state.phase === 'idle' && 'PDF or DOCX · drop or click'}
            {state.phase === 'dragover' && '◆ ◆ ◆'}
            {state.phase === 'scanning' && 'extracting → claude → supabase'}
            {state.phase === 'success' && '✓ saved'}
            {state.phase === 'error' && '✗ retry'}
          </div>
        </div>
        <input
          ref={inputRef} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={e => processFile(e.target.files?.[0])}
          className="hidden" style={{ display: 'none' }}
        />
      </div>
    </section>
  );
}

// Scoped CSS — put directly in a <style> tag so this component is
// drop-in without touching the global Tailwind config.
const CSS = `
.ob-portal {
  position: relative;
  height: 140px;
  border-radius: 18px;
  background: radial-gradient(ellipse at center, #0a0f2a 0%, #040716 60%, #010212 100%);
  overflow: hidden;
  cursor: pointer;
  border: 1px solid rgba(99,102,241,0.25);
  transition: transform 0.2s ease, border-color 0.3s ease, box-shadow 0.3s ease;
  user-select: none;
}
.ob-portal:hover  { transform: scale(1.005); border-color: rgba(129,140,248,0.6); box-shadow: 0 0 40px rgba(99,102,241,0.25); }
.ob-portal.ob-dragover { transform: scale(1.015); border-color: rgba(34,211,238,0.9); box-shadow: 0 0 60px rgba(34,211,238,0.5); }
.ob-portal.ob-success  { border-color: rgba(16,185,129,0.9); box-shadow: 0 0 60px rgba(16,185,129,0.45); }
.ob-portal.ob-error    { border-color: rgba(239,68,68,0.9);  box-shadow: 0 0 60px rgba(239,68,68,0.45);  animation: ob-shake 0.4s; }

/* subtle circuit-board grid */
.ob-grid {
  position: absolute; inset: 0;
  background-image:
    linear-gradient(rgba(99,102,241,0.10) 1px, transparent 1px),
    linear-gradient(90deg, rgba(99,102,241,0.10) 1px, transparent 1px);
  background-size: 28px 28px;
  mask-image: radial-gradient(ellipse at center, black 30%, transparent 75%);
  opacity: 0.7;
}

/* glowing rings */
.ob-ring, .ob-ring-outer {
  position: absolute; top: 50%; left: 50%;
  width: 92px; height: 92px;
  margin: -46px 0 0 -46px;
  border-radius: 9999px;
  border: 2px solid rgba(129,140,248,0.55);
  box-shadow: 0 0 26px rgba(99,102,241,0.45), inset 0 0 18px rgba(168,85,247,0.25);
  animation: ob-pulse 2.6s ease-in-out infinite;
}
.ob-ring-outer {
  width: 120px; height: 120px; margin: -60px 0 0 -60px;
  border-color: rgba(168,85,247,0.28);
  animation-delay: -1.2s;
}
.ob-portal.ob-dragover .ob-ring,
.ob-portal.ob-dragover .ob-ring-outer {
  border-color: rgba(34,211,238,0.9);
  box-shadow: 0 0 36px rgba(34,211,238,0.7), inset 0 0 22px rgba(34,211,238,0.35);
  animation: ob-pulse 0.8s ease-in-out infinite;
}
.ob-portal.ob-scanning .ob-ring {
  animation: ob-spin 0.9s linear infinite;
  border-color: rgba(99,102,241,0.85);
  border-top-color: rgba(34,211,238,1);
  border-right-color: rgba(168,85,247,0.85);
}
.ob-portal.ob-scanning .ob-ring-outer {
  animation: ob-spin 1.6s linear infinite reverse;
  border-color: rgba(168,85,247,0.45);
  border-bottom-color: rgba(34,211,238,0.9);
}
.ob-portal.ob-success .ob-ring {
  border-color: rgba(16,185,129,0.9);
  box-shadow: 0 0 40px rgba(16,185,129,0.6), inset 0 0 18px rgba(16,185,129,0.3);
  animation: ob-flash-green 1.2s ease-out;
}
.ob-portal.ob-error .ob-ring {
  border-color: rgba(239,68,68,0.9);
  box-shadow: 0 0 40px rgba(239,68,68,0.6);
  animation: ob-flash-red 0.8s;
}

/* center content */
.ob-inner {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 4px;
  color: #c7d2fe;
  font-family: 'SF Mono', ui-monospace, Menlo, Consolas, monospace;
  text-shadow: 0 0 12px rgba(99,102,241,0.6);
  pointer-events: none;
}
.ob-portal.ob-dragover .ob-inner { color: #a5f3fc; text-shadow: 0 0 16px rgba(34,211,238,0.8); }
.ob-portal.ob-success  .ob-inner { color: #6ee7b7; text-shadow: 0 0 14px rgba(16,185,129,0.8); }
.ob-portal.ob-error    .ob-inner { color: #fca5a5; text-shadow: 0 0 14px rgba(239,68,68,0.8); }

.ob-icon { margin-bottom: 2px; opacity: 0.9; }
.ob-label { font-size: 12.5px; font-weight: 700; letter-spacing: 0.22em; }
.ob-hint  { font-size: 10px;   letter-spacing: 0.18em; opacity: 0.65; }

/* keyframes */
@keyframes ob-pulse {
  0%, 100% { transform: scale(1);   opacity: 0.85; }
  50%      { transform: scale(1.06); opacity: 1;    }
}
@keyframes ob-spin { to { transform: rotate(360deg); } }
@keyframes ob-shake {
  0%,100% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  75% { transform: translateX(4px); }
}
@keyframes ob-flash-green { 0% { box-shadow: 0 0 60px rgba(16,185,129,0.9), inset 0 0 30px rgba(16,185,129,0.6); } 100% { box-shadow: 0 0 30px rgba(16,185,129,0.4), inset 0 0 14px rgba(16,185,129,0.2); } }
@keyframes ob-flash-red   { 0% { box-shadow: 0 0 60px rgba(239,68,68,0.9); } 100% { box-shadow: 0 0 30px rgba(239,68,68,0.4); } }
`;
