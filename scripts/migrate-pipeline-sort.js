#!/usr/bin/env node
/*
 * Migrate: ensure sort_order columns exist on pipeline + shows, then seed
 * initial values so the drag-and-drop kanban has a stable starting order.
 *
 * Seed rule: within each (pipeline.stage) or (shows.deal_type) bucket, sort
 * rows newest-first by created_at and stamp sort_order = 0..N.
 *
 *   node scripts/migrate-pipeline-sort.js
 *
 * If the sort_order column is missing, the anon key can't ALTER TABLE; this
 * script will print the SQL to paste into Supabase → SQL Editor and exit.
 */
const fs = require('fs');
const path = require('path');

const PROJECT = path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
const env = {};
for (const line of raw.split('\n')) { const i = line.indexOf('='); if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
const { createClient } = require(path.join(PROJECT, 'node_modules/@supabase/supabase-js/dist/index.cjs'));
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

const ALTER_SQL = `ALTER TABLE pipeline ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE shows    ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS pipeline_stage_sort_idx ON pipeline (stage, sort_order);
CREATE INDEX IF NOT EXISTS shows_deal_type_sort_idx ON shows (deal_type, sort_order);`;

async function probeColumn(table, col) {
  const { error } = await supabase.from(table).select(col).limit(1);
  return !error;
}

async function seedOrdering(table, bucketCol) {
  const { data: rows, error } = await supabase
    .from(table)
    .select(`id, ${bucketCol}, sort_order, created_at`)
    .order('created_at', { ascending: false });
  if (error) { console.error(`${table} load:`, error.message); return 0; }

  const byBucket = {};
  for (const r of rows) {
    const key = r[bucketCol] || '(null)';
    (byBucket[key] ||= []).push(r);
  }

  let updated = 0;
  for (const [key, list] of Object.entries(byBucket)) {
    for (let i = 0; i < list.length; i++) {
      if (list[i].sort_order === i) continue;
      const { error: uerr } = await supabase.from(table).update({ sort_order: i }).eq('id', list[i].id);
      if (!uerr) updated++;
    }
    console.log(`  ${table}.${bucketCol}="${key}": ${list.length} rows`);
  }
  return updated;
}

(async () => {
  console.log('Probing pipeline.sort_order and shows.sort_order…');
  const pOk = await probeColumn('pipeline', 'sort_order');
  const sOk = await probeColumn('shows', 'sort_order');
  console.log(`  pipeline.sort_order: ${pOk ? 'present' : 'MISSING'}`);
  console.log(`  shows.sort_order:    ${sOk ? 'present' : 'MISSING'}`);
  if (!pOk || !sOk) {
    console.log('\nApply this SQL in Supabase Dashboard → SQL Editor:\n');
    console.log('─'.repeat(70));
    console.log(ALTER_SQL);
    console.log('─'.repeat(70));
    console.log('\n(Also included in sql/briefing_intelligence.sql — safe to re-run.)');
    process.exit(1);
  }

  console.log('\nSeeding sort_order within pipeline.stage…');
  const pUpdated = await seedOrdering('pipeline', 'stage');
  console.log('\nSeeding sort_order within shows.deal_type…');
  const sUpdated = await seedOrdering('shows', 'deal_type');
  console.log(`\nDone. pipeline: ${pUpdated} rows updated · shows: ${sUpdated} rows updated.`);
})().catch(e => { console.error('fatal:', e.message); process.exit(1); });
