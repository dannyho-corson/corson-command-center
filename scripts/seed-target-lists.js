#!/usr/bin/env node
/*
 * Seed targets table for every artist on the roster by copying shogun's 140
 * target entries. Adjusts priority_order based on artist tier vs buyer tier:
 *
 *   AAA buyers (Insomniac/Mutate, Relentless Beats, Global Dance, Disco Donnie)
 *     → priority_order 1   (Priority A)  for ESTABLISHED artists
 *     → priority_order 300 (Priority C)  for BABY artists
 *   Other buyers
 *     → priority_order 100 (Priority B)  for both tiers
 *
 * Dedup: skip if an (artist_slug, promoter) pair already exists in targets.
 * Safe to re-run — only inserts rows that don't exist.
 */
const fs = require('fs');
const path = require('path');

const PROJECT = path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
const env = {};
for (const line of raw.split('\n')) { const i = line.indexOf('='); if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
const { createClient } = require(path.join(PROJECT, 'node_modules/@supabase/supabase-js/dist/index.cjs'));
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

// 26 artists to seed (Shogun is the source, not a destination)
const ALL_ARTISTS = [
  'anime', 'anoluxx', 'clawz', 'cyboy', 'dea-magna', 'death-code', 'dr-greco',
  'drakk', 'fernanda-martins', 'gioh-cecato', 'hellbound', 'jay-toledo', 'jayr',
  'jenna-shaw', 'junkie-kid', 'ketting', 'lara-klart', 'mad-dog', 'mandy',
  'morelia', 'naomi-luna', 'pixie-dust', 'sihk', 'taylor-torrence', 'the-purge',
  'triptykh', 'water-spirit',
];

// Established (top tier) artists get AAA buyers at priority A; baby artists at C
const ESTABLISHED = new Set([
  'shogun', 'junkie-kid', 'clawz', 'hellbound', 'mandy', 'jenna-shaw',
  'drakk', 'triptykh', 'mad-dog', 'morelia', 'anime', 'dea-magna',
]);
const BABY = new Set([
  'cyboy', 'death-code', 'jay-toledo', 'gioh-cecato', 'naomi-luna', 'pixie-dust',
]);

const AAA_BRANDS = /\b(insomniac|mutate|relentless\s*beats|global\s*dance|disco\s*donnie)\b/i;

function priorityForAAA(slug) {
  if (ESTABLISHED.has(slug)) return { order: 1,   tier: 'A' };
  if (BABY.has(slug))        return { order: 300, tier: 'C' };
  return { order: 50, tier: 'B' };
}

(async () => {
  const { data: src, error } = await supabase
    .from('targets')
    .select('promoter, contact, market, status, notes')
    .eq('artist_slug', 'shogun');
  if (error) { console.error('load shogun targets:', error.message); process.exit(1); }
  if (!src || src.length === 0) { console.error('no shogun targets found'); process.exit(1); }
  console.log(`Source: ${src.length} shogun targets\n`);

  let totalInserted = 0, totalSkipped = 0, aaaAdjusted = 0;
  const perArtistReport = [];

  for (const slug of ALL_ARTISTS) {
    const { data: existing, error: eerr } = await supabase
      .from('targets')
      .select('promoter')
      .eq('artist_slug', slug);
    if (eerr) { console.log(`${slug}: err loading existing: ${eerr.message}`); continue; }
    const existingSet = new Set((existing || []).map(r => (r.promoter || '').toLowerCase()));

    const newRows = [];
    for (const t of src) {
      if (!t.promoter) continue;
      if (existingSet.has(t.promoter.toLowerCase())) { totalSkipped++; continue; }
      const isAAA = AAA_BRANDS.test(t.promoter || '');
      const pri = isAAA ? priorityForAAA(slug) : { order: 100, tier: 'B' };
      if (isAAA && pri.tier !== 'B') aaaAdjusted++;
      newRows.push({
        artist_slug: slug,
        promoter: t.promoter,
        contact: t.contact || null,
        market: t.market || null,
        status: 'Not Started',
        notes: t.notes || null,
        priority_order: pri.order,
      });
    }

    if (newRows.length === 0) {
      perArtistReport.push(`${slug.padEnd(20)} 0 new (all ${src.length} already present)`);
      continue;
    }

    // Insert in batches of 100 to stay under any row-size cap
    let inserted = 0;
    for (let i = 0; i < newRows.length; i += 100) {
      const chunk = newRows.slice(i, i + 100);
      const { error: ierr } = await supabase.from('targets').insert(chunk);
      if (ierr) { console.log(`${slug} batch err: ${ierr.message.slice(0,120)}`); continue; }
      inserted += chunk.length;
    }
    totalInserted += inserted;
    perArtistReport.push(`${slug.padEnd(20)} ${String(inserted).padStart(3)} new   (tier ${ESTABLISHED.has(slug) ? 'A (established)' : BABY.has(slug) ? 'C (baby)' : 'B (mid)'})`);
  }

  console.log('Per-artist:');
  perArtistReport.forEach(l => console.log('  ' + l));
  console.log(`\n──────────────────────────────────────────────────────`);
  console.log(`Artists seeded:       ${ALL_ARTISTS.length}`);
  console.log(`Targets inserted:     ${totalInserted}`);
  console.log(`Targets skipped (dup):${totalSkipped}`);
  console.log(`AAA-priority adjusted:${aaaAdjusted}  (A=1 established, C=300 baby)`);
})().catch(e => { console.error('fatal:', e.message); process.exit(1); });
