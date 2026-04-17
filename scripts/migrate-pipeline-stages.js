#!/usr/bin/env node
/*
 * Migrate existing pipeline + shows rows from the old 8-stage vocabulary to
 * the new 5-stage Corson pipeline.
 *
 *   Pipeline table (.stage):
 *     Awareness | Inquiry | Avail Check | Request | Hold  →  "Inquiry / Request"
 *     Offer In | Negotiating                              →  "Offer In + Negotiating"
 *
 *   Shows table (.deal_type):
 *     Contracted                                          →  "Confirmed"
 *     Advanced                                            →  "Advancing"
 *     (Confirmed and Settled stay as-is)
 *
 *   node scripts/migrate-pipeline-stages.js
 */
const fs = require('fs');
const path = require('path');

const PROJECT = path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
const env = {};
for (const line of raw.split('\n')) { const i = line.indexOf('='); if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
const { createClient } = require(path.join(PROJECT, 'node_modules/@supabase/supabase-js/dist/index.cjs'));
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

const PIPELINE_MAP = {
  'Awareness':    'Inquiry / Request',
  'Inquiry':      'Inquiry / Request',
  'Avail Check':  'Inquiry / Request',
  'Avail':        'Inquiry / Request',
  'Request':      'Inquiry / Request',
  'Hold':         'Inquiry / Request',
  'Offer In':     'Offer In + Negotiating',
  'Negotiating':  'Offer In + Negotiating',
};

const SHOWS_MAP = {
  'Contracted': 'Confirmed',
  'Advanced':   'Advancing',
};

(async () => {
  console.log('─'.repeat(60));
  console.log('PIPELINE TABLE');
  console.log('─'.repeat(60));
  const { data: pipeRows, error: pErr } = await supabase.from('pipeline').select('id, stage');
  if (pErr) { console.error('pipeline load:', pErr.message); process.exit(1); }

  const pipeCounts = {};
  for (const r of pipeRows) pipeCounts[r.stage || '(null)'] = (pipeCounts[r.stage || '(null)'] || 0) + 1;
  console.log('Before:', JSON.stringify(pipeCounts));

  let pipeUpdated = 0, pipeErr = 0;
  for (const r of pipeRows) {
    const next = PIPELINE_MAP[r.stage];
    if (!next) continue;
    const { error: uerr } = await supabase.from('pipeline').update({ stage: next }).eq('id', r.id);
    if (uerr) { pipeErr++; continue; }
    pipeUpdated++;
  }
  console.log(`Updated: ${pipeUpdated}  Errors: ${pipeErr}`);

  const { data: pipeAfter } = await supabase.from('pipeline').select('stage');
  const pipeCountsAfter = {};
  for (const r of pipeAfter) pipeCountsAfter[r.stage || '(null)'] = (pipeCountsAfter[r.stage || '(null)'] || 0) + 1;
  console.log('After: ', JSON.stringify(pipeCountsAfter));

  console.log('');
  console.log('─'.repeat(60));
  console.log('SHOWS TABLE (deal_type)');
  console.log('─'.repeat(60));
  const { data: showRows, error: sErr } = await supabase.from('shows').select('id, deal_type');
  if (sErr) { console.error('shows load:', sErr.message); process.exit(1); }

  const showCounts = {};
  for (const r of showRows) showCounts[r.deal_type || '(null)'] = (showCounts[r.deal_type || '(null)'] || 0) + 1;
  console.log('Before:', JSON.stringify(showCounts));

  let showUpdated = 0, showErr = 0;
  for (const r of showRows) {
    const next = SHOWS_MAP[r.deal_type];
    if (!next) continue;
    const { error: uerr } = await supabase.from('shows').update({ deal_type: next }).eq('id', r.id);
    if (uerr) { showErr++; continue; }
    showUpdated++;
  }
  console.log(`Updated: ${showUpdated}  Errors: ${showErr}`);

  const { data: showAfter } = await supabase.from('shows').select('deal_type');
  const showCountsAfter = {};
  for (const r of showAfter) showCountsAfter[r.deal_type || '(null)'] = (showCountsAfter[r.deal_type || '(null)'] || 0) + 1;
  console.log('After: ', JSON.stringify(showCountsAfter));
})().catch(e => { console.error('fatal:', e.message); process.exit(1); });
