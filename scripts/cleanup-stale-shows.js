#!/usr/bin/env node
/*
 * One-off cleanup of stale rows in the `shows` table.
 *
 * Default mode: DRY RUN (selects only, prints, no delete).
 * --apply flag: actually deletes the matching rows.
 *
 * Rules (today hardcoded as 2026-04-30 for this run):
 *   A) deal_type = 'Settled'                           — any date
 *   B) deal_type IN ('Confirmed', 'Advancing') AND
 *      event_date < today                              — past active shows
 *
 * NEVER touched:
 *   - pipeline table (pre-confirmation deals)
 *   - activity_log (history is sacred)
 *   - processed_emails (briefing dedup)
 *   - future-dated Confirmed/Advancing shows
 *
 * Skips rows with null or malformed event_date and warns.
 */
const fs = require('fs');
const path = require('path');

const TODAY = '2026-04-30';
const APPLY = process.argv.includes('--apply');

const ENV_PATH = path.join(__dirname, '.env');
const raw = fs.readFileSync(ENV_PATH, 'utf8');
const env = {};
for (const line of raw.split('\n')) {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
const { createClient } = require(path.join(__dirname, '..', 'node_modules/@supabase/supabase-js/dist/index.cjs'));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function pad(s, n) {
  s = String(s ?? '');
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

function shortId(id) {
  return String(id || '').slice(0, 8);
}

(async () => {
  console.log(`Mode: ${APPLY ? 'APPLY (will DELETE rows)' : 'DRY RUN'} · today = ${TODAY}\n`);

  // Pull all shows of relevant deal_types — filter client-side to keep
  // skip-with-warn logic transparent.
  const { data: rows, error } = await sb
    .from('shows')
    .select('id, artist_slug, event_date, city, venue, deal_type, fee')
    .in('deal_type', ['Settled', 'Confirmed', 'Advancing'])
    .order('event_date', { ascending: true, nullsFirst: true });

  if (error) {
    console.error('select failed:', error.message);
    process.exit(1);
  }

  const matchA = []; // Settled (any date)
  const matchB = []; // Confirmed/Advancing past
  const skipped = []; // null/malformed dates among Confirmed/Advancing

  for (const r of rows) {
    if (r.deal_type === 'Settled') {
      matchA.push(r);
      continue;
    }
    // Confirmed / Advancing
    if (!r.event_date || typeof r.event_date !== 'string' || !ISO_DATE.test(r.event_date)) {
      skipped.push(r);
      continue;
    }
    if (r.event_date < TODAY) {
      matchB.push(r);
    }
    // else: future-dated — leave alone
  }

  // Print rows
  const all = [...matchA, ...matchB];
  if (all.length === 0) {
    console.log('No matching rows. Nothing to delete.');
    process.exit(0);
  }

  console.log(`| ${pad('id', 8)} | ${pad('artist_slug', 18)} | ${pad('event_date', 11)} | ${pad('city', 16)} | ${pad('venue', 28)} | ${pad('deal_type', 10)} | ${pad('fee', 10)} |`);
  console.log(`|${'-'.repeat(10)}|${'-'.repeat(20)}|${'-'.repeat(13)}|${'-'.repeat(18)}|${'-'.repeat(30)}|${'-'.repeat(12)}|${'-'.repeat(12)}|`);
  for (const r of all) {
    console.log(
      `| ${pad(shortId(r.id), 8)} | ${pad(r.artist_slug, 18)} | ${pad(r.event_date, 11)} | ${pad(r.city, 16)} | ${pad(r.venue, 28)} | ${pad(r.deal_type, 10)} | ${pad(r.fee, 10)} |`
    );
  }

  console.log(`\nWould delete: ${matchA.length} settled · ${matchB.length} past confirmed/advancing = ${all.length} rows total`);
  if (skipped.length) {
    console.log(`\nSkipped (null/malformed event_date — left alone):`);
    for (const r of skipped) {
      console.log(`  ! ${shortId(r.id)} ${r.artist_slug} deal_type=${r.deal_type} event_date=${JSON.stringify(r.event_date)}`);
    }
  }

  if (!APPLY) {
    console.log('\nDRY RUN — no changes made. Re-run with --apply to delete.');
    process.exit(0);
  }

  // APPLY
  console.log(`\nApplying — deleting ${all.length} rows…`);
  let deleted = 0;
  let errs = 0;
  for (const r of all) {
    const { error: delErr } = await sb.from('shows').delete().eq('id', r.id);
    if (delErr) {
      console.error(`  ERR ${shortId(r.id)} ${r.artist_slug}: ${delErr.message}`);
      errs++;
    } else {
      deleted++;
    }
  }
  console.log(`Done. deleted=${deleted} errors=${errs}`);
})();
