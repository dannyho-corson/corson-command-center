#!/usr/bin/env node
/*
 * send-avails.js — email an artist-availability block to a buyer via Outlook
 * desktop (AppleScript). Wraps scripts/get-avails.js and renders an HTML
 * body, then logs the send into Supabase activity_log for traceability.
 *
 *   node scripts/send-avails.js \
 *     --artists shogun,anoluxx,mad-dog,junkie-kid \
 *     --to "sisraeli78@yahoo.com" \
 *     --name "Sagiv" \
 *     --from 2026-05-01 \
 *     --to-date 2026-12-31
 *
 * Prereq: Outlook desktop signed in as dho@corsonagency.com.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const PROJECT = path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
const env = {};
for (const line of raw.split('\n')) { const i = line.indexOf('='); if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
const { createClient } = require(path.join(PROJECT, 'node_modules/@supabase/supabase-js/dist/index.cjs'));
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

const { getAvails, formatAvailsHtml } = require('./get-avails');

function parseArgv(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      out[key] = val;
    }
  }
  return out;
}

function buildSubject(results) {
  const names = results.map(r => r.displayName).join(', ');
  return `Artist Availability — ${names}`;
}

function buildHtmlEmail({ greetingName, payload }) {
  const intro = `<p>Hi ${escapeHtml(greetingName || 'there')},</p>
<p>Here's current Fri/Sat availability across the artists below. Happy to run any of these down for a specific date / market — let me know what you're looking at.</p>`;
  const core = formatAvailsHtml(payload);
  const closing = `<p>Best,<br>Danny</p>`;
  return `<html><body style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #111;">${intro}${core}${closing}</body></html>`;
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function sendOutlook({ to, subject, html }) {
  // Write the whole script to a temp file so newlines + tags pass through cleanly.
  const tmp = path.join(os.tmpdir(), `corson_avail_${process.pid}_${Date.now()}.applescript`);
  // Escape AppleScript string literals: backslash and double quote.
  const esc = s => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const script = `
tell application "Microsoft Outlook"
  set newMessage to make new outgoing message with properties {subject:"${esc(subject)}", content:"${esc(html)}"}
  make new recipient at newMessage with properties {email address:{address:"${esc(to)}"}}
  send newMessage
end tell
return "OK"
`;
  fs.writeFileSync(tmp, script, 'utf8');
  try {
    const out = execFileSync('osascript', [tmp], { encoding: 'utf8', timeout: 20_000 });
    return out.trim() === 'OK';
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

async function logActivity(slugs, to, subject) {
  const today = new Date().toISOString().slice(0, 10);
  const description = `Sent avails email to ${to} — subject "${subject}" (${today})`;
  // One activity_log row per artist so it shows up on each artist's feed.
  for (const slug of slugs) {
    const { error } = await supabase.from('activity_log').insert({
      artist_slug: slug,
      action: 'avails_sent',
      description: description.slice(0, 500),
    });
    if (error) console.error(`activity_log ${slug}: ${error.message}`);
  }
}

(async () => {
  const args = parseArgv(process.argv.slice(2));
  const slugs = (args.artists || '').split(',').map(s => s.trim()).filter(Boolean);
  const to = args.to || null;
  const greetingName = args.name || null;
  const from = args.from || null;
  const toDate = args['to-date'] || args.toDate || null;
  if (!slugs.length || !to || !from || !toDate) {
    console.error('Usage: node scripts/send-avails.js --artists slug1,slug2 --to email --name "First" --from YYYY-MM-DD --to-date YYYY-MM-DD');
    process.exit(2);
  }

  console.log(`Computing avails for ${slugs.join(', ')} (${from} → ${toDate})…`);
  const payload = await getAvails(slugs, from, toDate);
  const subject = buildSubject(payload.results);
  const html = buildHtmlEmail({ greetingName, payload });

  console.log(`Subject: ${subject}`);
  console.log(`Sending to: ${to}`);
  const ok = sendOutlook({ to, subject, html });
  if (!ok) { console.error('Outlook send did not return OK'); process.exit(1); }
  console.log('Sent.');

  await logActivity(slugs, to, subject);
  console.log(`Logged ${slugs.length} activity_log entries.`);
})().catch(e => { console.error('fatal:', e.message); process.exit(1); });
