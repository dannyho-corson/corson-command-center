#!/usr/bin/env node
/*
 * Ensure campaigns.sort_order exists, then seed values 0..N ordered by
 * created_at DESC so the initial drag-and-drop order matches the current
 * card layout.
 *
 *   node scripts/migrate-campaigns-sort.js
 *
 * The anon key can't run DDL, so if the column is missing the script
 * prints the exact ALTER for you to paste into Supabase Dashboard →
 * SQL Editor, then re-run this script to seed values.
 */
const fs = require('fs');
const path = require('path');

const PROJECT = path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
const env = {};
for (const line of raw.split('\n')) { const i = line.indexOf('='); if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
const { createClient } = require(path.join(PROJECT, 'node_modules/@supabase/supabase-js/dist/index.cjs'));
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

const ALTER_SQL = `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS campaigns_sort_idx ON campaigns (sort_order);`;

(async () => {
  const { error: probeErr } = await supabase.from('campaigns').select('sort_order').limit(1);
  if (probeErr) {
    console.log('campaigns.sort_order missing. Run this SQL in Supabase Dashboard → SQL Editor:\n');
    console.log('─'.repeat(70));
    console.log(ALTER_SQL);
    console.log('─'.repeat(70));
    console.log('\n(Also bundled in sql/briefing_intelligence.sql — safe to re-run.)');
    console.log('Then re-run this script to seed initial sort_order values.');
    process.exit(1);
  }

  const { data: rows, error } = await supabase
    .from('campaigns')
    .select('id, sort_order, created_at')
    .order('created_at', { ascending: false });
  if (error) { console.error('load:', error.message); process.exit(1); }

  let updated = 0;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].sort_order === i) continue;
    const { error: uerr } = await supabase.from('campaigns').update({ sort_order: i }).eq('id', rows[i].id);
    if (!uerr) updated++;
  }
  console.log(`campaigns sort_order seeded on ${updated}/${rows.length} rows.`);
})().catch(e => { console.error('fatal:', e.message); process.exit(1); });
