#!/usr/bin/env node
/*
 * Seed the campaigns table with the 8 active outreach initiatives.
 * Upserts by (artist_slug, name) — safe to re-run as campaigns are added.
 *
 *   node scripts/seed-campaigns.js
 *
 * Prereq: sql/briefing_intelligence.sql applied in Supabase (adds the
 * campaigns table). The script refuses to run if the table is missing.
 */
const fs = require('fs');
const path = require('path');

const PROJECT = path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
const env = {};
for (const line of raw.split('\n')) { const i = line.indexOf('='); if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
const { createClient } = require(path.join(PROJECT, 'node_modules/@supabase/supabase-js/dist/index.cjs'));
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

const CAMPAIGNS = [
  { artist_slug: 'clawz',      name: 'EU October Tour',     market: 'Europe',        window_start: '2026-10-01', window_end: '2026-10-31', emails_sent: 50, bounces: 6, replies: 0, offers: 0, status: 'Active',      notes: 'Sent April 20. Monitoring for replies. ADE week Oct 21-25 is key target.' },
  { artist_slug: 'sihk',       name: 'US September Tour',   market: 'United States', window_start: '2026-09-01', window_end: '2026-09-30', target_shows: 8, status: 'Not Started', anchor_show: 'Wasteland Sept 5, San Bernardino CA' },
  { artist_slug: 'anoluxx',    name: 'US Tour 2026',        market: 'United States', window_start: '2026-06-01', window_end: '2026-12-31', target_shows: 15, status: 'Not Started' },
  { artist_slug: 'shogun',     name: 'US Tour 2026',        market: 'United States', window_start: '2026-06-01', window_end: '2026-12-31', target_shows: 15, status: 'Not Started' },
  { artist_slug: 'lara-klart', name: 'Availability Outreach', market: 'United States', status: 'Not Started' },
  { artist_slug: 'triptykh',   name: 'US Return Tour',      market: 'United States', status: 'Not Started', notes: 'Back from Europe, needs US dates' },
  { artist_slug: 'the-purge',  name: 'Halloween Season',    market: 'United States', window_start: '2026-10-01', window_end: '2026-10-31', status: 'Not Started', notes: 'Target Halloween weekend Oct 30-31' },
  { artist_slug: 'phoros',     name: 'Intro Outreach',      market: 'United States', status: 'Not Started', notes: 'Not yet signed. Building relationship.' },
];

(async () => {
  // Preflight
  const { error: probeErr } = await supabase.from('campaigns').select('id').limit(1);
  if (probeErr) {
    console.error('campaigns table missing — apply sql/briefing_intelligence.sql in Supabase → SQL Editor first.');
    console.error(`(${probeErr.message})`);
    process.exit(1);
  }

  let inserted = 0, updated = 0, errs = 0;
  for (const row of CAMPAIGNS) {
    const { data: existing } = await supabase
      .from('campaigns')
      .select('id')
      .eq('artist_slug', row.artist_slug)
      .eq('name', row.name)
      .limit(1);
    if (existing && existing.length > 0) {
      const { error } = await supabase
        .from('campaigns')
        .update({ ...row, updated_at: new Date().toISOString() })
        .eq('id', existing[0].id);
      if (error) { console.error(`  ERR update ${row.artist_slug} / ${row.name}: ${error.message}`); errs++; }
      else updated++;
    } else {
      const { error } = await supabase.from('campaigns').insert(row);
      if (error) { console.error(`  ERR insert ${row.artist_slug} / ${row.name}: ${error.message}`); errs++; }
      else inserted++;
    }
  }
  console.log(`campaigns seed: inserted=${inserted} updated=${updated} errors=${errs}`);
})().catch(e => { console.error('fatal:', e.message); process.exit(1); });
