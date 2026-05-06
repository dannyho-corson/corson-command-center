#!/usr/bin/env node
/**
 * draft-email.js — reusable Outlook draft creator
 *
 * Pattern A: `make new outgoing message at mail folder id 4` (the unified
 * Drafts folder). Adds TO/CC/BCC recipients, then re-queries the returned
 * id to confirm the draft is bound to Drafts. If verification fails, the
 * orphan is deleted and the script exits non-zero.
 *
 * Background: Outlook's `make new outgoing message` without an explicit
 * folder anchor can occasionally return a transient handle that is not
 * tied to any visible folder (the May 4 ghost-draft fluke). Anchoring at
 * mail folder id 4 + post-creation verification eliminates that class of
 * failure for offer-forward / confirmation / follow-up workflows.
 *
 * Args:
 *   --to <emails>          required, comma-separated
 *   --cc <emails>          optional, comma-separated
 *   --bcc <emails>         optional, comma-separated; bookings@ added
 *                          unless --no-default-bcc
 *   --no-default-bcc       skip the auto-BCC to bookings@corsonagency.com
 *   --subject <s>          required
 *   --body <s>             required; "-" reads from stdin
 *   --help                 print usage
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DRAFTS_FOLDER_ID = 4; // Outlook unified Drafts folder
const DEFAULT_BCC = 'bookings@corsonagency.com';

// ─── arg parsing ──────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq !== -1) {
      out[a.slice(2, eq)] = a.slice(eq + 1);
    } else {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        out[a.slice(2)] = next;
        i++;
      } else {
        out[a.slice(2)] = true;
      }
    }
  }
  return out;
}

function usage() {
  console.error(`Usage: node scripts/draft-email.js \\
    --to "a@x.com,b@x.com" \\
    [--cc "c@x.com"] \\
    [--bcc "d@x.com,e@x.com"] \\
    [--no-default-bcc] \\
    --subject "Subject line" \\
    --body "Body text"   (or --body=- to read from stdin)`);
}

const args = parseArgs(process.argv.slice(2));
if (args.help) { usage(); process.exit(0); }

if (!args.to || !args.subject || args.body === undefined) {
  console.error('ERROR: --to, --subject, and --body are required.');
  usage();
  process.exit(2);
}

if (args.body === '-' || args.body === true) {
  args.body = fs.readFileSync(0, 'utf8');
}

const splitAddrs = (s) => String(s || '')
  .split(',')
  .map(x => x.trim())
  .filter(Boolean);

const toAddrs = splitAddrs(args.to);
const ccAddrs = splitAddrs(args.cc);
const bccProvided = splitAddrs(args.bcc);
const bccAddrs = args['no-default-bcc']
  ? bccProvided
  : Array.from(new Set([DEFAULT_BCC, ...bccProvided]));

if (toAddrs.length === 0) {
  console.error('ERROR: --to had no valid addresses.');
  process.exit(2);
}

// ─── AppleScript build ────────────────────────────────────────────────────
function asEscape(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, '\\n');
}

const recipientLines = [
  ...toAddrs.map(a => `\tmake new recipient at newMsg with properties {email address:{address:"${asEscape(a)}"}}`),
  ...ccAddrs.map(a => `\tmake new cc recipient at newMsg with properties {email address:{address:"${asEscape(a)}"}}`),
  ...bccAddrs.map(a => `\tmake new bcc recipient at newMsg with properties {email address:{address:"${asEscape(a)}"}}`),
].join('\n');

const script = `tell application "Microsoft Outlook"
\tset targetFolder to mail folder id ${DRAFTS_FOLDER_ID}
\tset newMsg to make new outgoing message at targetFolder with properties {subject:"${asEscape(args.subject)}", content:"${asEscape(args.body)}"}
${recipientLines}
\tset returnedId to id of newMsg as string
\tset f to folder of newMsg
\tset fName to name of f
\tset fId to id of f as string
\tset toCount to count of to recipients of newMsg as string
\tset ccCount to count of cc recipients of newMsg as string
\tset bccCount to count of bcc recipients of newMsg as string
\treturn returnedId & "|" & fName & "|" & fId & "|" & toCount & "|" & ccCount & "|" & bccCount
end tell`;

// ─── execute ──────────────────────────────────────────────────────────────
const tmp = path.join(os.tmpdir(), `corson_draft_${process.pid}_${Date.now()}.applescript`);
fs.writeFileSync(tmp, script, 'utf8');

let raw;
try {
  raw = execFileSync('osascript', [tmp], { encoding: 'utf8', timeout: 15_000 });
} catch (e) {
  console.error(`ERROR: osascript failed: ${e.message.split('\n')[0]}`);
  try { fs.unlinkSync(tmp); } catch {}
  process.exit(1);
} finally {
  try { fs.unlinkSync(tmp); } catch {}
}

const parts = raw.trim().split('|');
if (parts.length !== 6) {
  console.error(`ERROR: malformed osascript output: "${raw.trim()}"`);
  process.exit(1);
}
const [draftId, folderName, folderId, toCount, ccCount, bccCount] = parts;

// ─── verification ─────────────────────────────────────────────────────────
const folderIdNum = parseInt(folderId, 10);
if (folderIdNum !== DRAFTS_FOLDER_ID) {
  console.error(`✗ VERIFY_FAILED: draft id=${draftId} ended up in folder=${folderName} (id=${folderId}) — expected Drafts (id=${DRAFTS_FOLDER_ID}). Attempting cleanup…`);
  try {
    execFileSync('osascript', [
      '-e',
      `tell application "Microsoft Outlook" to delete message id ${draftId}`
    ], { encoding: 'utf8', timeout: 10_000 });
    console.error(`✗ Cleanup: deleted orphan id=${draftId}`);
  } catch (e) {
    console.error(`✗ Cleanup FAILED for orphan id=${draftId}: ${e.message.split('\n')[0]}`);
  }
  process.exit(1);
}

console.log(`✓ Draft saved: id=${draftId} | folder=${folderName} (id=${folderId}) | TO=${toCount} CC=${ccCount} BCC=${bccCount}`);
process.exit(0);
