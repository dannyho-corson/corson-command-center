#!/usr/bin/env node
/*
 * Corson Daily Briefing — v3 with intelligence layer
 *
 * Reads today's emails from Outlook Web (outlook.office365.com) in an
 * already-open Chrome tab, classifies + pushes to Supabase, then calls
 * Claude Sonnet 4.6 to generate a smart briefing + draft replies saved to
 * Outlook desktop. Appends one-line status to ~/Documents/Corson Agency/
 * Exports/briefing-log.txt.
 *
 * Usage:  node scripts/run-briefing.js
 *
 * Prerequisites:
 *   - Chrome running with outlook.office365.com signed in
 *   - Chrome → View → Developer → Allow JavaScript from Apple Events (one-time)
 *   - Microsoft Outlook desktop app signed in as dho@corsonagency.com
 *   - scripts/.env with SUPABASE_URL, SUPABASE_ANON_KEY, ANTHROPIC_API_KEY
 *   - SQL migration sql/briefing_intelligence.sql applied in Supabase
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

// ─── constants ────────────────────────────────────────────────────────────
const HOME = os.homedir();
const PROJECT = path.join(HOME, 'corson-command-center');
const ENV_PATH = path.join(PROJECT, 'scripts/.env');
const BRIEFING_LOG = path.join(HOME, 'Documents/Corson Agency/Exports/briefing-log.txt');
const SYNC_LOG = path.join(PROJECT, 'scripts/sync-log.txt');
const INDUSTRY_BIBLE_PATH = path.join(HOME, 'Documents/Corson Agency/CORSON_INDUSTRY_BIBLE.md');
const TIMEOUT_MS = 8 * 60 * 1000;
const START = Date.now();

const SCRAPE_TARGET = 30;
const SCRAPE_MAX = 60;
const SCROLL_MAX_ITERS = 20;

const CLAUDE_MODEL = 'claude-opus-4-7';

const TIMEOUT_HANDLE = setTimeout(() => {
  finalize({ status: 'TIMEOUT', reason: '8-minute timeout exceeded' });
  process.exit(1);
}, TIMEOUT_MS);
TIMEOUT_HANDLE.unref?.();

// ─── counters ─────────────────────────────────────────────────────────────
const counts = { emails: 0, new: 0, shows: 0, pipeline: 0, urgent: 0, activity: 0, skipped: 0, drafts: 0 };
const inserted = { shows: [], pipeline: [], urgent: [], activity: [], drafts: [] };
const skipped = [];
const errors = [];
let intelligence = null; // Claude's structured analysis

function log(msg) {
  const elapsed = ((Date.now() - START) / 1000).toFixed(1);
  console.log(`[+${elapsed}s] ${msg}`);
}
function recordError(where, err) {
  const msg = err?.message || String(err);
  errors.push(`${where}: ${msg}`);
  console.error(`[ERROR] ${where}: ${msg}`);
}

// ─── env loader ───────────────────────────────────────────────────────────
function loadEnv() {
  const raw = fs.readFileSync(ENV_PATH, 'utf8');
  const out = {};
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

function hasRealAnthropicKey(env) {
  const k = env.ANTHROPIC_API_KEY || '';
  return k && k !== 'your-new-key' && (k.startsWith('sk-') || k.length >= 40);
}

// ─── chrome bridge (AppleScript + injected JS) ────────────────────────────
function runChromeJS(jsSource) {
  const wrapped =
    '(function(){try{var result=(function(){' + jsSource + '})();' +
    'return JSON.stringify({ok:true,value:result});}catch(e){' +
    'return JSON.stringify({ok:false,error:String(e&&e.message||e)});}})();';
  const tmpJS = path.join(os.tmpdir(), `corson_chrome_${process.pid}_${Date.now()}.js`);
  fs.writeFileSync(tmpJS, wrapped, 'utf8');
  const applescript = `
    set jsSource to read POSIX file "${tmpJS}" as «class utf8»
    tell application "Google Chrome"
      set mailTab to missing value
      set outlookTab to missing value
      repeat with w in windows
        repeat with t in tabs of w
          set u to URL of t
          if u contains "outlook" and u contains "/mail" then
            set mailTab to t
            exit repeat
          else if u contains "outlook" and outlookTab is missing value then
            set outlookTab to t
          end if
        end repeat
        if mailTab is not missing value then exit repeat
      end repeat
      set found to mailTab
      if found is missing value then set found to outlookTab
      if found is missing value then
        return "{\\"ok\\":false,\\"error\\":\\"No Outlook tab open in Chrome\\"}"
      end if
      return (execute found javascript jsSource)
    end tell
  `;
  let stdout;
  try {
    stdout = execFileSync('osascript', ['-e', applescript], { encoding: 'utf8', timeout: 60_000 });
  } catch (e) {
    throw new Error(`AppleScript failed: ${e.message}. Check Chrome is running + View → Developer → Allow JavaScript from Apple Events is on.`);
  } finally {
    try { fs.unlinkSync(tmpJS); } catch {}
  }
  const trimmed = stdout.trim();
  if (!trimmed) return { ok: false, error: 'Empty Chrome response (JS-from-AppleEvents likely disabled)' };
  try { return JSON.parse(trimmed); } catch { return { ok: false, error: `Non-JSON: ${trimmed.slice(0, 200)}` }; }
}

// ─── outlook scraping (scroll + accumulate) ───────────────────────────────
function scrapeOutlook() {
  const kickoff = runChromeJS(`
    window._corson = { done: false, error: null, progress: 'starting', emails: [] };
    (async function(){
      try {
        function getRows(){
          return Array.from(document.querySelectorAll('[role="option"][aria-label]'))
            .filter(function(r){
              var a = r.getAttribute('aria-label') || '';
              return a.length > 30 && !r.closest('[role="tree"]');
            });
        }
        var firstRow = getRows()[0];
        if (!firstRow) { window._corson.progress = 'no mail rows'; window._corson.done = true; return; }
        var scrollable = firstRow;
        while (scrollable && scrollable !== document.body) {
          var cs = getComputedStyle(scrollable);
          if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && scrollable.scrollHeight > scrollable.clientHeight + 50) break;
          scrollable = scrollable.parentElement;
        }
        if (!scrollable || scrollable === document.body) scrollable = document.scrollingElement || document.documentElement;

        var seen = new Map();
        var stableScroll = 0, lastTop = -1;
        var step = Math.max(scrollable.clientHeight - 80, 400);
        scrollable.scrollTop = 0;
        await new Promise(function(r){ setTimeout(r, 400); });

        for (var i = 0; i < ${SCROLL_MAX_ITERS}; i++) {
          getRows().forEach(function(r){
            var a = r.getAttribute('aria-label') || '';
            if (a && !seen.has(a)) seen.set(a, true);
          });
          window._corson.progress = 'iter '+i+', seen='+seen.size;
          if (seen.size >= ${SCRAPE_MAX}) break;
          var prev = scrollable.scrollTop;
          scrollable.scrollTop = prev + step;
          await new Promise(function(r){ setTimeout(r, 700); });
          if (Math.abs(scrollable.scrollTop - lastTop) < 5) { stableScroll++; if (stableScroll >= 3) break; } else stableScroll = 0;
          lastTop = scrollable.scrollTop;
        }
        getRows().forEach(function(r){ var a = r.getAttribute('aria-label') || ''; if (a && !seen.has(a)) seen.set(a, true); });

        var stripRe = /^(Collapsed|Expanded|Has attachments|Replied|Forwarded|Flagged|Unread|Read|Mentioned|Important)\\s+/i;
        var labels = Array.from(seen.keys()).slice(0, ${SCRAPE_MAX});
        var emails = labels.map(function(label){
          var cleaned = label;
          for (var k = 0; k < 6; k++) { var n = cleaned.replace(stripRe, ''); if (n === cleaned) break; cleaned = n; }
          var tm = cleaned.match(/\\s(\\d{1,2}:\\d{2}\\s?(?:AM|PM))\\s/i);
          var dm = cleaned.match(/\\s((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\\s+\\d{1,2}(?:,?\\s+20\\d{2})?)\\s/);
          var dym = cleaned.match(/\\s(Yesterday|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\\s/);
          var m = tm || dm || dym;
          var head = cleaned, marker = '', preview = '';
          if (m) { head = cleaned.slice(0, m.index).trim(); marker = m[1]; preview = cleaned.slice(m.index + m[0].length).trim(); }
          return { ariaLabel: label, subject: head, from: head.split(/;|,/)[0].trim(), time: marker, body: preview };
        });
        window._corson.emails = emails;
        window._corson.done = true;
      } catch (e) { window._corson.error = String(e && e.message || e); window._corson.done = true; }
    })();
    return 'started';
  `);
  if (!kickoff.ok) throw new Error(kickoff.error);

  const pollDeadline = Date.now() + 90_000;
  let lastProgress = '';
  let stuckCount = 0;
  while (Date.now() < pollDeadline) {
    if (Date.now() - START > TIMEOUT_MS - 60_000) throw new Error('Approaching timeout');
    execFileSync('sleep', ['1.0']);
    const poll = runChromeJS(`return JSON.stringify(window._corson || { done:false, progress:'no state' });`);
    if (!poll.ok) throw new Error(poll.error);
    const state = JSON.parse(poll.value);
    log(`scrape: ${state.progress}`);
    if (state.done) {
      if (state.error) throw new Error(`Chrome scrape: ${state.error}`);
      return state.emails || [];
    }
    // If the async IIFE wedges (seen happen when Outlook's virtualizer stops responding to
    // scrollTop), grab whatever's collected so far and return. Triggered after ~15s of no change.
    if (state.progress === lastProgress) {
      stuckCount++;
      if (stuckCount >= 15) {
        log(`scrape stuck at "${state.progress}" — grabbing current batch and moving on`);
        const rescue = runChromeJS(`
          var stripRe = /^(Collapsed|Expanded|Has attachments|Replied|Forwarded|Flagged|Unread|Read|Mentioned|Important)\\s+/i;
          var rows = Array.from(document.querySelectorAll('[role="option"][aria-label]'))
            .filter(function(r){ var a = r.getAttribute('aria-label')||''; return a.length>30 && !r.closest('[role="tree"]'); });
          return rows.map(function(r){
            var label = r.getAttribute('aria-label')||'';
            var cleaned = label;
            for (var k=0;k<6;k++){ var n=cleaned.replace(stripRe,''); if(n===cleaned) break; cleaned=n; }
            var tm = cleaned.match(/\\s(\\d{1,2}:\\d{2}\\s?(?:AM|PM))\\s/i);
            var dm = cleaned.match(/\\s((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\\s+\\d{1,2})\\s/);
            var dym = cleaned.match(/\\s(Yesterday|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\\s/);
            var m = tm||dm||dym;
            var head=cleaned, marker='', preview='';
            if(m){ head=cleaned.slice(0,m.index).trim(); marker=m[1]; preview=cleaned.slice(m.index+m[0].length).trim(); }
            return { ariaLabel: label, subject: head, from: head.split(/;|,/)[0].trim(), time: marker, body: preview };
          });
        `);
        if (rescue.ok && Array.isArray(rescue.value)) return rescue.value;
        throw new Error('Scrape wedged and rescue failed');
      }
    } else { stuckCount = 0; lastProgress = state.progress; }
  }
  throw new Error('Scrape poll timeout');
}

// ─── message id hash (stable identifier across runs) ──────────────────────
function messageIdFor(email) {
  const raw = [email.subject || '', email.from || '', (email.body || '').slice(0, 300)].join('|');
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

// ─── classification (regex — Claude layer refines this) ───────────────────
const ARTIST_PATTERNS = [
  ['junkie-kid', [/\bjunkie[\s-]?kid\b/i]],
  ['clawz', [/\bclawz\b/i]],
  ['hellbound', [/\bhellbound!?\b/i]],
  ['drakk', [/\bdrakk\b/i]],
  ['triptykh', [/\btriptykh\b/i]],
  ['morelia', [/\bmorelia\b/i]],
  ['ketting', [/\bketting\b/i]],
  ['mad-dog', [/\bmad[\s-]?dog\b/i]],
  ['anime', [/\bdj\s?anime\b/i, /\banime\b/i]],
  ['shogun', [/\bshogun\b/i]],
  ['dr-greco', [/\bdr\.?\s?greco\b/i, /\bgreco\b/i]],
  ['water-spirit', [/\bwater[\s-]?spirit\b/i]],
  ['dea-magna', [/\bdea[\s-]?magna\b/i]],
  ['jenna-shaw', [/\bjenna[\s-]?shaw\b/i]],
  ['jay-toledo', [/\bjay[\s-]?toledo\b/i]],
  ['naomi-luna', [/\bnaomi[\s-]?luna\b/i]],
  ['gioh-cecato', [/\bgioh[\s-]?cecato\b/i]],
  ['pixie-dust', [/\bpixie[\s-]?dust\b/i]],
  ['death-code', [/\bdeath[\s-]?code\b/i]],
  ['taylor-torrence', [/\btaylor[\s-]?torrence\b/i]],
  ['sihk', [/\bsihk\b/i]],
  ['lara-klart', [/\blara[\s-]?klart\b/i]],
  ['cyboy', [/\bcyboy\b/i]],
  ['mandy', [/\bmandy\b/i]],
  ['fernanda-martins', [/\bfernanda[\s-]?martins\b/i]],
  ['anoluxx', [/\banoluxx\b/i]],
  ['jayr', [/\bjayr\b/i]],
  ['tnt', [/\btnt\b/i]],
  ['dual-damage', [/\bdual[\s-]?damage\b/i]],
  ['the-purge', [/\bthe[\s-]?purge\b/i]],
  ['casska', [/\bcasska\b/i]],
  ['sub-zero-project', [/\bsub[\s-]?zero[\s-]?project\b/i]],
  ['melody-man', [/\bmelody[\s-]?man\b/i]],
  ['frontliner', [/\bfrontliner\b/i]],
];
const SHOW_TRIGGERS     = /\b(confirmed|confirmado|contract signed|deposit paid|advancing|settlement)\b/i;
const PIPELINE_TRIGGERS = /\b(offer|hold|inquiry|avail(ability)? check|avail|negotiat|fee range|request)\b/i;
const URGENT_TRIGGERS   = /\b(payment missing|visa problem|no response|advancing stalled|deposit overdue|waiting on|no reply|unresolved|action needed|unsigned|unpaid|mia)\b/i;

function detectArtistSlug(text) {
  for (const [slug, ps] of ARTIST_PATTERNS) for (const p of ps) if (p.test(text)) return slug;
  return null;
}
function detectStage(text) {
  if (/\bnegotiat/i.test(text)) return 'Negotiating';
  if (/\boffer\b/i.test(text)) return 'Offer In';
  if (/\bhold\b/i.test(text)) return 'Hold';
  if (/\b(avail|inquiry|request)\b/i.test(text)) return 'Inquiry';
  return 'Inquiry';
}
const MONTH_NAMES = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12,
  january:1,february:2,march:3,april:4,june:6,july:7,august:8,september:9,october:10,november:11,december:12 };
function extractDate(text) {
  let m = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);               if (m) return m[0];
  m = text.match(/\b(\d{1,2})[-/](\d{1,2})[-/](20\d{2})\b/);          if (m) return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  m = text.match(/\b(\d{1,2})[./](\d{1,2})[./](\d{2})\b/);            if (m) return `20${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  const mN = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*';
  m = text.match(new RegExp(`\\b(${mN})\\s+(\\d{1,2})(?:\\s*,?\\s*(20\\d{2}))?\\b`, 'i'));
  if (m) { const mo = MONTH_NAMES[m[1].toLowerCase().slice(0,4)] || MONTH_NAMES[m[1].toLowerCase().slice(0,3)]; const yr = m[3] || new Date().getFullYear(); if (mo) return `${yr}-${String(mo).padStart(2,'0')}-${String(m[2]).padStart(2,'0')}`; }
  m = text.match(new RegExp(`\\b(\\d{1,2})\\s+(${mN})(?:\\s+(20\\d{2}))?\\b`, 'i'));
  if (m) { const mo = MONTH_NAMES[m[2].toLowerCase().slice(0,4)] || MONTH_NAMES[m[2].toLowerCase().slice(0,3)]; const yr = m[3] || new Date().getFullYear(); if (mo) return `${yr}-${String(mo).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`; }
  return null;
}
function extractFee(text) {
  const m = text.match(/[€$£]\s?\d{1,3}(?:,\d{3})*(?:\.\d+)?(?:\s?\+?\s?(?:HGR|G\+R|ATA))?/i);
  return m ? m[0].replace(/\s+/g, '') : null;
}
function extractCityVenue(text) {
  const v = text.match(/\[([^\]\n]{2,60})\]/);
  const c = text.match(/\b([A-Z][A-Za-z'\- ]{2,30}),\s*([A-Z]{2})\b/);
  return { venue: v?.[1]?.trim() || null, city: c?.[1]?.trim() || null };
}

function classifyEmail(email) {
  const hay = `${email.subject}\n${email.ariaLabel}\n${email.body}`;
  const artist_slug = detectArtistSlug(hay);
  const event_date = extractDate(hay);
  const fee = extractFee(hay);
  const { venue, city } = extractCityVenue(hay);
  const snippet = (email.subject || '').replace(/\s+/g, ' ').slice(0, 160);
  const classifications = [];
  const isShow = SHOW_TRIGGERS.test(hay);
  const isPipeline = PIPELINE_TRIGGERS.test(hay) && !isShow;
  const isUrgent = URGENT_TRIGGERS.test(hay);
  if (isShow) classifications.push({ kind: 'show', row: { artist_slug, event_date, city, venue, promoter: null, fee, deal_type: 'Confirmed' } });
  if (isPipeline) classifications.push({ kind: 'pipeline', row: { artist_slug, stage: detectStage(hay), event_date, market: city, venue, buyer: null, buyer_company: null, fee_offered: fee, notes: `Auto-extracted ${new Date().toISOString().slice(0,10)}: ${snippet}`.slice(0, 500) } });
  if (isUrgent) classifications.push({ kind: 'urgent', row: { artist_slug, issue: snippet || 'urgent email flagged', priority: 'High', resolved: false } });
  if (classifications.length > 0 && artist_slug) classifications.push({ kind: 'activity', row: { artist_slug, action: 'email_processed', description: snippet.slice(0, 500) } });
  return classifications;
}

// ─── supabase ─────────────────────────────────────────────────────────────
function supabaseClient(env) {
  const { createClient } = require(path.join(PROJECT, 'node_modules/@supabase/supabase-js/dist/index.cjs'));
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
}
async function validArtistSlugs(supabase) {
  const { data, error } = await supabase.from('artists').select('slug');
  if (error) throw new Error(`artists: ${error.message}`);
  return new Set(data.map(r => r.slug));
}
// Preflight — set once at startup based on table existence
let PROCESSED_EMAILS_AVAILABLE = false;
let PROCESSED_EMAILS_HAS_MESSAGE_HASH = false; // legacy column on older schemas
async function probeProcessedEmails(supabase) {
  const { error } = await supabase.from('processed_emails').select('message_id').limit(1);
  PROCESSED_EMAILS_AVAILABLE = !error;
  if (error) { log(`processed_emails table not found — message-id dedup disabled. Apply sql/briefing_intelligence.sql in Supabase to enable.`); return; }
  const { error: hashErr } = await supabase.from('processed_emails').select('message_hash').limit(1);
  PROCESSED_EMAILS_HAS_MESSAGE_HASH = !hashErr;
  log(`processed_emails: available${PROCESSED_EMAILS_HAS_MESSAGE_HASH ? ' (with legacy message_hash column)' : ''}`);
}
async function isProcessed(supabase, message_id) {
  if (!PROCESSED_EMAILS_AVAILABLE) return false;
  const { data } = await supabase.from('processed_emails').select('message_id').eq('message_id', message_id).limit(1);
  return (data?.length || 0) > 0;
}
async function markProcessed(supabase, message_id, subject, sender, classified_as) {
  if (!PROCESSED_EMAILS_AVAILABLE) return;
  const row = { message_id, subject, sender, classified_as };
  if (PROCESSED_EMAILS_HAS_MESSAGE_HASH) row.message_hash = message_id;
  const { error } = await supabase.from('processed_emails').insert(row);
  if (error && !/duplicate|unique/i.test(error.message)) recordError(`processed_emails ${message_id}`, error);
}
async function existsShow(s, slug, d)   { if (!slug||!d) return false; const { data } = await s.from('shows').select('id').eq('artist_slug',slug).eq('event_date',d).limit(1); return (data?.length||0)>0; }
async function existsPipeline(s, slug, d, st) { if (!slug||!d) return false; const { data } = await s.from('pipeline').select('id').eq('artist_slug',slug).eq('event_date',d).eq('stage',st).limit(1); return (data?.length||0)>0; }
async function existsUrgent(s, slug, issue) { if (!slug||!issue) return false; const { data } = await s.from('urgent_issues').select('id').eq('artist_slug',slug).eq('issue',issue).eq('resolved',false).limit(1); return (data?.length||0)>0; }
async function existsActivity(s, slug, desc) { if (!slug||!desc) return false; const since = new Date(Date.now()-7*86400000).toISOString(); const { data } = await s.from('activity_log').select('id').eq('artist_slug',slug).eq('description',desc).gte('created_at',since).limit(1); return (data?.length||0)>0; }

// ─── claude intelligence layer ────────────────────────────────────────────
async function runClaudeLayer(env, supabase, newEmails, validSlugs) {
  if (!hasRealAnthropicKey(env)) {
    log('Claude intelligence layer SKIPPED (ANTHROPIC_API_KEY is placeholder — set a real key in scripts/.env to enable)');
    return null;
  }
  if (newEmails.length === 0) { log('Claude intelligence layer SKIPPED (no new emails)'); return null; }

  log('Calling Claude Sonnet 4.6 for intelligence layer…');

  const Anthropic = require(path.join(PROJECT, 'node_modules/@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  // Load current pipeline + urgent issues + existing buyers + targets for context
  const [{ data: pipelineRows }, { data: urgentRows }, { data: artistRows }, { data: buyerRows }, { data: targetRows }] = await Promise.all([
    supabase.from('pipeline').select('artist_slug, stage, venue, market, buyer, buyer_company, fee_offered, event_date, notes').order('event_date', { ascending: true }).limit(200),
    supabase.from('urgent_issues').select('artist_slug, issue, priority').eq('resolved', false).limit(50),
    supabase.from('artists').select('slug, name, manager_email').limit(100),
    supabase.from('buyers').select('name, email, company').limit(500),
    supabase.from('targets').select('id, artist_slug, promoter, contact, status').limit(500),
  ]);

  let industryBible = '';
  try { industryBible = fs.readFileSync(INDUSTRY_BIBLE_PATH, 'utf8').slice(0, 8000); } catch {}

  const systemPrompt = `You are the Corson Agency booking intelligence assistant for Danny Ho (Johnny Blaze), a hard-techno booking agent at Corson Agency. Your job: analyze today's inbox against the current pipeline + urgent issues + roster, and return a structured JSON briefing.

You MUST return valid JSON matching this exact schema:
{
  "summary": "2-3 sentence plain-English briefing of what matters today",
  "urgent": [{"artist_slug": "...", "issue": "...", "priority": "High|Medium|Low", "why_urgent": "...", "suggested_action": "..."}],
  "draft_replies": [{"to_email": "email@example.com", "subject": "...", "body": "..."}],
  "new_buyers": [{"name": "...", "email": "...", "company": "...", "market": "..."}],
  "target_updates": [{"target_id": "<uuid>", "new_status": "...", "note": "..."}]
}

Rules:
- "summary": lead with the single most important thing for Danny today
- "urgent": only include items NOT already in the urgent_issues list. Maximum 8 items. artist_slug must match a known roster slug. Assign priority per the rubric below.
- "draft_replies": the 2-3 most actionable emails (prefer the ones you flagged as High priority). Use manager_email from the roster when responding about an artist. Write in Danny's voice (direct, professional, no fluff). Do NOT include "[AI DRAFT]" markers — the script adds that.
- Only include artists that are in the provided roster. Return [] for any section with nothing to add.

PRIORITY RUBRIC — assign "priority" for each urgent item using these rules exactly:

"High" (DO TODAY — red) — any of:
  - Show is within 7 days and something is missing (contract, deposit, advancing info)
  - Deposit is overdue
  - Contract deadline has passed
  - Buyer has been waiting 48+ hours for a response
  - Competing offers on the same date need resolution today
  - Radius-clause conflict flagged

"Medium" (DO THIS WEEK — yellow) — any of:
  - Active negotiation needing follow-up
  - Offer received, needs forwarding to artist team
  - Avail check that came in this week
  - Show is within 30 days and needs advancing started
  - Payment follow-up needed (not yet overdue)

"Low" (DO THIS MONTH — green) — any of:
  - Early-stage inquiry
  - Festival pitch opportunity
  - Relationship building / outreach
  - Show is 30+ days out with no immediate blocker

If an item doesn't clearly fit any bucket, default to "Medium".

NEW BUYERS — extract from today's emails any sender who looks like a promoter/buyer and is NOT already in the provided existing_buyers list. For each:
  - name: human name (e.g. "Jane Smith")
  - email: full email address (parse from reply-to, signature, or quoted header)
  - company: promoter/venue/festival name if mentioned ("Insomniac", "Cave Rave", etc.)
  - market: city/region if mentioned ("Miami, FL", "Denver")
Return [] if no new promoters visible. Skip internal senders (Corson Agency team, Leo, Danny, the artists themselves, their managers) — those are not buyers.

TARGET UPDATES — for each email today, if the sender matches an existing target in the provided targets list (by email OR fuzzy-match on promoter name), return a target_update:
  - target_id: the UUID from the provided targets list
  - new_status: "Contacted" (general reply), "In Conversation" (active inquiry/avail thread), "Offer Sent" (formal offer exchanged), or "Confirmed" (deal locked)
  - note: one-line summary of today's interaction (e.g. "4/17 — responded to Boston 6/26 offer")
Only include a target_update when there IS a matching row in the targets list. Return [] otherwise.

INDUSTRY CONTEXT:
${industryBible || '(not loaded)'}`.slice(0, 60_000);

  const userMessage = JSON.stringify({
    todays_new_emails: newEmails.map(e => ({ subject: e.subject, from: e.from, preview: e.body?.slice(0, 400) })).slice(0, 40),
    current_pipeline: pipelineRows || [],
    current_urgent_issues: urgentRows || [],
    roster: artistRows || [],
    existing_buyers: (buyerRows || []).map(b => ({ email: b.email, name: b.name, company: b.company })),
    targets: (targetRows || []).map(t => ({ id: t.id, artist_slug: t.artist_slug, promoter: t.promoter, contact: t.contact, status: t.status })),
  }, null, 2);

  try {
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });
    const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
    // Extract JSON — Claude may wrap in prose
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('No JSON found in Claude response');
    const parsed = JSON.parse(m[0]);
    if (!parsed.summary) parsed.summary = '(no summary)';
    if (!Array.isArray(parsed.urgent)) parsed.urgent = [];
    if (!Array.isArray(parsed.draft_replies)) parsed.draft_replies = [];
    if (!Array.isArray(parsed.new_buyers)) parsed.new_buyers = [];
    if (!Array.isArray(parsed.target_updates)) parsed.target_updates = [];
    // Validate artist slugs in urgent
    parsed.urgent = parsed.urgent.filter(u => validSlugs.has(u.artist_slug));
    log(`Claude returned: ${parsed.urgent.length} urgent, ${parsed.draft_replies.length} drafts, ${parsed.new_buyers.length} new buyers, ${parsed.target_updates.length} target updates`);
    return parsed;
  } catch (e) {
    recordError('claude', e);
    return null;
  }
}

// ─── outlook desktop draft via applescript ────────────────────────────────
function applescriptEscape(s) {
  // AppleScript string literals: escape \ and ", convert newlines to \n (literal)
  return String(s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n');
}
function createOutlookDraft({ to_email, subject, body }) {
  const tagged = `[AI DRAFT – REVIEW] ${subject || ''}`.slice(0, 240);
  const script = `
    tell application "Microsoft Outlook"
      set newMsg to make new outgoing message with properties {subject:"${applescriptEscape(tagged)}", content:"${applescriptEscape(body)}"}
      make new recipient at newMsg with properties {email address:{address:"${applescriptEscape(to_email)}"}}
    end tell
    return "OK"
  `;
  const tmp = path.join(os.tmpdir(), `corson_draft_${process.pid}_${Date.now()}.applescript`);
  fs.writeFileSync(tmp, script, 'utf8');
  try {
    const out = execFileSync('osascript', [tmp], { encoding: 'utf8', timeout: 15_000 });
    return out.trim() === 'OK';
  } catch (e) {
    throw new Error(`Outlook AppleScript: ${e.message.split('\n')[0].slice(0, 200)}`);
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

// ─── regenerate grids ─────────────────────────────────────────────────────
// Shells out to scripts/generate-grids.js so the Master Touring Grid and all
// per-artist Excel files reflect the briefing's fresh inserts. Logs a separate
// line to briefing-log.txt on success so Danny can see grid freshness without
// opening the full sync-log.
function regenerateGrids() {
  const remaining = TIMEOUT_MS - (Date.now() - START) - 10_000; // leave 10s for finalize
  if (remaining < 30_000) {
    log('skipping grid regen — not enough time budget remaining');
    return { ok: false, reason: 'low time budget' };
  }
  log('regenerating Excel grids…');
  try {
    const out = execFileSync('node', [path.join(PROJECT, 'scripts/generate-grids.js')], {
      encoding: 'utf8',
      cwd: PROJECT,
      timeout: Math.min(remaining, 180_000),
    });
    log(`grids regenerated (${out.split('\n').length} lines of output)`);
    return { ok: true };
  } catch (e) {
    recordError('grids', new Error(e.message?.split('\n')[0]?.slice(0, 200) || 'unknown'));
    return { ok: false, reason: e.message?.split('\n')[0] || 'unknown' };
  }
}
let gridsResult = null;

// ─── finalize ─────────────────────────────────────────────────────────────
let finalizeRan = false;
function finalize(extra = {}) {
  if (finalizeRan) return;
  finalizeRan = true;
  const status = extra.status || (errors.length > 0 ? 'ERROR' : 'OK');
  const ts = new Date();
  const pad = n => String(n).padStart(2, '0');
  const stamp = `${ts.getFullYear()}-${pad(ts.getMonth()+1)}-${pad(ts.getDate())} ${pad(ts.getHours())}:${pad(ts.getMinutes())}`;
  const line = `[${stamp}] status=${status} | emails=${counts.emails} | new=${counts.new} | shows=${counts.shows} | pipeline=${counts.pipeline} | urgent=${counts.urgent} | drafts=${counts.drafts}\n`;
  try {
    fs.mkdirSync(path.dirname(BRIEFING_LOG), { recursive: true });
    fs.appendFileSync(BRIEFING_LOG, line);
    if (gridsResult?.ok) fs.appendFileSync(BRIEFING_LOG, `[${stamp}] Grids regenerated\n`);
    else if (gridsResult) fs.appendFileSync(BRIEFING_LOG, `[${stamp}] Grids FAILED: ${gridsResult.reason}\n`);
  } catch (e) { console.error(`briefing log: ${e.message}`); }
  try {
    const header = `\n${'='.repeat(70)}\nDAILY BRIEFING RUN: ${ts.toISOString()}\n${'='.repeat(70)}\n`;
    const summary =
      `=== CORSON MORNING BRIEFING — ${stamp.slice(0,10)} ===\n` +
      `Status: ${status}\nEmails scanned: ${counts.emails}\nNew (not previously processed): ${counts.new}\n` +
      `Shows inserted: ${counts.shows}\nPipeline inserted: ${counts.pipeline}\nUrgent inserted: ${counts.urgent}\n` +
      `Activity logs: ${counts.activity}\nDrafts saved: ${counts.drafts}\nSkipped: ${counts.skipped}\n` +
      (errors.length ? `Errors:\n  - ${errors.join('\n  - ')}\n` : '') + (extra.reason ? `Reason: ${extra.reason}\n` : '');
    fs.appendFileSync(SYNC_LOG, header + summary);
  } catch (e) { console.error(`sync log: ${e.message}`); }

  console.log('\n' + '='.repeat(60));
  console.log(`CORSON DAILY BRIEFING — ${stamp} — ${status}`);
  console.log('='.repeat(60));
  console.log(`Emails scanned:         ${counts.emails}`);
  console.log(`New emails:             ${counts.new}`);
  console.log(`Shows inserted:         ${counts.shows}`);
  console.log(`Pipeline inserted:      ${counts.pipeline}`);
  console.log(`Urgent inserted:        ${counts.urgent}`);
  console.log(`Activity logs:          ${counts.activity}`);
  console.log(`Drafts saved:           ${counts.drafts}`);
  console.log(`New buyers (Rolodex):   ${counts.buyers || 0}`);
  console.log(`Target list updates:    ${counts.targets || 0}`);
  console.log(`Skipped:                ${counts.skipped}`);
  console.log(`Grids regenerated:      ${gridsResult?.ok ? 'yes' : (gridsResult ? 'FAILED (' + gridsResult.reason + ')' : 'not run')}`);
  if (intelligence?.summary) {
    console.log('\n' + '─'.repeat(60));
    console.log('INTELLIGENT SUMMARY');
    console.log('─'.repeat(60));
    console.log(intelligence.summary);
    if (intelligence.urgent?.length) {
      console.log('\nCLAUDE-FLAGGED URGENT ITEMS:');
      for (const u of intelligence.urgent) console.log(`  • [${u.artist_slug}] ${u.issue} — why: ${u.why_urgent} — action: ${u.suggested_action}`);
    }
    if (inserted.drafts.length) {
      console.log('\nDRAFTS SAVED TO OUTLOOK:');
      for (const d of inserted.drafts) console.log(`  ✓ to=${d.to_email}  subj="[AI DRAFT – REVIEW] ${d.subject}"`);
    }
  }
  if (inserted.shows.length)    { console.log('\n--- SHOWS ---');    inserted.shows.forEach(r => console.log(JSON.stringify(r))); }
  if (inserted.pipeline.length) { console.log('\n--- PIPELINE ---'); inserted.pipeline.forEach(r => console.log(JSON.stringify(r))); }
  if (inserted.urgent.length)   { console.log('\n--- URGENT ---');   inserted.urgent.forEach(r => console.log(JSON.stringify(r))); }
  if (skipped.length)           { console.log('\n--- SKIPPED ---');  skipped.slice(0, 60).forEach(s => console.log(`  ${s}`)); if (skipped.length > 60) console.log(`  … and ${skipped.length - 60} more`); }
  if (errors.length)            { console.log('\n--- ERRORS ---');   errors.forEach(e => console.log(`  ${e}`)); }
  clearTimeout(TIMEOUT_HANDLE);
}

// ─── main ─────────────────────────────────────────────────────────────────
(async function main() {
  let env, supabase, validSlugs;
  try {
    env = loadEnv();
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) throw new Error('Supabase creds missing');
    supabase = supabaseClient(env);
    validSlugs = await validArtistSlugs(supabase);
    log(`loaded ${validSlugs.size} artist slugs`);
    await probeProcessedEmails(supabase);
  } catch (e) { recordError('init', e); finalize({ status: 'ERROR', reason: 'init' }); process.exit(1); }

  let emails = [];
  try { log('scraping Outlook…'); emails = await scrapeOutlook(); counts.emails = emails.length; log(`scraped ${emails.length} emails`); }
  catch (e) { recordError('scrape', e); }

  // ─── message-id dedup + insert ────────────────────────────────────────
  const newEmails = [];
  for (const email of emails) {
    if (Date.now() - START > TIMEOUT_MS - 60_000) { errors.push('nearing timeout — stopping'); break; }
    const mid = messageIdFor(email);

    if (await isProcessed(supabase, mid)) { skipped.push(`already-processed: ${email.subject?.slice(0,60)}`); counts.skipped++; continue; }

    newEmails.push(email);
    counts.new++;

    const classifications = classifyEmail(email);
    let classifiedAs = classifications.map(c => c.kind).join(',') || 'none';
    if (classifications.length === 0) { skipped.push(`no triggers: ${email.subject?.slice(0,80)}`); counts.skipped++; }

    for (const c of classifications) {
      try {
        const { kind, row } = c;
        if (!row.artist_slug) { skipped.push(`${kind}: no artist — ${email.subject?.slice(0,60)}`); counts.skipped++; continue; }
        if (!validSlugs.has(row.artist_slug)) { skipped.push(`${kind}: unknown '${row.artist_slug}'`); counts.skipped++; continue; }
        if (kind === 'show') {
          if (!row.event_date) { skipped.push(`show no-date: ${row.artist_slug}`); counts.skipped++; continue; }
          if (await existsShow(supabase, row.artist_slug, row.event_date)) { skipped.push(`show dup: ${row.artist_slug} ${row.event_date}`); counts.skipped++; continue; }
          const { data, error } = await supabase.from('shows').insert(row).select().single();
          if (error) { recordError(`show ${row.artist_slug}`, error); continue; }
          inserted.shows.push(data); counts.shows++;
        } else if (kind === 'pipeline') {
          if (!row.event_date) { skipped.push(`pipeline no-date: ${row.artist_slug}`); counts.skipped++; continue; }
          if (await existsPipeline(supabase, row.artist_slug, row.event_date, row.stage)) { skipped.push(`pipeline dup: ${row.artist_slug} ${row.event_date} ${row.stage}`); counts.skipped++; continue; }
          const { data, error } = await supabase.from('pipeline').insert(row).select().single();
          if (error) { recordError(`pipeline ${row.artist_slug}`, error); continue; }
          inserted.pipeline.push(data); counts.pipeline++;
        } else if (kind === 'urgent') {
          if (await existsUrgent(supabase, row.artist_slug, row.issue)) { skipped.push(`urgent dup: ${row.artist_slug}`); counts.skipped++; continue; }
          const { data, error } = await supabase.from('urgent_issues').insert(row).select().single();
          if (error) { recordError(`urgent ${row.artist_slug}`, error); continue; }
          inserted.urgent.push(data); counts.urgent++;
        } else if (kind === 'activity') {
          if (await existsActivity(supabase, row.artist_slug, row.description)) { skipped.push(`activity dup: ${row.artist_slug}`); counts.skipped++; continue; }
          const { data, error } = await supabase.from('activity_log').insert(row).select().single();
          if (error) { recordError(`activity ${row.artist_slug}`, error); continue; }
          inserted.activity.push(data); counts.activity++;
        }
      } catch (e) { recordError(`insert ${c.kind}`, e); }
    }

    await markProcessed(supabase, mid, email.subject || null, email.from || null, classifiedAs);
  }

  // ─── claude intelligence layer ────────────────────────────────────────
  try {
    intelligence = await runClaudeLayer(env, supabase, newEmails, validSlugs);
  } catch (e) { recordError('intelligence', e); }

  // ─── insert Claude-flagged urgent issues ──────────────────────────────
  if (intelligence?.urgent?.length) {
    for (const u of intelligence.urgent) {
      try {
        if (!validSlugs.has(u.artist_slug)) continue;
        if (await existsUrgent(supabase, u.artist_slug, u.issue)) continue;
        const priority = ['High', 'Medium', 'Low'].includes(u.priority) ? u.priority : 'Medium';
        const row = { artist_slug: u.artist_slug, issue: u.issue, priority, resolved: false };
        const { data, error } = await supabase.from('urgent_issues').insert(row).select().single();
        if (error) { recordError(`claude-urgent ${u.artist_slug}`, error); continue; }
        inserted.urgent.push(data); counts.urgent++;
      } catch (e) { recordError(`claude-urgent`, e); }
    }
  }

  // ─── save draft replies to Outlook desktop ────────────────────────────
  if (intelligence?.draft_replies?.length) {
    for (const d of intelligence.draft_replies) {
      if (!d.to_email || !d.subject) continue;
      try {
        createOutlookDraft(d);
        inserted.drafts.push(d);
        counts.drafts++;
      } catch (e) { recordError(`draft ${d.to_email}`, e); }
    }
  }

  // ─── auto-insert new buyers into Rolodex ──────────────────────────────
  if (intelligence?.new_buyers?.length) {
    for (const b of intelligence.new_buyers) {
      if (!b.email) continue;
      const email = String(b.email).trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) continue;
      try {
        const { data: existing } = await supabase.from('buyers').select('id').ilike('email', email).limit(1);
        if (existing && existing.length > 0) { skipped.push(`buyer dup: ${email}`); counts.skipped++; continue; }
        const row = {
          name: b.name || null,
          email,
          company: b.company || null,
          market: b.market || null,
          status: 'Cold',
          notes: `[auto-imported from email ${new Date().toISOString().slice(0,10)}]`,
        };
        const { data, error: ierr } = await supabase.from('buyers').insert(row).select().single();
        if (ierr) { recordError(`buyer insert ${email}`, ierr); continue; }
        inserted.buyers = inserted.buyers || [];
        inserted.buyers.push(data);
        counts.buyers = (counts.buyers || 0) + 1;
        log(`  + Rolodex: ${b.name || '(no name)'} / ${b.company || '(no company)'} <${email}>`);
      } catch (e) { recordError(`buyer ${email}`, e); }
    }
  }

  // ─── auto-update target list outreach status ──────────────────────────
  if (intelligence?.target_updates?.length) {
    for (const u of intelligence.target_updates) {
      if (!u.target_id) continue;
      const statusWhitelist = ['Contacted', 'In Conversation', 'Offer Sent', 'Confirmed'];
      const newStatus = statusWhitelist.includes(u.new_status) ? u.new_status : 'Contacted';
      try {
        const { data: cur } = await supabase.from('targets').select('id, promoter, notes, status').eq('id', u.target_id).limit(1);
        if (!cur || cur.length === 0) { skipped.push(`target missing: ${u.target_id}`); counts.skipped++; continue; }
        const today = new Date().toISOString().slice(0, 10);
        const stampedNote = u.note ? `${today}: ${u.note}` : `${today}: contact logged`;
        const newNotes = cur[0].notes ? `${cur[0].notes}\n${stampedNote}` : stampedNote;
        const { error: uerr } = await supabase.from('targets').update({
          outreach_date: today,
          status: newStatus,
          notes: newNotes.slice(0, 2000),
        }).eq('id', u.target_id);
        if (uerr) { recordError(`target update ${u.target_id}`, uerr); continue; }
        counts.targets = (counts.targets || 0) + 1;
        log(`  ↻ Target: ${cur[0].promoter} → ${newStatus}`);
      } catch (e) { recordError(`target_update`, e); }
    }
  }

  // ─── regenerate excel grids from fresh Supabase state ─────────────────
  gridsResult = regenerateGrids();

  finalize();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { recordError('main', e); finalize({ status: 'ERROR', reason: 'unhandled main' }); process.exit(1); });

process.on('uncaughtException', e => { recordError('uncaught', e); finalize({ status: 'ERROR' }); process.exit(1); });
process.on('unhandledRejection', e => { recordError('unhandledRejection', e); finalize({ status: 'ERROR' }); process.exit(1); });
