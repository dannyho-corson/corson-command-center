#!/usr/bin/env node
/*
 * Seed the industry_intel table with Corson's current festival coverage,
 * urgent targets, key buyers, and scene trends.
 *
 * Safe to re-run — upserts by (category + name). Run after applying
 * sql/briefing_intelligence.sql in Supabase.
 */
const fs = require('fs');
const path = require('path');

const ENV_PATH = path.join(__dirname, '.env');
const raw = fs.readFileSync(ENV_PATH, 'utf8');
const env = {};
for (const line of raw.split('\n')) { const i = line.indexOf('='); if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }

const { createClient } = require(path.join(__dirname, '..', 'node_modules/@supabase/supabase-js/dist/index.cjs'));
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

const SEED = [
  // ── Festivals Corson is IN ──
  { category: 'festival', name: 'Wasteland (Insomniac)',       event_date: 'Sept 4-5, 2026',   market: 'SoCal',           corson_status: 'in',     priority: 'medium', corson_artists: ['clawz','junkie-kid','mad-dog','dea-magna'], notes: 'Insomniac hard-techno flagship' },
  { category: 'festival', name: 'EDC Las Vegas',                event_date: 'May 15-17, 2026',   market: 'Las Vegas, NV',   corson_status: 'in',     priority: 'medium', corson_artists: ['clawz'], notes: 'Wasteland stage' },
  { category: 'festival', name: 'Escape Halloween',             event_date: 'Oct 30-31, 2026',  market: 'SoCal',           corson_status: 'in',     priority: 'medium', corson_artists: ['anime','the-purge'], notes: 'Insomniac Halloween' },
  { category: 'festival', name: 'Coachella Yuma',               event_date: 'April 2026',       market: 'Indio, CA',       corson_status: 'in',     priority: 'medium', corson_artists: ['jenna-shaw'], notes: 'Goldenvoice underground tent' },
  { category: 'festival', name: 'Tomorrowland',                 event_date: 'July 2026',        market: 'Global',          corson_status: 'in',     priority: 'medium', corson_artists: ['mandy','junkie-kid'], notes: 'Global mega-fest + CORE LA expansion' },

  // ── Urgent targets ──
  { category: 'festival', name: 'Time Warp Miami',              event_date: 'April 25, 2026',    market: 'Miami, FL',       corson_status: 'target', priority: 'urgent', corson_artists: [], notes: 'Global benchmark EU fest expanding US. Nobody in yet — push for 2027' },
  { category: 'festival', name: 'Time Warp NYC',                event_date: 'Nov 2026',          market: 'NYC',             corson_status: 'target', priority: 'urgent', corson_artists: [], notes: 'No Corson presence. Urgent target.' },
  { category: 'festival', name: 'Movement Detroit',             event_date: 'May 23-26, 2026',   market: 'Detroit, MI',     corson_status: 'dream',  priority: 'high',   corson_artists: [], notes: 'Paxahau — most credible US techno brand. Dream target.' },
  { category: 'festival', name: 'HARD Summer',                  event_date: 'Aug 1-2, 2026',     market: 'LA',              corson_status: 'target', priority: 'high',   corson_artists: [], notes: 'HARD Events/Live Nation. No Corson yet.' },
  { category: 'festival', name: 'ADE Amsterdam',                event_date: 'Oct 21-25, 2026',   market: 'Amsterdam, NL',   corson_status: 'target', priority: 'high',   corson_artists: [], notes: '30th anniversary — all EU Corson artists should target' },

  // ── Key buyers ──
  { category: 'buyer', name: 'Insomniac / Mutate',              market: 'North America',    corson_status: 'n/a', priority: 'high',   notes: 'MOST IMPORTANT. Contacts: Matt Smith, Carlos, Jasper Li, Jackie Bray, Naar' },
  { category: 'buyer', name: 'Relentless Beats',                market: 'Phoenix/SW',       corson_status: 'n/a', priority: 'medium', notes: 'Mike Puliz internal contact' },
  { category: 'buyer', name: 'Auris Presents',                  market: 'Chicago',          corson_status: 'n/a', priority: 'medium', notes: 'yianni.papa@aurispresents.com' },
  { category: 'buyer', name: 'Paxahau',                         market: 'Detroit',          corson_status: 'n/a', priority: 'high',   notes: 'Movement Festival — most credible US techno brand' },
  { category: 'buyer', name: 'Global Dance',                    market: 'Denver/CO',        corson_status: 'n/a', priority: 'medium', notes: 'Key Mountain West growth market' },
  { category: 'buyer', name: 'Disco Donnie',                    market: 'Southeast/SW',     corson_status: 'n/a', priority: 'medium', notes: 'Multi-market promoter' },

  // ── Scene trends ──
  { category: 'trend', name: 'Hard techno US market exploding — Mutate expanding city by city', priority: 'high',   notes: '' },
  { category: 'trend', name: 'EU festivals entering US (Time Warp, Verknipt, Unreal Germany)',    priority: 'high',   notes: '' },
  { category: 'trend', name: 'Extended sets becoming standard — favors deep catalogs',           priority: 'medium', notes: '' },
  { category: 'trend', name: 'Beatport Hard Dance chart now dedicated — mainstream exposure',    priority: 'medium', notes: '' },
];

(async () => {
  console.log(`Seeding ${SEED.length} industry_intel rows…`);
  let inserted = 0, updated = 0, errs = 0;
  for (const row of SEED) {
    const { data: existing } = await supabase.from('industry_intel').select('id').eq('category', row.category).eq('name', row.name).limit(1);
    if (existing && existing.length > 0) {
      // updated_at omitted — set by Postgres default on insert; not all
      // deployments have the column, and update() just needs the row id.
      const { error } = await supabase.from('industry_intel').update(row).eq('id', existing[0].id);
      if (error) { console.error(`  ERR update ${row.name}: ${error.message}`); errs++; } else { updated++; }
    } else {
      const { error } = await supabase.from('industry_intel').insert(row);
      if (error) { console.error(`  ERR insert ${row.name}: ${error.message}`); errs++; } else { inserted++; }
    }
  }
  console.log(`Done. inserted=${inserted} updated=${updated} errors=${errs}`);
})();
