import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

// Offer Bin — drag & drop PDF/DOCX. Heavy libs (pdfjs-dist, mammoth) are
// dynamic-imported only on file drop so a CRA build / runtime failure in
// either library never prevents the component from rendering. The box
// uses inline styles for the structural rules (size, layout, background,
// glow) so even a class-name collision can't hide it.

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

// ── file → claude content ─────────────────────────────────────────────────
// PDFs go straight to Claude as a base64 document block — Claude 4.x reads
// PDFs natively, no pdfjs worker required. DOCX still needs local text
// extraction (Claude doesn't decode .docx), but mammoth is small + has no
// worker so it's reliable in the browser.
function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function buildUserContentForFile(file) {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.pdf') || file.type === 'application/pdf') {
    const buf = await file.arrayBuffer();
    const base64 = arrayBufferToBase64(buf);
    return [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
      { type: 'text', text: 'Extract the offer data from this PDF and return JSON per the schema in the system prompt.' },
    ];
  }
  if (lower.endsWith('.docx') || file.type.includes('officedocument.wordprocessingml')) {
    const mammoth = (await import('mammoth/mammoth.browser')).default;
    const { value: text } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    if (!text || text.trim().length < 40) throw new Error('Document appears empty');
    return text.slice(0, 60_000);
  }
  throw new Error(`Unsupported file type: ${file.name}`);
}

