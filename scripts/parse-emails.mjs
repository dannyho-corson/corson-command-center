#!/usr/bin/env node
/**
 * Corson Agency — Email-to-Database Pipeline
 * Reads .eml / .msg files from ~/Desktop/outlook-emails/default/
 * Extracts booking data via Claude, pushes to Supabase.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... node scripts/parse-emails.mjs
 *   (or set key in scripts/.env)
 */

import { readdir, readFile, writeFile, appendFile, access } from 'fs/promises';
import { join, extname, basename, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

// ── ENV ───────────────────────────────────────────────────────────────────────
// Load .env from scripts/ dir if present
try {
  const envPath = join(__dirname, '.env');
  await access(envPath);
  const envContent = await readFile(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
} catch { /* .env not required */ }

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY not set. Add it to scripts/.env or export it in your shell.');
  process.exit(1);
}

// ── CONFIG ────────────────────────────────────────────────────────────────────
const EMAIL_DIR       = `${process.env.HOME}/Desktop/outlook-emails/default`;
const LOG_FILE        = join(__dirname, 'sync-log.txt');
const PROCESSED_FILE  = join(__dirname, '.processed-emails.json');

const SUPABASE_URL     = 'https://smueknsapnvyrdfnnkkq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtdWVrbnNhcG52eXJkZm5ua2txIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQxNzQsImV4cCI6MjA5MTA5MDE3NH0.ycYKQtF5JTb1bcDuRdFk-PrwNl15qf0f39ac2GzUWLc';

// ── IMPORTS ───────────────────────────────────────────────────────────────────
const Anthropic = (await import('@anthropic-ai/sdk')).default;
const { simpleParser } = await import('mailparser');
const { createClient } = await import('@supabase/supabase-js');

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const supabase  = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── LOGGING ───────────────────────────────────────────────────────────────────
const runStart  = new Date();
const logLines  = [];

function log(msg) {
  const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
  const line = `[${ts}] ${msg}`;
  console.log(line);
  logLines.push(line);
}

async function flushLog(summary) {
  const header = `\n${'='.repeat(70)}\nSYNC RUN: ${runStart.toLocaleString()}\n${'='.repeat(70)}`;
  const body   = logLines.join('\n');
  const footer = `\nSUMMARY: ${summary}\n`;
  await appendFile(LOG_FILE, header + '\n' + body + footer);
}

// ── PROCESSED TRACKING ────────────────────────────────────────────────────────
async function loadProcessed() {
  try { return new Set(JSON.parse(await readFile(PROCESSED_FILE, 'utf8'))); }
  catch { return new Set(); }
}

async function saveProcessed(set) {
  await writeFile(PROCESSED_FILE, JSON.stringify([...set], null, 2));
}

// ── EMAIL PARSING ─────────────────────────────────────────────────────────────
async function parseEml(filePath) {
  const raw = await readFile(filePath);
  const parsed = await simpleParser(raw);
  return {
    from:    parsed.from?.text || '',
    subject: parsed.subject   || '',
    date:    parsed.date?.toISOString() || '',
    body:    parsed.text      || parsed.html?.replace(/<[^>]+>/g, ' ') || '',
  };
}

async function parseMsg(filePath) {
  const MsgReader = require('@kenjiuno/msgreader');
  const raw = await readFile(filePath);
  const reader = new MsgReader.default(raw);
  const info = reader.getFileData();
  return {
    from:    info.senderEmail || info.senderName || '',
    subject: info.subject     || '',
    date:    info.messageDeliveryTime?.toISOString() || '',
    body:    info.body        || '',
  };
}

async function parseEmail(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.eml') return parseEml(filePath);
  if (ext === '.msg') return parseMsg(filePath);
  return null;
}

// ── ARTIST LOOKUP ─────────────────────────────────────────────────────────────
let _artistCache = null;

async function getArtists() {
  if (_artistCache) return _artistCache;
  const { data } = await supabase.from('artists').select('id, name, slug');
  _artistCache = data || [];
  return _artistCache;
}

function findArtistSlug(artistName, artists) {
  if (!artistName) return null;
  const needle = artistName.toLowerCase().trim();
  // Exact match first
  let match = artists.find(a => a.name.toLowerCase() === needle);
  if (match) return match.slug;
  // Partial match
  match = artists.find(a =>
    a.name.toLowerCase().includes(needle) || needle.includes(a.name.toLowerCase())
  );
  return match?.slug || null;
}

// ── AI EXTRACTION ─────────────────────────────────────────────────────────────
async function extractBookingData(email, artistNames) {
  const prompt = `You are a booking agent assistant for Corson Agency, a hard techno booking agency.
Analyze this email and extract booking information.

Artist names on our roster (for reference): ${artistNames.join(', ')}

Email:
FROM: ${email.from}
SUBJECT: ${email.subject}
DATE: ${email.date}
BODY:
${email.body.slice(0, 3000)}

Respond with ONLY valid JSON (no markdown, no explanation):
{
  "is_booking_related": true/false,
  "email_type": "offer" | "confirmation" | "inquiry" | "negotiation" | "cancellation" | "other",
  "artist_name": "exact name or null",
  "event_date": "YYYY-MM-DD or null",
  "city": "City, State or null",
  "venue": "venue name or null",
  "buyer_name": "contact person name or null",
  "buyer_company": "promoter/company name or null",
  "fee": "dollar amount as string e.g. $2500 or null",
  "notes": "any relevant notes, radius clauses, special conditions or null",
  "confidence": "high" | "medium" | "low"
}

Rules:
- is_booking_related: true only for actual booking offers, confirmations, inquiries, negotiations about shows/gigs
- email_type offer = promoter making a formal offer with fee
- email_type confirmation = show is confirmed/booked
- email_type inquiry = asking about availability or general interest
- email_type negotiation = back and forth on terms
- Emails about marketing, newsletters, non-booking topics = is_booking_related: false`;

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content[0]?.text?.trim() || '{}';
  try {
    return JSON.parse(text);
  } catch {
    log(`  WARN: Could not parse AI response: ${text.slice(0, 100)}`);
    return { is_booking_related: false };
  }
}

// ── DEDUP CHECKS ──────────────────────────────────────────────────────────────
async function dealExists(artistSlug, market, eventDate) {
  // Check pipeline
  let query = supabase.from('pipeline').select('id').eq('artist_slug', artistSlug);
  if (market) query = query.ilike('market', `%${market.split(',')[0].trim()}%`);
  if (eventDate) query = query.eq('event_date', eventDate);
  const { data: pData } = await query.limit(1);
  if (pData?.length > 0) return { exists: true, table: 'pipeline', id: pData[0].id };

  // Check shows
  let sQuery = supabase.from('shows').select('id').eq('artist_slug', artistSlug);
  if (eventDate) sQuery = sQuery.eq('event_date', eventDate);
  const { data: sData } = await sQuery.limit(1);
  if (sData?.length > 0) return { exists: true, table: 'shows', id: sData[0].id };

  return { exists: false };
}

// ── SUPABASE WRITES ───────────────────────────────────────────────────────────
async function insertPipeline(artistSlug, stage, extracted, emailFrom) {
  const artists = await getArtists();
  const artist  = artists.find(a => a.slug === artistSlug);

  const payload = {
    artist_slug,
    stage,
    event_date:    extracted.event_date   || null,
    market:        extracted.city          || null,
    venue:         extracted.venue         || null,
    buyer:         extracted.buyer_name    || emailFrom || null,
    buyer_company: extracted.buyer_company || null,
    fee_offered:   extracted.fee           || null,
    notes:         [
      extracted.notes || '',
      `Auto-imported from email. Confidence: ${extracted.confidence}`,
    ].filter(Boolean).join(' | ') || null,
  };

  const { data, error } = await supabase.from('pipeline').insert(payload).select().single();
  if (error) { log(`  ERROR inserting pipeline: ${error.message}`); return null; }

  // Log activity
  await supabase.from('activity_log').insert({
    artist_slug,
    action: 'deal_added',
    description: `Deal added via email sync: ${stage}${extracted.venue ? ` — ${extracted.venue}` : ''}${extracted.city ? ` in ${extracted.city}` : ''}${extracted.fee ? ` (${extracted.fee})` : ''}`,
  });

  return data;
}

async function insertShow(artistSlug, extracted, emailFrom) {
  const artists = await getArtists();
  const artist  = artists.find(a => a.slug === artistSlug);

  const payload = {
    artist_slug,
    artist_id:  artist?.id || null,
    event_date: extracted.event_date   || null,
    city:       extracted.city          || null,
    venue:      extracted.venue         || null,
    promoter:   extracted.buyer_company || extracted.buyer_name || emailFrom || null,
    fee:        extracted.fee           || null,
    deal_type:  'Confirmed',
    status:     'Active',
    notes:      [
      extracted.notes || '',
      `Auto-imported from email. Confidence: ${extracted.confidence}`,
    ].filter(Boolean).join(' | ') || null,
  };

  const { data, error } = await supabase.from('shows').insert(payload).select().single();
  if (error) { log(`  ERROR inserting show: ${error.message}`); return null; }

  // Log activity
  await supabase.from('activity_log').insert({
    artist_slug,
    action: 'show_added',
    description: `Show added via email sync: ${extracted.venue || ''}${extracted.city ? ` in ${extracted.city}` : ''}${extracted.event_date ? ` on ${extracted.event_date}` : ''}`,
  });

  // Also update pipeline to Confirmed if a matching deal exists
  if (artistSlug && extracted.city) {
    await supabase.from('pipeline')
      .update({ stage: 'Confirmed' })
      .eq('artist_slug', artistSlug)
      .ilike('market', `%${extracted.city.split(',')[0].trim()}%`)
      .in('stage', ['Offer In', 'Negotiating', 'Request']);
  }

  return data;
}

async function updatePipelineStage(id, stage) {
  await supabase.from('pipeline').update({ stage }).eq('id', id);
}

// ── PROCESS ONE EMAIL ─────────────────────────────────────────────────────────
async function processEmail(filePath, processed) {
  const filename = basename(filePath);
  log(`\nProcessing: ${filename}`);

  if (processed.has(filename)) {
    log('  SKIP: already processed');
    return 'skipped';
  }

  // Parse email
  let email;
  try {
    email = await parseEmail(filePath);
  } catch (err) {
    log(`  ERROR parsing email: ${err.message}`);
    return 'error';
  }
  if (!email) { log('  SKIP: unsupported format'); return 'skipped'; }

  log(`  From: ${email.from}`);
  log(`  Subject: ${email.subject}`);

  // Get artist list for AI context
  const artists = await getArtists();
  const artistNames = artists.map(a => a.name);

  // AI extraction
  let extracted;
  try {
    extracted = await extractBookingData(email, artistNames);
  } catch (err) {
    log(`  ERROR calling AI: ${err.message}`);
    return 'error';
  }

  if (!extracted.is_booking_related) {
    log(`  SKIP: not booking-related (type: ${extracted.email_type})`);
    processed.add(filename);
    return 'skipped';
  }

  log(`  Type: ${extracted.email_type} | Artist: ${extracted.artist_name} | Confidence: ${extracted.confidence}`);
  log(`  Venue: ${extracted.venue} | City: ${extracted.city} | Fee: ${extracted.fee} | Date: ${extracted.event_date}`);

  // Resolve artist slug
  const artistSlug = findArtistSlug(extracted.artist_name, artists);
  if (!artistSlug) {
    log(`  WARN: Could not match artist "${extracted.artist_name}" to roster — logging as unknown`);
    // Still log but with null artist_slug
  }

  // Dedup check
  if (artistSlug) {
    const dedup = await dealExists(artistSlug, extracted.city, extracted.event_date);
    if (dedup.exists) {
      log(`  SKIP: deal already exists in ${dedup.table} (id: ${dedup.id})`);
      // If existing pipeline deal and this is a confirmation, upgrade stage
      if (extracted.email_type === 'confirmation' && dedup.table === 'pipeline') {
        await updatePipelineStage(dedup.id, 'Confirmed');
        log(`  → Upgraded pipeline deal to Confirmed`);
      }
      processed.add(filename);
      return 'updated';
    }
  }

  // Route by email type
  let result = 'skipped';

  if (extracted.email_type === 'offer' || extracted.email_type === 'negotiation') {
    const stage = extracted.email_type === 'offer' ? 'Offer In' : 'Negotiating';
    if (artistSlug) {
      const row = await insertPipeline(artistSlug, stage, extracted, email.from);
      if (row) { log(`  ✓ Inserted into pipeline (${stage})`); result = 'inserted'; }
    } else {
      log(`  SKIP: no artist match — cannot insert`);
    }

  } else if (extracted.email_type === 'inquiry') {
    if (artistSlug) {
      const row = await insertPipeline(artistSlug, 'Request', extracted, email.from);
      if (row) { log(`  ✓ Inserted into pipeline (Request)`); result = 'inserted'; }
    } else {
      log(`  SKIP: no artist match — cannot insert`);
    }

  } else if (extracted.email_type === 'confirmation') {
    if (artistSlug) {
      const row = await insertShow(artistSlug, extracted, email.from);
      if (row) { log(`  ✓ Inserted into shows (Confirmed)`); result = 'inserted'; }
    } else {
      log(`  SKIP: no artist match — cannot insert`);
    }

  } else if (extracted.email_type === 'cancellation') {
    log(`  INFO: Cancellation email — manual review recommended`);
    result = 'skipped';
  }

  processed.add(filename);
  return result;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  log('Corson Agency — Email Sync Starting');
  log(`Email directory: ${EMAIL_DIR}`);

  // List email files
  let files;
  try {
    const entries = await readdir(EMAIL_DIR);
    files = entries
      .filter(f => ['.eml', '.msg'].includes(extname(f).toLowerCase()))
      .map(f => join(EMAIL_DIR, f));
  } catch (err) {
    log(`ERROR: Cannot read email directory: ${err.message}`);
    await flushLog('FAILED — directory not readable');
    process.exit(1);
  }

  if (files.length === 0) {
    log('No .eml or .msg files found — nothing to process');
    await flushLog('No emails to process');
    return;
  }

  log(`Found ${files.length} email file(s)`);

  const processed = await loadProcessed();
  const counts = { inserted: 0, updated: 0, skipped: 0, error: 0 };

  for (const filePath of files) {
    const result = await processEmail(filePath, processed);
    counts[result] = (counts[result] || 0) + 1;
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 500));
  }

  await saveProcessed(processed);

  const summary = `${files.length} emails processed — ${counts.inserted} inserted, ${counts.updated} updated, ${counts.skipped} skipped, ${counts.error} errors`;
  log(`\n${summary}`);
  log('Sync complete.');

  // Print summary to stdout for shell script capture
  console.log('\n' + '─'.repeat(50));
  console.log('SUMMARY REPORT');
  console.log('─'.repeat(50));
  console.log(`Run time:    ${runStart.toLocaleString()}`);
  console.log(`Emails:      ${files.length} found`);
  console.log(`Inserted:    ${counts.inserted} new deals/shows`);
  console.log(`Updated:     ${counts.updated} existing records`);
  console.log(`Skipped:     ${counts.skipped} (not booking-related or already processed)`);
  console.log(`Errors:      ${counts.error}`);
  console.log('─'.repeat(50));

  await flushLog(summary);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
