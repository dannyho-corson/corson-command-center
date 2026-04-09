#!/usr/bin/env node
/**
 * Corson Agency — Microsoft Graph Email Fetcher
 * Pulls last 30 days of inbox emails from dho@corsonagency.com
 * Saves as .eml files to ~/Desktop/outlook-emails/default/
 *
 * First run: opens a browser for one-time sign-in, saves token cache.
 * Subsequent runs: fully silent, no manual steps.
 *
 * Usage:
 *   node scripts/fetch-emails.mjs
 *   (AZURE_CLIENT_ID and AZURE_TENANT_ID must be in scripts/.env)
 */

import { readFile, writeFile, mkdir, access } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { exec } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── ENV ───────────────────────────────────────────────────────────────────────
try {
  const envContent = await readFile(join(__dirname, '.env'), 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
} catch { /* .env optional */ }

const CLIENT_ID = process.env.AZURE_CLIENT_ID;
const TENANT_ID = process.env.AZURE_TENANT_ID || 'common';
const OUTPUT_DIR = `${process.env.HOME}/Desktop/outlook-emails/default`;
const TOKEN_CACHE_FILE = join(__dirname, '.graph-token-cache.json');
const DAYS_BACK = 30;

if (!CLIENT_ID) {
  console.error('ERROR: AZURE_CLIENT_ID not set. Add it to scripts/.env');
  console.error('See scripts/GRAPH_SETUP.md for registration instructions.');
  process.exit(1);
}

// ── MSAL SETUP ────────────────────────────────────────────────────────────────
const { PublicClientApplication, InteractionRequiredAuthError } = await import('@azure/msal-node');

// Persistent token cache — survives between runs
class PersistentCache {
  constructor(path) { this.path = path; this._data = ''; }
  async load() {
    try { this._data = await readFile(this.path, 'utf8'); } catch { this._data = ''; }
    return this._data;
  }
  async save(data) {
    this._data = data;
    await writeFile(this.path, data, 'utf8');
  }
  beforeCacheAccess(ctx) { ctx.tokenCache.deserialize(this._data); }
  afterCacheAccess(ctx) {
    if (ctx.cacheHasChanged) {
      this.save(ctx.tokenCache.serialize()).catch(() => {});
    }
  }
}

const cache = new PersistentCache(TOKEN_CACHE_FILE);
await cache.load();

const msalConfig = {
  auth: {
    clientId: CLIENT_ID,
    authority: `https://login.microsoftonline.com/${TENANT_ID}`,
  },
  cache: {
    cachePlugin: cache,
  },
};

const pca = new PublicClientApplication(msalConfig);

const SCOPES = ['Mail.Read', 'offline_access', 'User.Read'];

// ── AUTH ──────────────────────────────────────────────────────────────────────
async function getAccessToken() {
  // Try silent auth with any cached account first
  const accounts = await pca.getTokenCache().getAllAccounts();

  if (accounts.length > 0) {
    try {
      const result = await pca.acquireTokenSilent({
        scopes: SCOPES,
        account: accounts[0],
      });
      console.log(`Authenticated silently as: ${result.account.username}`);
      return result.accessToken;
    } catch (err) {
      if (!(err instanceof InteractionRequiredAuthError)) throw err;
      console.log('Silent auth expired — need to re-authenticate interactively.');
    }
  }

  // First run or token expired — use device code flow (no browser redirect needed)
  console.log('\nFirst-time setup: You need to sign in once.\n');
  const deviceCodeRequest = {
    scopes: SCOPES,
    deviceCodeCallback: (response) => {
      console.log('─'.repeat(60));
      console.log(response.message);
      console.log('─'.repeat(60));
      // Try to open the URL automatically
      exec(`open "${response.verificationUri}"`, () => {});
    },
  };

  const result = await pca.acquireTokenByDeviceCode(deviceCodeRequest);
  console.log(`\nSigned in as: ${result.account.username}`);
  return result.accessToken;
}

// ── GRAPH API HELPERS ─────────────────────────────────────────────────────────
async function graphGet(accessToken, path, params = {}) {
  const url = new URL(`https://graph.microsoft.com/v1.0${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const { default: fetch } = await import('node-fetch');
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Graph API error ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function graphGetRaw(accessToken, path) {
  const { default: fetch } = await import('node-fetch');
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'text/plain',
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Graph API raw error ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.text();
}

// ── EML FILENAME HELPERS ──────────────────────────────────────────────────────
function safeFilename(str, maxLen = 60) {
  return (str || 'email')
    .replace(/[/\\:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, maxLen);
}

function emailId(messageId, subject, date) {
  return createHash('md5')
    .update(`${messageId}|${subject}|${date}`)
    .digest('hex')
    .slice(0, 8);
}

// ── LOAD PROCESSED IDS ────────────────────────────────────────────────────────
const PROCESSED_FILE = join(__dirname, '.processed-emails.json');
async function loadProcessed() {
  try { return new Set(JSON.parse(await readFile(PROCESSED_FILE, 'utf8'))); }
  catch { return new Set(); }
}
async function saveProcessed(set) {
  await writeFile(PROCESSED_FILE, JSON.stringify([...set], null, 2));
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Corson Agency — Graph Email Fetcher');
  console.log(`Output: ${OUTPUT_DIR}`);

  // Ensure output directory exists
  await mkdir(OUTPUT_DIR, { recursive: true });

  // Auth
  const accessToken = await getAccessToken();

  // Build date filter — last 30 days
  const since = new Date();
  since.setDate(since.getDate() - DAYS_BACK);
  const sinceISO = since.toISOString();

  console.log(`\nFetching inbox emails since ${since.toLocaleDateString()}...`);

  // Load already-processed message IDs
  const processed = await loadProcessed();
  let fetched = 0, saved = 0, skipped = 0, errors = 0;

  // Paginate through inbox messages
  let nextLink = null;
  const initialParams = {
    '$filter': `receivedDateTime ge ${sinceISO}`,
    '$orderby': 'receivedDateTime desc',
    '$select': 'id,subject,from,receivedDateTime,internetMessageId',
    '$top': '50',
  };

  let pageData = await graphGet(accessToken, '/me/mailFolders/inbox/messages', initialParams);

  while (true) {
    const messages = pageData.value || [];
    fetched += messages.length;

    for (const msg of messages) {
      const msgId = msg.id;
      const subject = msg.subject || '(no subject)';
      const date = msg.receivedDateTime || '';
      const dedupKey = msg.internetMessageId || emailId(msgId, subject, date);

      if (processed.has(dedupKey)) {
        skipped++;
        continue;
      }

      // Fetch raw MIME content (.eml format)
      try {
        const rawMime = await graphGetRaw(accessToken, `/me/messages/${msgId}/$value`);

        // Build filename: date_subject_id.eml
        const dateStr = date ? date.slice(0, 10) : 'unknown';
        const subjectStr = safeFilename(subject);
        const shortId = emailId(msgId, subject, date);
        const filename = `${dateStr}_${subjectStr}_${shortId}.eml`;
        const filePath = join(OUTPUT_DIR, filename);

        await writeFile(filePath, rawMime, 'utf8');
        processed.add(dedupKey);
        saved++;

        console.log(`  ✓ ${filename.slice(0, 70)}`);

        // Small delay to be polite to the API
        await new Promise(r => setTimeout(r, 100));
      } catch (err) {
        console.error(`  ✗ Error saving "${subject}": ${err.message}`);
        errors++;
      }
    }

    // Follow pagination
    const next = pageData['@odata.nextLink'];
    if (!next || messages.length === 0) break;

    const { default: fetch } = await import('node-fetch');
    const res = await fetch(next, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) break;
    pageData = await res.json();
  }

  await saveProcessed(processed);

  console.log('\n' + '─'.repeat(50));
  console.log(`Fetched:  ${fetched} messages from Graph API`);
  console.log(`Saved:    ${saved} new .eml files`);
  console.log(`Skipped:  ${skipped} already processed`);
  console.log(`Errors:   ${errors}`);
  console.log('─'.repeat(50));

  if (errors > 0) process.exit(1);
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
