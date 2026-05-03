#!/usr/bin/env node
/*
 * One-off cleanup of stale rows in the `pipeline` table.
 *
 * Default mode: DRY RUN (selects only, prints, no delete).
 * --apply flag: actually deletes the matching rows.
 *
 * Sister to scripts/cleanup-stale-shows.js. Same shape, different table.
 *
 * Rules (today hardcoded as 2026-05-02 for this run):
 *   A) stage = 'Settled'                      — leftover drag-drop /
 *                                               briefing auto-confirms that
 *                                               never migrated to shows
 *   B) event_date < today                     — past-dated pipeline rows;
 *                                               the show date passed without
 *                                               ever confirming
 *   C) skeleton row: city, venue, buyer, AND  — briefing-extracted placeholder
 *      fee_offered ALL null/empty               that never got fleshed out
 *
 * Rows can match multiple rules — the Rule(s) column shows all that hit,
 * but each row is counted once in the unique total.
 *
 * NEVER touched:
 *   - shows table (cleaned in Phase 2.X)
 *   - activity_log, processed_emails, urgent_issues, buyers, artists,
 *     targets, reminders, campaigns
 *   - future-dated pipeline rows with real data
 *
 * Skip + warn for rows with null/malformed event_date that don't also
 * match Rule A or Rule C — those need eyes, not auto-delete.
 */
const fs = require('fs');
const path = require('path');

const TODAY = '2026-05-02';
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
function shortId(id) { return String(id || '').slice(0, 8); }
function isEmpty(v) { return v === null || v === undefined || String(v).trim() === ''; }

(async () => {
  console.log(`Mode: ${APPLY ? 'APPLY (will DELETE rows)' : 'DRY RUN'} · today = ${TODAY}\n`);

  const { data: rows, error } = await sb
    .from('pipeline')
    .select('id, artist_slug, stage, event_date, market, venue, buyer, buyer_company, fee_offered')
    .order('event_date', { ascending: true, nullsFirst: true });

  if (error) {
    console.error('select failed:', error.message);
    process.exit(1);
  }

  const totalPipeline = rows.length;

  // Per-rule sets, plus combined map for unique-row dedup
  const matchedById = new Map(); // id → { row, rules: Set<string> }
  const skipped = []; // null/malformed dates not also caught by A or C

  function note(row, rule) {
    if (!matchedById.has(row.id)) matchedById.set(row.id, { row, rules: new Set() });
    matchedById.get(row.id).rules.add(rule);
  }

  for (const r of rows) {
    let hitA = false, hitB = false, hitC = false;

    // Rule A — Settled in pipeline
    if (r.stage === 'Settled') {
      hitA = true;
      note(r, 'A');
    }

    // Rule C — skeleton row (city, venue, buyer/buyer_company, fee_offered all empty)
    // Treat the buyer column charitably: either `buyer` OR `buyer_company` set counts.
    const buyerEmpty = isEmpty(r.buyer) && isEmpty(r.buyer_company);
    // Pipeline location lives in `market` (no city column on this table).
    const locEmpty = isEmpty(r.market) && isEmpty(r.venue);
    if (locEmpty && buyerEmpty && isEmpty(r.fee_offered)) {
      hitC = true;
      note(r, 'C');
    }

    // Rule B — past-dated. Skip + warn for null/malformed unless A or C already caught it.
    if (!r.event_date || typeof r.event_date !== 'string' || !ISO_DATE.test(r.event_date)) {
      if (!hitA && !hitC) skipped.push(r);
    } else if (r.event_date < TODAY) {
      hitB = true;
      note(r, 'B');
    }
  }

  // Counts
  const ruleCounts = { A: 0, B: 0, C: 0 };
  for (const { rules } of matchedById.values()) {
    for (const rule of rules) ruleCounts[rule]++;
  }
  const uniqueTotal = matchedById.size;

  if (uniqueTotal === 0) {
    console.log('No matching rows. Nothing to delete.');
    if (skipped.length) {
      console.log(`\nSkipped (null/malformed event_date — left alone):`);
      for (const r of skipped) {
        console.log(`  ! ${shortId(r.id)} ${r.artist_slug} stage=${r.stage} event_date=${JSON.stringify(r.event_date)}`);
      }
    }
    process.exit(0);
  }

  // Print: order by event_date asc (null first), then by rule-set
  const all = [...matchedById.values()].sort((a, b) => {
    const da = a.row.event_date || '';
    const db = b.row.event_date || '';
    return da.localeCompare(db);
  });

  console.log(`| ${pad('Rule(s)', 7)} | ${pad('id', 8)} | ${pad('artist_slug', 18)} | ${pad('stage', 22)} | ${pad('event_date', 11)} | ${pad('market', 18)} | ${pad('buyer', 26)} | ${pad('fee_offered', 12)} |`);
  console.log(`|${'-'.repeat(9)}|${'-'.repeat(10)}|${'-'.repeat(20)}|${'-'.repeat(24)}|${'-'.repeat(13)}|${'-'.repeat(20)}|${'-'.repeat(28)}|${'-'.repeat(14)}|`);
  for (const { row: r, rules } of all) {
    const ruleStr = [...rules].sort().join('+');
    const buyerCol = r.buyer_company || r.buyer || '';
    console.log(
      `| ${pad(ruleStr, 7)} | ${pad(shortId(r.id), 8)} | ${pad(r.artist_slug, 18)} | ${pad(r.stage, 22)} | ${pad(r.event_date, 11)} | ${pad(r.market, 18)} | ${pad(buyerCol, 26)} | ${pad(r.fee_offered, 12)} |`
    );
  }

  console.log(
    `\nWould delete: ${ruleCounts.A} by Rule A · ${ruleCounts.B} by Rule B · ${ruleCounts.C} by Rule C ` +
    `(TOTAL unique rows = ${uniqueTotal})`
  );
  console.log(`Pipeline total: ${totalPipeline} · % flagged: ${Math.round((uniqueTotal / totalPipeline) * 100)}%`);

  if (skipped.length) {
    console.log(`\nSkipped (null/malformed event_date — left alone):`);
    for (const r of skipped) {
      console.log(`  ! ${shortId(r.id)} ${r.artist_slug} stage=${r.stage} event_date=${JSON.stringify(r.event_date)}`);
    }
  }

  // Sanity guard: >50% of pipeline flagged is a heuristic red flag
  const pct = uniqueTotal / totalPipeline;
  if (pct > 0.5) {
    console.log(`\n⚠ HEURISTIC RED FLAG: ${Math.round(pct * 100)}% of pipeline would be deleted.`);
    if (APPLY) {
      console.log('  Refusing to apply at >50%. Re-run dry-run, eyeball, then force if intentional.');
      process.exit(2);
    }
  }

  if (!APPLY) {
    console.log('\nDRY RUN — no changes made. Re-run with --apply to delete.');
    process.exit(0);
  }

  // APPLY
  console.log(`\nApplying — deleting ${uniqueTotal} rows…`);
  let deleted = 0, errs = 0;
  for (const { row: r } of all) {
    const { error: delErr } = await sb.from('pipeline').delete().eq('id', r.id);
    if (delErr) {
      console.error(`  ERR ${shortId(r.id)} ${r.artist_slug}: ${delErr.message}`);
      errs++;
    } else {
      deleted++;
    }
  }
  console.log(`Done. deleted=${deleted} errors=${errs}`);
})();
