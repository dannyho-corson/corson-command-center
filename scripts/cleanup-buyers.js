#!/usr/bin/env node
/*
 * Clean up the Rolodex (buyers table):
 *
 *   1. Detect rows where `name` looks like a company (all-caps, or contains
 *      company keywords like "club/events/records/presents/bookings/…").
 *      Move that value into `company` if company is empty; clear `name`.
 *
 *   2. Standardize `market` to "City, State/Country" format.
 *      Aliases: SF → San Francisco, CA · NYC → New York, NY · LA → Los Angeles, CA
 *      Berlin/London/Paris/etc. → add country.
 *
 *   3. Dedup by email — keep the row with the most-recently-populated
 *      last_contact (or failing that, the most-recent created_at). Merge
 *      notes / status / company / market from the duplicates where the
 *      canonical row has null.
 *
 * Prerequisite: sql/briefing_intelligence.sql must have been applied so the
 * `last_contact DATE` column exists on buyers.
 *
 *   node scripts/cleanup-buyers.js           # dry run — reports only
 *   node scripts/cleanup-buyers.js --apply   # actually writes changes
 */
const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');

const PROJECT = path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
const env = {};
for (const line of raw.split('\n')) { const i = line.indexOf('='); if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
const { createClient } = require(path.join(PROJECT, 'node_modules/@supabase/supabase-js/dist/index.cjs'));
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

// ─── rule 1: detect company-in-name ───────────────────────────────────────
const COMPANY_KEYWORDS = /\b(club|events?|presents|records|bookings?|agency|promo|promotions?|collective|festival|society|productions?|entertainment|group|ltd|llc|inc|studios?|media|culture|nights?|sound(s)?|radio|records)\b/i;

function nameLooksLikeCompany(name) {
  if (!name) return false;
  const trimmed = name.trim();
  if (trimmed.length < 2) return false;
  if (COMPANY_KEYWORDS.test(trimmed)) return true;
  // All caps (with optional punctuation) and multi-word — almost certainly a company
  const letters = trimmed.replace(/[^A-Za-z]/g, '');
  if (letters.length >= 4 && letters === letters.toUpperCase() && /\s/.test(trimmed)) return true;
  return false;
}

// ─── rule 2: market standardization ───────────────────────────────────────
const MARKET_ALIASES = {
  'sf':             'San Francisco, CA',
  'san francisco':  'San Francisco, CA',
  'nyc':            'New York, NY',
  'ny':             'New York, NY',
  'new york':       'New York, NY',
  'brooklyn':       'Brooklyn, NY',
  'la':             'Los Angeles, CA',
  'los angeles':    'Los Angeles, CA',
  'lax':            'Los Angeles, CA',
  'chicago':        'Chicago, IL',
  'chi':            'Chicago, IL',
  'atl':            'Atlanta, GA',
  'atlanta':        'Atlanta, GA',
  'miami':          'Miami, FL',
  'austin':         'Austin, TX',
  'houston':        'Houston, TX',
  'dallas':         'Dallas, TX',
  'denver':         'Denver, CO',
  'vegas':          'Las Vegas, NV',
  'las vegas':      'Las Vegas, NV',
  'phoenix':        'Phoenix, AZ',
  'seattle':        'Seattle, WA',
  'portland':       'Portland, OR',
  'detroit':        'Detroit, MI',
  'boston':         'Boston, MA',
  'dc':             'Washington, DC',
  'washington dc':  'Washington, DC',
  'philly':         'Philadelphia, PA',
  'philadelphia':   'Philadelphia, PA',
  'nashville':      'Nashville, TN',
  'new orleans':    'New Orleans, LA',
  'minneapolis':    'Minneapolis, MN',
  'toronto':        'Toronto, Canada',
  'montreal':       'Montreal, Canada',
  'vancouver':      'Vancouver, Canada',
  'mexico city':    'Mexico City, Mexico',
  'cdmx':           'Mexico City, Mexico',
  'berlin':         'Berlin, Germany',
  'london':         'London, UK',
  'paris':          'Paris, France',
  'amsterdam':      'Amsterdam, Netherlands',
  'rotterdam':      'Rotterdam, Netherlands',
  'madrid':         'Madrid, Spain',
  'barcelona':      'Barcelona, Spain',
  'ibiza':          'Ibiza, Spain',
  'tokyo':          'Tokyo, Japan',
  'bangkok':        'Bangkok, Thailand',
  'sydney':         'Sydney, Australia',
  'melbourne':      'Melbourne, Australia',
};
function standardizeMarket(m) {
  if (!m) return null;
  const trimmed = m.trim();
  if (!trimmed) return null;
  const key = trimmed.toLowerCase();
  if (MARKET_ALIASES[key]) return MARKET_ALIASES[key];
  // Already "City, XX" — normalize whitespace
  if (/^[A-Za-z].{2,}?,\s*[A-Za-z]/.test(trimmed)) return trimmed.replace(/\s*,\s*/g, ', ');
  // Single word city we know
  const firstWord = key.split(/[\s,]+/)[0];
  if (MARKET_ALIASES[firstWord]) return MARKET_ALIASES[firstWord];
  return trimmed; // keep as-is — Danny can edit inline
}

// ─── main ─────────────────────────────────────────────────────────────────
(async () => {
  console.log(`Mode: ${APPLY ? 'APPLY (writing changes)' : 'DRY RUN (no writes)'}\n`);

  // Preflight — is last_contact column present?
  const { error: lcErr } = await supabase.from('buyers').select('last_contact').limit(1);
  if (lcErr) {
    console.error('last_contact column missing. Apply sql/briefing_intelligence.sql in Supabase first.');
    process.exit(1);
  }

  const { data: rows, error } = await supabase
    .from('buyers')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { console.error('load:', error.message); process.exit(1); }
  console.log(`Loaded ${rows.length} buyer rows\n`);

  // ─── Rule 1: name→company demotion ─────────────────────────────────────
  const demotions = rows.filter(r => nameLooksLikeCompany(r.name));
  console.log(`Rule 1 — name looks like company:   ${demotions.length} rows`);
  let demoted = 0;
  for (const r of demotions) {
    const next = { name: null, company: r.company && r.company.trim() ? r.company : r.name };
    if (APPLY) {
      const { error: uerr } = await supabase.from('buyers').update(next).eq('id', r.id);
      if (uerr) { console.log(`  ERR ${r.id}: ${uerr.message}`); continue; }
    }
    demoted++;
  }

  // ─── Rule 2: market standardization ────────────────────────────────────
  let marketChanged = 0;
  for (const r of rows) {
    const next = standardizeMarket(r.market);
    if (!next || next === r.market) continue;
    if (APPLY) {
      const { error: uerr } = await supabase.from('buyers').update({ market: next }).eq('id', r.id);
      if (uerr) { console.log(`  ERR market ${r.id}: ${uerr.message}`); continue; }
    }
    marketChanged++;
  }
  console.log(`Rule 2 — market standardized:       ${marketChanged} rows`);

  // ─── Rule 3: dedup by email ────────────────────────────────────────────
  // Re-read after updates so we dedup against the fresh state
  const { data: fresh } = APPLY
    ? await supabase.from('buyers').select('*').order('created_at', { ascending: false })
    : { data: rows };

  const byEmail = new Map();
  for (const r of fresh) {
    if (!r.email) continue;
    const key = r.email.trim().toLowerCase();
    if (!key) continue;
    if (!byEmail.has(key)) byEmail.set(key, []);
    byEmail.get(key).push(r);
  }

  let duplicatesRemoved = 0, mergesApplied = 0;
  for (const [email, group] of byEmail) {
    if (group.length < 2) continue;
    // Canonical: prefer one with last_contact, else most recent created_at (already sorted desc)
    group.sort((a, b) => {
      const la = a.last_contact ? new Date(a.last_contact).getTime() : 0;
      const lb = b.last_contact ? new Date(b.last_contact).getTime() : 0;
      if (la !== lb) return lb - la;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
    const keep = group[0];
    const drops = group.slice(1);

    // Merge: for each column that's null/empty on keep, take the first non-null from drops
    const mergePatch = {};
    for (const col of ['name', 'company', 'market', 'notes', 'status', 'instagram', 'region', 'last_contact']) {
      if (keep[col] !== null && keep[col] !== '' && keep[col] !== undefined) continue;
      for (const d of drops) {
        if (d[col] !== null && d[col] !== '' && d[col] !== undefined) { mergePatch[col] = d[col]; break; }
      }
    }
    if (Object.keys(mergePatch).length > 0) {
      if (APPLY) await supabase.from('buyers').update(mergePatch).eq('id', keep.id);
      mergesApplied++;
    }
    for (const d of drops) {
      if (APPLY) await supabase.from('buyers').delete().eq('id', d.id);
      duplicatesRemoved++;
    }
  }
  console.log(`Rule 3 — duplicates by email:       ${duplicatesRemoved} rows removed, ${mergesApplied} canonical rows merged\n`);

  console.log(`──────────────────────────────────────────────────────`);
  console.log(`Summary (${APPLY ? 'applied' : 'dry-run'}):`);
  console.log(`  name → company demotions:  ${demoted}`);
  console.log(`  markets standardized:      ${marketChanged}`);
  console.log(`  duplicates removed:        ${duplicatesRemoved}`);
  console.log(`  rows merged from dupes:    ${mergesApplied}`);
  if (!APPLY) console.log(`\nRe-run with --apply to persist changes.`);
})().catch(e => { console.error('fatal:', e.message); process.exit(1); });
