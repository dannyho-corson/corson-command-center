#!/usr/bin/env node
/*
 * Clean up garbled pipeline records in Supabase.
 *
 * Background: run-briefing.js occasionally dumps raw email-body snippets into
 * free-text columns (notes / venue / market / buyer) when the extractor can't
 * cleanly resolve fields. Those rows become unreadable on the kanban.
 *
 * This script:
 *   1. Pulls every pipeline row.
 *   2. Flags rows whose notes start with "Auto-extracted" OR whose free-text
 *      fields look like raw email bodies (long + containing common email
 *      markers: "SHOW UPDATE", "OFFER", "SUBMISSION", "re:", "fwd:", etc.).
 *   3. Sends up to 10 flagged rows per Claude API call (claude-sonnet-4-6)
 *      and asks Claude to extract { event_date, city, venue, buyer, fee, notes }.
 *   4. Writes the cleaned fields back to Supabase — pipeline.event_date /
 *      market / venue / buyer / fee_offered / notes.
 *
 *   node scripts/cleanup-pipeline.js           # dry run — reports only
 *   node scripts/cleanup-pipeline.js --apply   # actually writes changes
 */
const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');

const PROJECT = path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
const env = {};
for (const line of raw.split('\n')) {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const { createClient } = require(path.join(PROJECT, 'node_modules/@supabase/supabase-js/dist/index.cjs'));
const Anthropic = require(path.join(PROJECT, 'node_modules/@anthropic-ai/sdk')).default;

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
const claude = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const CLAUDE_MODEL = 'claude-sonnet-4-6';
const BATCH_SIZE = 10;

// ─── detection ────────────────────────────────────────────────────────────
const EMAIL_MARKERS = /\b(SHOW UPDATE|OFFER|SUBMISSION|AVAIL|AVAILABILITY|CONFIRMED|BOOKING|PROPOSAL|INQUIRY|HOLD|re:|fwd:|forwarded message|wrote:|on .{3,30} at .{3,30}|from: |to: |subject: |sent: )/i;

function looksGarbled(text) {
  if (!text) return false;
  const s = String(text).trim();
  if (s.length <= 30) return false;
  if (s.startsWith('Auto-extracted')) return true;
  if (EMAIL_MARKERS.test(s)) return true;
  return false;
}

function needsCleanup(row) {
  // Any of these being garbled triggers a re-parse
  if (looksGarbled(row.notes)) return true;
  if (looksGarbled(row.venue)) return true;
  if (looksGarbled(row.market)) return true;
  if (looksGarbled(row.buyer)) return true;
  if (looksGarbled(row.buyer_company)) return true;
  return false;
}

// ─── Claude extraction ────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You clean up garbled booking-pipeline records for Corson Agency (a hard-techno talent booking agency).

Each record has raw email-body text dumped into one or more fields. Your job: extract clean structured data from the garbled text plus any already-present fields, and return it as JSON.

For EACH record in the batch, return an object with these exact keys:
  - event_date: the show date in YYYY-MM-DD format, or null if unclear.
  - city: the city the show is in (just the city, e.g. "New York", "Berlin"), or null.
  - venue: the venue name (e.g. "Basement", "Output", "Tomorrowland"), or null.
  - buyer: the promoter/buyer contact person's name (e.g. "Angela Desimone"), or null.
  - fee: any dollar/euro amount mentioned as-is with currency symbol (e.g. "$2,500", "€3,000"), or null.
  - notes: a short clean one-line summary of what the email was about (< 200 chars). Never echo the raw garbled text.

Rules:
  - Preserve fee strings exactly as written — do NOT strip symbols or normalize.
  - If a field cannot be confidently extracted, use null rather than guessing.
  - Date formats like "2.7.26" mean Feb 7 2026 (US MM.DD.YY).
  - Return ONLY a JSON array of objects, same length and order as the input. No prose, no code fences.`;

async function extractBatch(batch) {
  const input = batch.map((r, i) => ({
    idx: i,
    current: {
      artist_slug: r.artist_slug,
      event_date: r.event_date,
      market: r.market,
      venue: r.venue,
      buyer: r.buyer,
      buyer_company: r.buyer_company,
      fee_offered: r.fee_offered,
      notes: r.notes,
    },
  }));

  const resp = await claude.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Extract clean fields for these ${batch.length} pipeline records:\n\n${JSON.stringify(input, null, 2)}` }],
  });

  const text = resp.content.map(b => b.type === 'text' ? b.text : '').join('').trim();
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  let parsed;
  try { parsed = JSON.parse(cleaned); } catch (e) {
    throw new Error(`Claude returned non-JSON: ${cleaned.slice(0, 200)}`);
  }
  if (!Array.isArray(parsed) || parsed.length !== batch.length) {
    throw new Error(`Claude returned ${Array.isArray(parsed) ? parsed.length : 'non-array'}, expected ${batch.length}`);
  }
  return parsed;
}

