#!/usr/bin/env node
/*
 * Ensure the pipeline HGR / deal-structure / event-type columns exist.
 *
 *   node scripts/migrate-pipeline-hgr.js
 *
 * Anon key can't DDL; prints the ALTER block if columns are missing.
 */
const fs = require('fs');
const path = require('path');

const PROJECT = path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
const env = {};
for (const line of raw.split('\n')) { const i = line.indexOf('='); if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
const { createClient } = require(path.join(PROJECT, 'node_modules/@supabase/supabase-js/dist/index.cjs'));
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

const COLUMNS = ['deal_type', 'hotel_included', 'ground_included', 'rider_included', 'bonus_structure', 'capacity', 'event_type'];

const ALTER_SQL = `ALTER TABLE pipeline ADD COLUMN IF NOT EXISTS deal_type       TEXT;
ALTER TABLE pipeline ADD COLUMN IF NOT EXISTS hotel_included  BOOLEAN DEFAULT false;
ALTER TABLE pipeline ADD COLUMN IF NOT EXISTS ground_included BOOLEAN DEFAULT false;
ALTER TABLE pipeline ADD COLUMN IF NOT EXISTS rider_included  BOOLEAN DEFAULT false;
ALTER TABLE pipeline ADD COLUMN IF NOT EXISTS bonus_structure TEXT;
ALTER TABLE pipeline ADD COLUMN IF NOT EXISTS capacity        INTEGER;
ALTER TABLE pipeline ADD COLUMN IF NOT EXISTS event_type      TEXT;`;

(async () => {
  console.log('Probing pipeline HGR columns…');
  const missing = [];
  for (const c of COLUMNS) {
    const { error } = await supabase.from('pipeline').select(c).limit(1);
    if (error) missing.push(c);
  }
  if (missing.length) {
    console.log(`  MISSING: ${missing.join(', ')}\n`);
    console.log('Run this SQL in Supabase Dashboard → SQL Editor:\n');
    console.log('─'.repeat(70));
    console.log(ALTER_SQL);
    console.log('─'.repeat(70));
    console.log('\n(Bundled in sql/briefing_intelligence.sql — safe to re-run.)');
    process.exit(1);
  }
  console.log(`  All 7 columns present.`);
})().catch(e => { console.error('fatal:', e.message); process.exit(1); });