async function callClaude(userContent) {
  const key = process.env.REACT_APP_ANTHROPIC_API_KEY;
  if (!key) throw new Error('REACT_APP_ANTHROPIC_API_KEY missing — set in .env.local and restart');
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
      // userContent is a string for DOCX, an array for PDF document input
      messages: [{ role: 'user', content: userContent }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  const body = (json.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  const m = body.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('No JSON found in Claude response');
  return JSON.parse(m[0]);
}

// ── push to supabase ───────────────────────────────────────────────────────
function toPipelineRow(x) {
  return {
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
    sort_order: 0,
  };
}

async function pushToSupabase(extracted) {
  if (!extracted.artist_slug || !VALID_SLUGS.includes(extracted.artist_slug)) {
    throw new Error(`Artist slug not recognized: "${extracted.artist_slug}"`);
  }
  if (!extracted.event_date || !/^\d{4}-\d{2}-\d{2}$/.test(extracted.event_date)) {
    throw new Error('event_date missing or not YYYY-MM-DD');
  }
  const row = toPipelineRow(extracted);

  const { data: existing } = await supabase
    .from('pipeline').select('id')
    .eq('artist_slug', row.artist_slug).eq('event_date', row.event_date).limit(1);

  let verb;
  if (existing && existing.length > 0) {
    const BOOL_KEYS = new Set(['hotel_included', 'ground_included', 'rider_included']);
    const patch = Object.fromEntries(
      Object.entries(row).filter(([k, v]) => BOOL_KEYS.has(k) || (v !== null && v !== ''))
    );
    const { error } = await supabase.from('pipeline').update(patch).eq('id', existing[0].id);
    if (error) throw error;
    verb = 'UPDATED';
  } else {
    const { error } = await supabase.from('pipeline').insert(row);
    if (error) throw error;
    verb = 'CREATED';
  }

  if (extracted.buyer_email) {
    const email = String(extracted.buyer_email).trim().toLowerCase();
    const { data: bExisting } = await supabase.from('buyers').select('id').ilike('email', email).limit(1);
    if (!bExisting || bExisting.length === 0) {
      await supabase.from('buyers').insert({
        name: extracted.buyer || null, email,
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

  const city = extracted.city || row.market || '';
  const desc = verb === 'UPDATED'
    ? `Offer updated: ${row.artist_slug} ${row.event_date}${extracted.fee_offered != null ? ` — fee revised to $${extracted.fee_offered}` : ''}`
    : `Offer processed via Offer Bin: ${row.artist_slug} ${city} ${row.event_date}${extracted.fee_offered != null ? ` $${extracted.fee_offered}` : ''}`;
  await supabase.from('activity_log').insert({
    artist_slug: row.artist_slug, action: 'offer_bin', description: desc.slice(0, 500),
  });

  return { verb, slug: row.artist_slug, city, event_date: row.event_date };
}

function prettyDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── component ──────────────────────────────────────────────────────────────
export default function OfferBin() {
  const inputRef = useRef(null);
  const [phase, setPhase] = useState('idle'); // idle | dragover | scanning | success | error
  const [msg, setMsg] = useState('DROP OFFER');

  // Inject the optional fancy CSS into <head> on mount. If CSS injection
  // fails for any reason, the inline structural styles below still render
  // a fully visible box.
  useEffect(() => {
    const id = 'ob-styles';
    if (document.getElementById(id)) return;
    const tag = document.createElement('style');
    tag.id = id;
    tag.textContent = FANCY_CSS;
    document.head.appendChild(tag);
  }, []);

  async function processFile(file) {
    if (!file) return;
    const ok = /\.(pdf|docx)$/i.test(file.name) || /pdf|wordprocessingml/i.test(file.type);
    if (!ok) { setPhase('error'); setMsg('PDF OR DOCX ONLY'); reset(); return; }
    setPhase('scanning'); setMsg('READING FILE…');
    try {
      const userContent = await buildUserContentForFile(file);
      setMsg('ASKING CLAUDE…');
      const extracted = await callClaude(userContent);
      setMsg('WRITING TO SUPABASE…');
      const { verb, slug, city, event_date } = await pushToSupabase(extracted);
      setPhase('success');
      setMsg(`DEAL ${verb}: ${slug.toUpperCase()}${city ? ' — ' + city : ''} ${prettyDate(event_date)}`);
      reset(4000);
    } catch (e) {
      setPhase('error');
      setMsg((e.message || 'Failed').slice(0, 100).toUpperCase());
      reset(5000);
    }
  }

  function reset(delay = 3500) {
    setTimeout(() => { setPhase('idle'); setMsg('DROP OFFER'); }, delay);
  }

  // ── color theming per phase ──
  const theme = {
    idle:     { border: 'rgba(99,102,241,0.45)',  glow: 'rgba(99,102,241,0.30)',  text: '#c7d2fe' },
    dragover: { border: 'rgba(34,211,238,0.95)',  glow: 'rgba(34,211,238,0.60)',  text: '#a5f3fc' },
    scanning: { border: 'rgba(168,85,247,0.85)',  glow: 'rgba(168,85,247,0.50)',  text: '#e9d5ff' },
    success:  { border: 'rgba(16,185,129,0.95)',  glow: 'rgba(16,185,129,0.55)',  text: '#6ee7b7' },
    error:    { border: 'rgba(239,68,68,0.95)',   glow: 'rgba(239,68,68,0.55)',   text: '#fca5a5' },
  }[phase];

  // INLINE styles guarantee the box is visible even if FANCY_CSS fails.
  const wrapStyle = {
    position: 'relative',
    height: 140,
    borderRadius: 18,
    background: 'radial-gradient(ellipse at center, #0a0f2a 0%, #040716 60%, #010212 100%)',
    border: `2px solid ${theme.border}`,
    boxShadow: `0 0 40px ${theme.glow}`,
    cursor: 'pointer',
    overflow: 'hidden',
    transition: 'border-color 0.3s ease, box-shadow 0.3s ease, transform 0.2s ease',
    transform: phase === 'dragover' ? 'scale(1.01)' : 'scale(1)',
    userSelect: 'none',
    marginTop: 32,
  };
  const innerStyle = {
    position: 'absolute', inset: 0,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 6,
    color: theme.text,
    fontFamily: "'SF Mono', ui-monospace, Menlo, Consolas, monospace",
    textShadow: `0 0 12px ${theme.glow}`,
    pointerEvents: 'none',
    textAlign: 'center',
    padding: '0 12px',
  };

  return (
    <section style={{ marginBottom: 32 }}>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); if (phase === 'idle') { setPhase('dragover'); setMsg('RELEASE TO SCAN'); } }}
        onDragLeave={() => { if (phase === 'dragover') { setPhase('idle'); setMsg('DROP OFFER'); } }}
        onDrop={e => { e.preventDefault(); processFile(e.dataTransfer?.files?.[0]); }}
        style={wrapStyle}
        className={`ob-portal ob-${phase}`}
        data-testid="offer-bin"
      >
        {/* circuit grid (CSS-only, decorative) */}
        <div className="ob-grid" aria-hidden style={{
          position: 'absolute', inset: 0,
          backgroundImage: `linear-gradient(rgba(99,102,241,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.10) 1px, transparent 1px)`,
          backgroundSize: '28px 28px',
          maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
          opacity: 0.7, pointerEvents: 'none',
        }} />
        {/* glow ring (decorative — animations come from .ob-ring class) */}
        <div className="ob-ring" aria-hidden style={{
          position: 'absolute', top: '50%', left: '50%',
          width: 92, height: 92, marginTop: -46, marginLeft: -46,
          borderRadius: '9999px',
          border: `2px solid ${theme.border}`,
          boxShadow: `0 0 26px ${theme.glow}, inset 0 0 18px rgba(168,85,247,0.20)`,
          pointerEvents: 'none',
        }} />
        <div className="ob-ring-outer" aria-hidden style={{
          position: 'absolute', top: '50%', left: '50%',
          width: 122, height: 122, marginTop: -61, marginLeft: -61,
          borderRadius: '9999px',
          border: `2px solid ${theme.border}`,
          opacity: 0.4,
          pointerEvents: 'none',
        }} />
        <div style={innerStyle}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '0.22em' }}>{msg}</div>
          <div style={{ fontSize: 10, letterSpacing: '0.18em', opacity: 0.7 }}>
            {phase === 'idle'     && 'PDF or DOCX · drop or click'}
            {phase === 'dragover' && '◆ ◆ ◆'}
            {phase === 'scanning' && 'extracting → claude → supabase'}
            {phase === 'success'  && '✓ saved'}
            {phase === 'error'    && '✗ retry'}
          </div>
        </div>
        <input
          ref={inputRef} type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={e => processFile(e.target.files?.[0])}
          style={{ display: 'none' }}
        />
      </div>
    </section>
  );
}

// Optional CSS for the spin/pulse animations. Injected into <head> on
// mount. If this never runs, the box still shows — just with static rings.
const FANCY_CSS = `
.ob-portal.ob-idle .ob-ring,
.ob-portal.ob-idle .ob-ring-outer {
  animation: ob-pulse 2.6s ease-in-out infinite;
}
.ob-portal.ob-idle .ob-ring-outer { animation-delay: -1.2s; }

.ob-portal.ob-dragover .ob-ring,
.ob-portal.ob-dragover .ob-ring-outer {
  animation: ob-pulse 0.8s ease-in-out infinite;
}

.ob-portal.ob-scanning .ob-ring        { animation: ob-spin 0.9s linear infinite; }
.ob-portal.ob-scanning .ob-ring-outer  { animation: ob-spin 1.6s linear infinite reverse; }

.ob-portal.ob-success .ob-ring         { animation: ob-flash 1.2s ease-out; }
.ob-portal.ob-error   .ob-ring         { animation: ob-shake 0.5s; }

@keyframes ob-pulse {
  0%, 100% { transform: scale(1);   opacity: 0.85; }
  50%      { transform: scale(1.06); opacity: 1;    }
}
@keyframes ob-spin  { to { transform: rotate(360deg); } }
@keyframes ob-flash { 0% { box-shadow: 0 0 60px rgba(16,185,129,0.9); } 100% { box-shadow: 0 0 24px rgba(16,185,129,0.4); } }
@keyframes ob-shake {
  0%,100% { transform: translateX(0); }
  25%     { transform: translateX(-3px); }
  75%     { transform: translateX(3px); }
}
`;