// ─── main ─────────────────────────────────────────────────────────────────
(async () => {
  console.log(`Mode: ${APPLY ? 'APPLY (writing changes)' : 'DRY RUN (no writes)'}\n`);

  const { data: rows, error } = await supabase
    .from('pipeline')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { console.error('load:', error.message); process.exit(1); }
  console.log(`Loaded ${rows.length} pipeline rows`);

  const dirty = rows.filter(needsCleanup);
  const clean = rows.length - dirty.length;
  console.log(`Clean (skipping):      ${clean}`);
  console.log(`Dirty (need re-parse): ${dirty.length}\n`);
  if (dirty.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  let fixed = 0, failed = 0, skippedNoData = 0;

  for (let i = 0; i < dirty.length; i += BATCH_SIZE) {
    const batch = dirty.slice(i, i + BATCH_SIZE);
    console.log(`\nBatch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(dirty.length / BATCH_SIZE)} — ${batch.length} rows`);

    let extracted;
    try { extracted = await extractBatch(batch); }
    catch (e) { console.log(`  Claude error: ${e.message}`); failed += batch.length; continue; }

    for (let j = 0; j < batch.length; j++) {
      const row = batch[j];
      const ex = extracted[j] || {};
      const slug = row.artist_slug || '(unknown)';

      // Build patch — only include fields Claude returned non-null for,
      // AND only when they'd actually change/improve the row.
      const patch = {};
      if (ex.event_date && /^\d{4}-\d{2}-\d{2}$/.test(ex.event_date)) patch.event_date = ex.event_date;
      if (ex.city) patch.market = ex.city;
      if (ex.venue) patch.venue = ex.venue;
      if (ex.buyer) patch.buyer = ex.buyer;
      if (ex.fee) patch.fee_offered = ex.fee;
      if (ex.notes) patch.notes = ex.notes;

      if (Object.keys(patch).length === 0) {
        skippedNoData++;
        console.log(`  - ${slug}: Claude extracted nothing usable — skipped`);
        continue;
      }

      if (APPLY) {
        const { error: uerr } = await supabase.from('pipeline').update(patch).eq('id', row.id);
        if (uerr) { console.log(`  ERR ${slug} (${row.id}): ${uerr.message}`); failed++; continue; }
      }
      fixed++;
      console.log(`  Fixed: ${slug} — extracted ${patch.market || '?'} ${patch.event_date || '?'}`);
    }
  }

  console.log(`\n──────────────────────────────────────────────────────`);
  console.log(`Summary (${APPLY ? 'applied' : 'dry-run'}):`);
  console.log(`  Rows scanned:              ${rows.length}`);
  console.log(`  Already clean:             ${clean}`);
  console.log(`  Fixed:                     ${fixed}`);
  console.log(`  Skipped (nothing usable):  ${skippedNoData}`);
  console.log(`  Failed:                    ${failed}`);
  if (!APPLY) console.log(`\nRe-run with --apply to persist changes.`);
})().catch(e => { console.error('fatal:', e.message); process.exit(1); });
