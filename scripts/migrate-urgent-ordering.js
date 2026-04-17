#!/usr/bin/env node
/*
 * One-off migration runner for the urgent_issues drag-and-drop columns.
 *
 * 1. Probes whether sort_order + manually_prioritized exist on urgent_issues.
 * 2. If missing: prints the exact SQL to paste into Supabase Dashboard →
 *    SQL Editor. (DDL requires service-role; the anon key can't run
 *    ALTER TABLE.)
 * 3. If present: seeds sort_order values 0..N within each priority group
 *    (ordered by created_at DESC) so items have a stable initial order.
 *
 *   node scripts/migrate-urgent-ordering.js
 */
const fs = require('fs');
const path = require('path');

const PROJECT = path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
const env = {};
for (const line of raw.split('\n')) { const i = line.indexOf('='); if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }

const { createClient } = require(path.join(PROJECT, 'node_modules/@supabase/supabase-js/dist/index.cjs'));
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

const ALTER_SQL = `ALTER TABLE urgent_issues ADD COLUMN IF NOT EXISTS sort_order           INTEGER DEFAULT 0;
ALTER TABLE urgent_issues ADD COLUMN IF NOT EXISTS manually_prioritized BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS urgent_issues_priority_sort_idx ON urgent_issues (priority, sort_order);`;

async function hasColumn(col) {
  const { error } = await supabase.from('urgent_issues').select(col).limit(1);
  return !error;
}

(async () => {
  console.log('Probing urgent_issues for new columns…');
  const hasSortOrder = await hasColumn('sort_order');
  const hasManualPri = await hasColumn('manually_prioritized');
  console.log(`  sort_order:           ${hasSortOrder ? 'present' : 'MISSING'}`);
  console.log(`  manually_prioritized: ${hasManualPri ? 'present' : 'MISSING'}`);

  if (!hasSortOrder || !hasManualPri) {
    console.log('\nOne or both columns missing. Run this SQL in Supabase Dashboard → SQL Editor:');
    console.log('\n' + '─'.repeat(70));
    console.log(ALTER_SQL);
    console.log('─'.repeat(70));
    console.log('\n(It is also in sql/briefing_intelligence.sql — safe to re-run the whole file.)');
    console.log('After applying, re-run this script to seed sort_order values.');
    process.exit(1);
  }

  console.log('\nSeeding sort_order within each priority group (newest → lowest sort_order)…');
  const { data: rows, error } = await supabase
    .from('urgent_issues')
    .select('id, priority, sort_order, created_at')
    .eq('resolved', false)
    .order('created_at', { ascending: false });
  if (error) { console.error('load error:', error.message); process.exit(1); }

  const groups = { High: [], Medium: [], Low: [] };
  for (const r of rows) {
    const key = ['High', 'Medium', 'Low'].includes(r.priority) ? r.priority : 'Medium';
    groups[key].push(r);
  }

  let updated = 0;
  for (const key of Object.keys(groups)) {
    const group = groups[key];
    for (let i = 0; i < group.length; i++) {
      if (group[i].sort_order === i) continue;
      const { error: uerr } = await supabase
        .from('urgent_issues')
        .update({ sort_order: i })
        .eq('id', group[i].id);
      if (uerr) { console.error(`  ERR ${group[i].id}: ${uerr.message}`); continue; }
      updated++;
    }
    console.log(`  ${key.padEnd(6)}: ${group.length} items`);
  }
  console.log(`\nDone. sort_order updated on ${updated} rows.`);
})().catch(e => { console.error('fatal:', e.message); process.exit(1); });
