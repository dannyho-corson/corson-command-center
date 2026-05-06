#!/usr/bin/env node
/**
 * Seed initial 9 prospects into the prospects table (Phase 2.7).
 * Idempotent: dedupes on (name, prospect_type) — case-insensitive.
 */
const fs = require('fs');
const path = require('path');

const env = {};
for (const l of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i > 0) env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}
const { createClient } = require(path.join(__dirname, '..', 'node_modules/@supabase/supabase-js/dist/index.cjs'));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

const SEEDS = [
  {
    prospect_type: 'artist', name: 'Crunchi', source: 'show', source_detail: 'Met Danny in person',
    status: 'Reviewing',
    notes: 'Boyfriend is Heckler (dubstep DJ). Danny doing A&R work — thinks could sign.',
  },
  {
    prospect_type: 'artist', name: 'Aaron / Hardphonics', contact_email: null, source: 'email',
    source_detail: 'Unsolicited email + follow-up May 5',
    status: 'New',
    notes: 'Wants representation. Self-pitch.',
  },
  {
    prospect_type: 'artist', name: 'Orlando Promoter Submission (name TBD)', source: 'email',
    source_detail: 'Orlando promoter emailed May 4 asking Danny to look at their artist',
    status: 'New',
    notes: 'Need to extract artist name from email thread.',
  },
  {
    prospect_type: 'artist', name: 'Renault / Swarm France submission', source: 'email',
    source_detail: 'Swarm agency France (Renault) asked Danny to review their artist — May 4',
    status: 'New',
    notes: 'Agency referral. Renault @ Swarm Mgmt connection.',
  },
  {
    prospect_type: 'coordinator', name: 'Coordinator applicant (name TBD)', source: 'email',
    source_detail: 'Wants to be Corson coordinator. Email May 5.',
    status: 'New',
    notes: 'Get name + check background.',
  },
  {
    prospect_type: 'artist', name: 'Polarity', source: 'referral',
    status: 'Hip Pocket',
    notes: 'Chicago. Already in roster pipeline per Mission & Legacy.',
  },
  {
    prospect_type: 'artist', name: 'Amayah', source: 'referral',
    status: 'Hip Pocket',
  },
  {
    prospect_type: 'artist', name: 'Zerosum', source: 'referral',
    status: 'Hip Pocket',
  },
  {
    prospect_type: 'artist', name: 'Cyberia Lain', source: 'referral',
    status: 'Hip Pocket',
    notes: 'Dictation note: Danny said "Siberia Lane" but System Bible spells it "Cyberia Lain". Confirm canonical.',
  },
];

(async () => {
  let inserts = 0, skips = 0, errors = 0;
  const log = [];
  for (const p of SEEDS) {
    const { data: existing } = await sb.from('prospects').select('id,name,prospect_type')
      .ilike('name', p.name).eq('prospect_type', p.prospect_type);
    if (existing && existing.length > 0) {
      log.push(`SKIP   ${p.prospect_type}/${p.name} (already exists id=${existing[0].id})`);
      skips++;
      continue;
    }
    const { error } = await sb.from('prospects').insert(p);
    if (error) {
      log.push(`ERR    ${p.prospect_type}/${p.name}: ${error.message}`);
      errors++;
    } else {
      log.push(`INSERT ${p.prospect_type}/${p.name} (status=${p.status})`);
      inserts++;
    }
  }
  console.log('=== seed-prospects ===');
  for (const l of log) console.log(' ', l);
  console.log(`\nTotals: inserts=${inserts} skips=${skips} errors=${errors}`);
  const { count } = await sb.from('prospects').select('*', { count: 'exact', head: true });
  console.log(`prospects total now: ${count}`);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
