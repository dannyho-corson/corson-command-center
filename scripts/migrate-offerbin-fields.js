#!/usr/bin/env node
/*
 * Ensure the 6 Offer Bin-specific columns exist on pipeline:
 *   walkout_potential, age_restriction, buyer_phone, buyer_email,
 *   radius_clause, set_time.
 * Anon key can't DDL — prints the ALTER block if anything's missing.
 */
const fs = require('fs');
const path = require('path');
const PROJECT = path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
const env = {};
for (const line of raw.split('\n')) { const i = line.indexOf('='); if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
const { createClient } = require(path.join(PROJECT, 'node_modules/@supabase/supabase-js/dist/index.cjs'));
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

const COLS = ['walkout_potential', 'age_restriction', 'buyer_phone', 'buyer_email', 'radius_clause', 'set_time'];

const ALTER_SQL = `ALTER TABLE pipeline ADD COLUMN IF NOT EXISTS walkout_potential NUMERIC;
ALTER TABLE pipeline ADD COLUMN IF NOT EXISTS age_restriction   TEXT;
ALTER TABLE pipeline ADD COLUMN IF NOT EXISTS buyer_phone       TEXT;
ALTER TABLE pipeline ADD COLUMN IF NOT EXISTS buyer_email       TEXT;
ALTER TABLE pipeline ADD COLUMN IF NOT EXISTS radius_clause     TEXT;
ALTER TABLE pipeline ADD COLUMN IF NOT EXISTS set_time          TEXT;`;

(async () => {
  const missing = [];
  for (const c of COLS) {
    const { error } = await supabase.from('pipeline').select(c).limit(1);
    if (error) missing.push(c);
  }
  if (missing.length) {
    console.log(`MISSING: ${missing.join(', ')}\n`);
    console.log('Apply in Supabase → SQL Editor:\n' + '─'.repeat(70));
    console.log(ALTER_SQL);
    console.log('─'.repeat(70));
    process.exit(1);
  }
  console.log(`All ${COLS.length} Offer Bin columns present on pipeline.`);
})().catch(e => { console.error('fatal:', e.message); process.exit(1); });
