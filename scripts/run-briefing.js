#!/usr/bin/env node
/*
 * Corson Daily Briefing — standalone runner
 *
 * Reads today's emails from Outlook Web (outlook.office365.com) in an
 * already-open Chrome tab, classifies booking-relevant content, and pushes
 * to Supabase. Appends a one-line status to the briefing log.
 *
 * Usage:  node scripts/run-briefing.js
 *
 * Requirements:
 *   - Chrome running with a tab on outlook.office365.com (signed in)
 *   - Chrome's hidden menu: View → Developer → Allow JavaScript from Apple Events (enabled once)
 *   - scripts/.env with SUPABASE_URL and SUPABASE_ANON_KEY
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

// ─── constants ────────────────────────────────────────────────────────────
const HOME = os.homedir();
const PROJECT = path.join(HOME, 'corson-command-center');
const ENV_PATH = path.join(PROJECT, 'scripts/.env');
const BRIEFING_LOG = path.join(HOME, 'Documents/Corson Agency/Exports/briefing-log.txt');
const SYNC_LOG = path.join(PROJECT, 'scripts/sync-log.txt');
const TIMEOUT_MS = 8 * 60 * 1000;
const START = Date.now();

// Hard stop after 8 minutes regardless of what's running.
const TIMEOUT_HANDLE = setTimeout(() => {
  finalize({ status: 'TIMEOUT', reason: '8-minute timeout exceeded' });
  process.exit(1);
}, TIMEOUT_MS);
TIMEOUT_HANDLE.unref?.();

// ─── counters (shared across steps so finalize() sees real values) ────────
const counts = { emails: 0, shows: 0, pipeline: 0, urgent: 0, activity: 0, skipped: 0 };
const inserted = { shows: [], pipeline: [], urgent: [], activity: [] };
const skipped = [];
const errors = [];

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
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    out[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return out;
}

// ─── chrome bridge ────────────────────────────────────────────────────────
function runChromeJS(jsSource) {
  // Wrap user JS so it always returns a JSON string (even on error).
  const wrapped =
    '(function(){try{var result=(function(){' + jsSource + '})();' +
    'return JSON.stringify({ok:true,value:result});}catch(e){' +
    'return JSON.stringify({ok:false,error:String(e&&e.message||e)});}})();';

  // Write JS to a temp file — AppleScript reads it, avoiding all quote-escape hell.
  const tmpJS = path.join(os.tmpdir(), `corson_chrome_${process.pid}.js`);
  fs.writeFileSync(tmpJS, wrapped, 'utf8');

  const applescript = `
    set jsSource to read POSIX file "${tmpJS}" as «class utf8»
    tell application "Google Chrome"
      set mailTab to missing value
      set outlookTab to missing value
      -- Prefer a tab on the mail/inbox path; fall back to any outlook tab
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
    throw new Error(`AppleScript failed: ${e.message}. Check that Chrome is running, View → Developer → Allow JavaScript from Apple Events is enabled, and Outlook is loaded.`);
  } finally {
    try { fs.unlinkSync(tmpJS); } catch {}
  }
  const trimmed = stdout.trim();
  if (!trimmed) return { ok: false, error: 'Empty response from Chrome (JS returned nothing — is "Allow JavaScript from Apple Events" enabled?)' };
  let parsed;
  try { parsed = JSON.parse(trimmed); } catch { return { ok: false, error: `Non-JSON response: ${trimmed.slice(0, 200)}` }; }
  return parsed;
}

// ─── outlook scraping ─────────────────────────────────────────────────────
function scrapeOutlook() {
  // Single-call synchronous extraction. Outlook's row aria-label contains
  // sender + subject + time + preview — enough for keyword classification
  // without having to click through each email (fragile UI automation).
  const result = runChromeJS(`
    var rows = Array.from(document.querySelectorAll('[role="option"][aria-label]'));
    // Filter out folder-tree rows
    rows = rows.filter(function(r){
      var a = r.getAttribute('aria-label') || '';
      return a.length > 30 && !r.closest('[role="tree"]');
    });
    // Today's emails: Outlook shows "H:MM AM/PM" for today, dates otherwise
    var todayRows = rows.filter(function(r){
      return /\\b\\d{1,2}:\\d{2}\\s?(AM|PM)\\b/i.test(r.getAttribute('aria-label') || '');
    });

    var emails = todayRows.map(function(r){
      var label = r.getAttribute('aria-label') || '';
      // Strip leading state flags: "Collapsed", "Has attachments", "Replied", "Forwarded"
      var cleaned = label.replace(/^(Collapsed|Expanded|Has attachments|Replied|Forwarded|Flagged|Unread|Read)\\s+/gi, '')
                         .replace(/^(Collapsed|Expanded|Has attachments|Replied|Forwarded|Flagged|Unread|Read)\\s+/gi, '')
                         .replace(/^(Collapsed|Expanded|Has attachments|Replied|Forwarded|Flagged|Unread|Read)\\s+/gi, '');
      // Split at the time marker: before = sender+subject, after = preview
      var timeMatch = cleaned.match(/\\s(\\d{1,2}:\\d{2}\\s?(?:AM|PM))\\s/i);
      var head = cleaned, time = '', preview = '';
      if (timeMatch) {
        head = cleaned.slice(0, timeMatch.index).trim();
        time = timeMatch[1];
        preview = cleaned.slice(timeMatch.index + timeMatch[0].length).trim();
      }
      // Head usually looks like "Sender Name Subject Line" — naive split at first ALL-CAPS or known sep
      // Just use the whole head as context.
      return {
        ariaLabel: label,
        subject: head,
        from: head.split(/;|,/)[0].trim(),
        time: time,
        body: preview, // preview text — classification input
        date: new Date().toISOString().slice(0, 10)
      };
    });

    return emails;
  `);

  if (!result.ok) throw new Error(result.error);
  return result.value || [];
}

// ─── classification ───────────────────────────────────────────────────────
const ARTIST_PATTERNS = [
  // slug → array of regex patterns (case-insensitive)
  // Priority 12
  ['junkie-kid',   [/\bjunkie[\s-]?kid\b/i]],
  ['clawz',        [/\bclawz\b/i]],
  ['hellbound',    [/\bhellbound!?\b/i]],
  ['drakk',        [/\bdrakk\b/i]],
  ['triptykh',     [/\btriptykh\b/i]],
  ['morelia',      [/\bmorelia\b/i]],
  ['ketting',      [/\bketting\b/i]],
  ['mad-dog',      [/\bmad[\s-]?dog\b/i]],
  ['anime',        [/\bdj\s?anime\b/i, /\banime\b/i]],
  ['shogun',       [/\bshogun\b/i]],
  ['dr-greco',     [/\bdr\.?\s?greco\b/i, /\bgreco\b/i]],
  // Rest of roster
  ['water-spirit', [/\bwater[\s-]?spirit\b/i]],
  ['dea-magna',    [/\bdea[\s-]?magna\b/i]],
  ['jenna-shaw',   [/\bjenna[\s-]?shaw\b/i]],
  ['jay-toledo',   [/\bjay[\s-]?toledo\b/i]],
  ['naomi-luna',   [/\bnaomi[\s-]?luna\b/i]],
  ['gioh-cecato',  [/\bgioh[\s-]?cecato\b/i]],
  ['pixie-dust',   [/\bpixie[\s-]?dust\b/i]],
  ['death-code',   [/\bdeath[\s-]?code\b/i]],
  ['taylor-torrence', [/\btaylor[\s-]?torrence\b/i]],
  ['sihk',         [/\bsihk\b/i]],
  ['lara-klart',   [/\blara[\s-]?klart\b/i]],
  ['cyboy',        [/\bcyboy\b/i]],
  ['mandy',        [/\bmandy\b/i]],
  ['fernanda-martins', [/\bfernanda[\s-]?martins\b/i]],
  ['tnt',          [/\btnt\b/i]],
  ['dual-damage',  [/\bdual[\s-]?damage\b/i]],
  ['the-purge',    [/\bthe[\s-]?purge\b/i]],
  ['casska',       [/\bcasska\b/i]],
];

const SHOW_TRIGGERS     = /\b(confirmed|confirmado|contract signed|deposit paid|advancing|settlement)\b/i;
const PIPELINE_TRIGGERS = /\b(offer|hold|inquiry|avail(ability)? check|avail|negotiat|fee range|request)\b/i;
const URGENT_TRIGGERS   = /\b(payment missing|visa problem|no response|advancing stalled|deposit overdue|waiting on|no reply|unresolved|action needed|unsigned|unpaid|mia)\b/i;

function detectArtistSlug(text) {
  for (const [slug, patterns] of ARTIST_PATTERNS) {
    for (const p of patterns) if (p.test(text)) return slug;
  }
  return null;
}

function detectStage(text) {
  if (/\bnegotiat/i.test(text))                    return 'Negotiating';
  if (/\boffer\b/i.test(text))                     return 'Offer In';
  if (/\bhold\b/i.test(text))                      return 'Hold';
  if (/\b(avail|inquiry|request)\b/i.test(text))   return 'Inquiry';
  return 'Inquiry';
}

const MONTH_NAMES = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12,
  january:1,february:2,march:3,april:4,june:6,july:7,august:8,september:9,october:10,november:11,december:12 };

function extractDate(text) {
  // ISO
  let m = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (m) return m[0];
  // MM/DD/YYYY or MM-DD-YYYY
  m = text.match(/\b(\d{1,2})[-/](\d{1,2})[-/](20\d{2})\b/);
  if (m) return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  // MM.DD.YY or M.D.YY (two-digit year → 20YY)
  m = text.match(/\b(\d{1,2})[./](\d{1,2})[./](\d{2})\b/);
  if (m) return `20${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  // Month-name formats: "April 25", "April 25 2026", "Apr 25", "25 April", "25 Apr 2026"
  const mName = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*';
  let re = new RegExp(`\\b(${mName})\\s+(\\d{1,2})(?:\\s*,?\\s*(20\\d{2}))?\\b`, 'i');
  m = text.match(re);
  if (m) {
    const mon = MONTH_NAMES[m[1].toLowerCase().slice(0, 4)] || MONTH_NAMES[m[1].toLowerCase().slice(0, 3)];
    const yr = m[3] || new Date().getFullYear();
    if (mon) return `${yr}-${String(mon).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
  }
  re = new RegExp(`\\b(\\d{1,2})\\s+(${mName})(?:\\s+(20\\d{2}))?\\b`, 'i');
  m = text.match(re);
  if (m) {
    const mon = MONTH_NAMES[m[2].toLowerCase().slice(0, 4)] || MONTH_NAMES[m[2].toLowerCase().slice(0, 3)];
    const yr = m[3] || new Date().getFullYear();
    if (mon) return `${yr}-${String(mon).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  }
  return null;
}

function extractFee(text) {
  // Prefer $X,XXX / $X,XXX+HGR / €X,XXX patterns — preserve exactly as seen
  const m = text.match(/[€$£]\s?\d{1,3}(?:,\d{3})*(?:\.\d+)?(?:\s?\+?\s?(?:HGR|G\+R|ATA))?/i);
  return m ? m[0].replace(/\s+/g, '') : null;
}

function extractCityVenue(text) {
  // Best-effort: look for "at <Venue>" and "in <City>" — loose
  const venue = text.match(/\bat\s+([A-Z][A-Za-z0-9 '&\-]{2,40})/);
  const city  = text.match(/\bin\s+([A-Z][A-Za-z \-]{2,30})/);
  return { venue: venue?.[1]?.trim() || null, city: city?.[1]?.trim() || null };
}

function classifyEmail(email) {
  const hay = `${email.subject}\n${email.ariaLabel}\n${email.body}`;
  const artist_slug = detectArtistSlug(hay);
  const event_date = extractDate(hay);
  const fee = extractFee(hay);
  const { venue, city } = extractCityVenue(hay);

  // Short, clean subject snippet for notes/issue
  const snippet = (email.subject || '').replace(/\s+/g, ' ').slice(0, 160);

  const classifications = [];
  const isShow = SHOW_TRIGGERS.test(hay);
  const isPipeline = PIPELINE_TRIGGERS.test(hay) && !isShow;
  const isUrgent = URGENT_TRIGGERS.test(hay);

  if (isShow) {
    classifications.push({
      kind: 'show',
      row: { artist_slug, event_date, city, venue, promoter: null, fee, deal_type: 'Confirmed' },
    });
  }
  if (isPipeline) {
    classifications.push({
      kind: 'pipeline',
      row: {
        artist_slug,
        stage: detectStage(hay),
        event_date, market: city, venue,
        buyer: null, buyer_company: null,
        fee_offered: fee,
        notes: `Auto-extracted ${new Date().toISOString().slice(0, 10)}: ${snippet}`.slice(0, 500),
      },
    });
  }
  if (isUrgent) {
    classifications.push({
      kind: 'urgent',
      row: { artist_slug, issue: snippet || 'urgent email flagged', priority: 'High', resolved: false },
    });
  }

  // Every classified email also becomes an activity entry
  if (classifications.length > 0 && artist_slug) {
    classifications.push({
      kind: 'activity',
      row: { artist_slug, action: 'email_processed', description: snippet.slice(0, 500) },
    });
  }

  return classifications;
}

// ─── supabase client ──────────────────────────────────────────────────────
function supabaseClient(env) {
  const cjsPath = path.join(PROJECT, 'node_modules/@supabase/supabase-js/dist/index.cjs');
  const { createClient } = require(cjsPath);
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
}

async function validArtistSlugs(supabase) {
  const { data, error } = await supabase.from('artists').select('slug');
  if (error) throw new Error(`artists fetch: ${error.message}`);
  return new Set(data.map((r) => r.slug));
}

async function existsShow(supabase, slug, date) {
  if (!slug || !date) return false;
  const { data } = await supabase.from('shows')
    .select('id').eq('artist_slug', slug).eq('event_date', date).limit(1);
  return (data?.length || 0) > 0;
}

async function existsPipeline(supabase, slug, date, stage) {
  if (!slug || !date) return false;
  const { data } = await supabase.from('pipeline')
    .select('id').eq('artist_slug', slug).eq('event_date', date).eq('stage', stage).limit(1);
  return (data?.length || 0) > 0;
}

async function existsUrgent(supabase, slug, issue) {
  if (!slug || !issue) return false;
  const { data } = await supabase.from('urgent_issues')
    .select('id').eq('artist_slug', slug).eq('issue', issue).eq('resolved', false).limit(1);
  return (data?.length || 0) > 0;
}

// ─── finalize: runs on every exit path ────────────────────────────────────
let finalizeRan = false;
function finalize(extra = {}) {
  if (finalizeRan) return;
  finalizeRan = true;
  const status = extra.status || (errors.length > 0 ? 'ERROR' : 'OK');
  const ts = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${ts.getFullYear()}-${pad(ts.getMonth() + 1)}-${pad(ts.getDate())} ${pad(ts.getHours())}:${pad(ts.getMinutes())}`;
  const line = `[${stamp}] status=${status} | emails=${counts.emails} | shows=${counts.shows} | pipeline=${counts.pipeline} | urgent=${counts.urgent}\n`;

  try {
    fs.mkdirSync(path.dirname(BRIEFING_LOG), { recursive: true });
    fs.appendFileSync(BRIEFING_LOG, line);
  } catch (e) {
    console.error(`Could not write briefing log: ${e.message}`);
  }

  // Also append to sync-log.txt for historical continuity
  try {
    const header = `\n======================================================================\nDAILY BRIEFING RUN: ${ts.toISOString()}\n======================================================================\n`;
    const summary =
      `=== CORSON MORNING BRIEFING — ${stamp.slice(0, 10)} ===\n` +
      `Status: ${status}\n` +
      `Emails scanned: ${counts.emails}\n` +
      `Shows inserted: ${counts.shows}\n` +
      `Pipeline deals inserted: ${counts.pipeline}\n` +
      `Urgent issues inserted: ${counts.urgent}\n` +
      `Activity logs inserted: ${counts.activity}\n` +
      `Skipped: ${counts.skipped}\n` +
      (errors.length ? `Errors:\n  - ${errors.join('\n  - ')}\n` : '') +
      (extra.reason ? `Reason: ${extra.reason}\n` : '');
    fs.appendFileSync(SYNC_LOG, header + summary);
  } catch (e) {
    console.error(`Could not write sync log: ${e.message}`);
  }

  // Terminal summary
  console.log('\n' + '='.repeat(60));
  console.log(`CORSON DAILY BRIEFING — ${stamp} — ${status}`);
  console.log('='.repeat(60));
  console.log(`Emails scanned:         ${counts.emails}`);
  console.log(`Shows inserted:         ${counts.shows}`);
  console.log(`Pipeline inserted:      ${counts.pipeline}`);
  console.log(`Urgent issues:          ${counts.urgent}`);
  console.log(`Activity logs:          ${counts.activity}`);
  console.log(`Skipped:                ${counts.skipped}`);
  if (inserted.shows.length)    { console.log('\n--- SHOWS ---');    inserted.shows.forEach((r) => console.log(JSON.stringify(r))); }
  if (inserted.pipeline.length) { console.log('\n--- PIPELINE ---'); inserted.pipeline.forEach((r) => console.log(JSON.stringify(r))); }
  if (inserted.urgent.length)   { console.log('\n--- URGENT ---');   inserted.urgent.forEach((r) => console.log(JSON.stringify(r))); }
  if (skipped.length)           { console.log('\n--- SKIPPED ---');  skipped.forEach((s) => console.log(`  ${s}`)); }
  if (errors.length)            { console.log('\n--- ERRORS ---');   errors.forEach((e) => console.log(`  ${e}`)); }
  clearTimeout(TIMEOUT_HANDLE);
}

// ─── main ─────────────────────────────────────────────────────────────────
(async function main() {
  let env, supabase, validSlugs;

  try {
    env = loadEnv();
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY missing from scripts/.env');
    supabase = supabaseClient(env);
    validSlugs = await validArtistSlugs(supabase);
    log(`loaded ${validSlugs.size} artist slugs from Supabase`);
  } catch (e) {
    recordError('init', e);
    finalize({ status: 'ERROR', reason: 'init failed' });
    process.exit(1);
  }

  let emails = [];
  try {
    log('scraping Outlook in Chrome…');
    emails = await scrapeOutlook();
    counts.emails = emails.length;
    log(`scraped ${emails.length} email(s) from today`);
  } catch (e) {
    recordError('scrape', e);
    // Continue — we may have zero emails but still want to log the run
  }

  for (const email of emails) {
    if (Date.now() - START > TIMEOUT_MS - 30_000) { errors.push('approaching timeout, stopping inserts'); break; }
    const classifications = classifyEmail(email);
    if (classifications.length === 0) {
      skipped.push(`no triggers: ${email.subject?.slice(0, 80) || '(no subject)'}`);
      counts.skipped++;
      continue;
    }

    for (const c of classifications) {
      try {
        const { kind, row } = c;

        if ((kind === 'show' || kind === 'pipeline' || kind === 'urgent' || kind === 'activity') && !row.artist_slug) {
          skipped.push(`${kind}: no artist detected — ${email.subject?.slice(0, 60)}`);
          counts.skipped++;
          continue;
        }
        if (!validSlugs.has(row.artist_slug)) {
          skipped.push(`${kind}: unknown slug '${row.artist_slug}' — ${email.subject?.slice(0, 60)}`);
          counts.skipped++;
          continue;
        }

        if (kind === 'show') {
          if (!row.event_date) {
            skipped.push(`show no-date: ${row.artist_slug} — ${email.subject?.slice(0, 60)}`);
            counts.skipped++; continue;
          }
          if (await existsShow(supabase, row.artist_slug, row.event_date)) {
            skipped.push(`show dup: ${row.artist_slug} ${row.event_date}`);
            counts.skipped++; continue;
          }
          const { data, error } = await supabase.from('shows').insert(row).select().single();
          if (error) { recordError(`show insert ${row.artist_slug}`, error); continue; }
          inserted.shows.push(data); counts.shows++;
        } else if (kind === 'pipeline') {
          if (!row.event_date) {
            skipped.push(`pipeline no-date: ${row.artist_slug} — ${email.subject?.slice(0, 60)}`);
            counts.skipped++; continue;
          }
          if (await existsPipeline(supabase, row.artist_slug, row.event_date, row.stage)) {
            skipped.push(`pipeline dup: ${row.artist_slug} ${row.event_date} ${row.stage}`);
            counts.skipped++; continue;
          }
          const { data, error } = await supabase.from('pipeline').insert(row).select().single();
          if (error) { recordError(`pipeline insert ${row.artist_slug}`, error); continue; }
          inserted.pipeline.push(data); counts.pipeline++;
        } else if (kind === 'urgent') {
          if (await existsUrgent(supabase, row.artist_slug, row.issue)) {
            skipped.push(`urgent dup: ${row.artist_slug} ${row.issue.slice(0, 40)}`);
            counts.skipped++; continue;
          }
          const { data, error } = await supabase.from('urgent_issues').insert(row).select().single();
          if (error) { recordError(`urgent insert ${row.artist_slug}`, error); continue; }
          inserted.urgent.push(data); counts.urgent++;
        } else if (kind === 'activity') {
          const { data, error } = await supabase.from('activity_log').insert(row).select().single();
          if (error) { recordError(`activity insert ${row.artist_slug}`, error); continue; }
          inserted.activity.push(data); counts.activity++;
        }
      } catch (e) {
        recordError(`classify/insert ${c.kind}`, e);
      }
    }
  }

  finalize();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => {
  recordError('main', e);
  finalize({ status: 'ERROR', reason: 'unhandled main error' });
  process.exit(1);
});

// Safety: if anything unhandled escapes, still write the log line
process.on('uncaughtException', (e) => { recordError('uncaughtException', e); finalize({ status: 'ERROR', reason: 'uncaughtException' }); process.exit(1); });
process.on('unhandledRejection', (e) => { recordError('unhandledRejection', e); finalize({ status: 'ERROR', reason: 'unhandledRejection' }); process.exit(1); });
