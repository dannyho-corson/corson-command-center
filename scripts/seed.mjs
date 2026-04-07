/**
 * Corson Command Center — Supabase Seed Script
 * Run: npm run seed
 *
 * Schema (tables already exist in Supabase):
 *   artists: id, name, slug, category, genre, base, spotify, instagram,
 *            spotify_followers, instagram_followers, club_fee, festival_fee,
 *            manager_name, manager_email, label, eu_agent, notes, created_at
 *
 *   shows:   id, artist_id, artist_slug, event_date, city, venue,
 *            promoter, fee, deal_type, hold_number, status, bonus, notes, created_at
 *
 *   pipeline: id, artist_id, artist_slug, stage, event_date, market, venue,
 *             buyer, buyer_company, fee_offered, fee_target, deal_type,
 *             hold_number, next_action, manager_cc, notes, created_at
 */

import { createClient } from '/Users/dannyho94/corson-command-center/node_modules/@supabase/supabase-js/dist/index.mjs';

const SUPABASE_URL = 'https://smueknsapnvyrdfnnkkq.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtdWVrbnNhcG52eXJkZm5ua2txIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQxNzQsImV4cCI6MjA5MTA5MDE3NH0.ycYKQtF5JTb1bcDuRdFk-PrwNl15qf0f39ac2GzUWLc';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Parse natural-language dates to ISO YYYY-MM-DD
// "Jul 4, 2026" → "2026-07-04", "May 16–18, 2026" → "2026-05-16", "Jun 2026" → "2026-06-01"
const MONTHS = { Jan:1, Feb:2, Mar:3, Apr:4, May:5, Jun:6, Jul:7, Aug:8, Sep:9, Oct:10, Nov:11, Dec:12 };
function parseDate(str) {
  if (!str) return null;
  // "Month D, YYYY" or "Month D–D, YYYY"
  const full = str.match(/^([A-Za-z]+)\s+(\d+)[–\-–]?\d*,?\s+(\d{4})/);
  if (full) {
    const m = String(MONTHS[full[1]]).padStart(2, '0');
    const d = String(full[2]).padStart(2, '0');
    return `${full[3]}-${m}-${d}`;
  }
  // "Month YYYY"
  const partial = str.match(/^([A-Za-z]+)\s+(\d{4})/);
  if (partial) {
    const m = String(MONTHS[partial[1]]).padStart(2, '0');
    return `${partial[2]}-${m}-01`;
  }
  return null;
}

// Parse "13K" → 13000, "253K" → 253000, "1.7M" → 1700000, null → null
function parseCount(str) {
  if (!str) return null;
  const s = String(str).trim().replace(/,/g, '');
  if (s.endsWith('M')) return Math.round(parseFloat(s) * 1_000_000);
  if (s.endsWith('K')) return Math.round(parseFloat(s) * 1_000);
  const n = parseInt(s, 10);
  return isNaN(n) ? null : n;
}

// ── ARTIST SEED DATA ──────────────────────────────────────────────────────────
// Each entry maps to the Supabase schema + includes confirmedShows / offersInProgress
// for seeding the shows + pipeline tables.

const artistData = [
  // ── PRIORITY ─────────────────────────────────────────────────────────────
  {
    name: 'SHOGUN', slug: 'shogun', category: 'priority',
    genre: 'Hard Techno', base: 'Los Angeles, CA',
    spotify: '145.3K', spotify_followers: null,
    instagram: '@shogunsworld', instagram_followers: '13K',
    club_fee: 'TBD', festival_fee: null,
    manager_name: 'JJ', manager_email: 'JJ@voidline-management.com',
    label: null, eu_agent: 'Octaine (pending)',
    notes: 'No EU agent yet — Octaine offer pending. Contract at Ground Zero Miami overdue (72-hr deadline passed). Chase buyer immediately.',
    confirmedShows: [
      { event_date: 'Jul 4, 2026', city: 'Miami, FL', venue: 'Ground Zero Miami', promoter: 'Domicile Miami', fee: '$2,200', deal_type: 'Confirmed' },
    ],
    offersInProgress: [],
  },
  {
    name: 'JUNKIE KID', slug: 'junkie-kid', category: 'priority',
    genre: 'Hard Techno / Hard Dance', base: 'Mexico City, MX',
    spotify: '1.7M', spotify_followers: null,
    instagram: '@junkiekid', instagram_followers: '68K',
    club_fee: '$1,500–$2,500', festival_fee: '$3,000–$6,000',
    manager_name: 'Vairon (VEOP)', manager_email: 'vairon@veopmg.com',
    label: 'Harsh Records (owner)', eu_agent: null,
    notes: '"Woops" w/ Dimitri Vegas hit #1 Beatport Hard Dance. Tomorrowland 2025 debut. LATAM handled by Corson LATAM team. HGR details needed from VEOP for Tomorrowland advance.',
    confirmedShows: [
      { event_date: 'Jul 2026', city: 'Belgium', venue: 'Tomorrowland', promoter: 'Tomorrowland NV', fee: '$6,000', deal_type: 'Advanced' },
    ],
    offersInProgress: [],
  },
  {
    name: 'CLAWZ', slug: 'clawz', category: 'priority',
    genre: 'Hard Techno', base: 'Los Angeles, CA',
    spotify: '6.8K', spotify_followers: null,
    instagram: '@_clawz_', instagram_followers: '19K',
    club_fee: '$1,250–$1,500', festival_fee: null,
    manager_name: 'Neil', manager_email: 'neil@republikmanagement.com',
    label: 'Ill Behavior Techno (co-founder)', eu_agent: null,
    notes: '⚠️ RADIUS ACTIVE: No AZ, NV, UT, CA, or Baja California shows Jan 17 – Aug 15, 2026 (EDC LV clause). Penalty: 60% fee reduction if breached.',
    confirmedShows: [
      { event_date: 'May 16–18, 2026', city: 'Las Vegas, NV', venue: 'EDC Las Vegas — Wasteland Stage', promoter: 'Insomniac', fee: '$3,500', deal_type: 'Contracted' },
    ],
    offersInProgress: [],
  },
  {
    name: 'DRAKK', slug: 'drakk', category: 'priority',
    genre: 'Industrial Techno / Schranz', base: 'San Jose, CA',
    spotify: '99.8K', spotify_followers: null,
    instagram: null, instagram_followers: null,
    club_fee: 'TBD', festival_fee: null,
    manager_name: 'Brendan', manager_email: 'brendan@megadog.io',
    label: 'KKULA (own w/ FÜÜLROD), NEOACID, Factory93', eu_agent: null,
    notes: 'Support from Amelie Lens, Sara Landry, DYEN, Dax J. SF buyer communicated offer via WhatsApp only — push to email for official offer.',
    confirmedShows: [],
    offersInProgress: [
      { event_date: 'May 2026', market: 'San Francisco, CA', venue: 'Warehouse TBD', buyer: 'Bounce SF', buyer_company: 'Bounce SF', fee_offered: '$2,000', stage: 'Offer In' },
    ],
  },
  {
    name: 'HELLBOUND!', slug: 'hellbound', category: 'priority',
    genre: 'Hard Techno', base: 'Los Angeles, CA',
    spotify: '82K', spotify_followers: null,
    instagram: '@itshellbound', instagram_followers: '11K',
    club_fee: 'TBD', festival_fee: null,
    manager_name: 'The Hard Haven', manager_email: 'mgmt@thehardhaven.com',
    label: 'Raveyard Sounds (owner), Nullsect (co-founder)', eu_agent: null,
    notes: 'Vancouver Kayzo support show Jun 2026 confirmed.',
    confirmedShows: [
      { event_date: 'Jun 2026', city: 'Vancouver, BC', venue: 'TBD', promoter: 'Independent', fee: 'TBD', deal_type: 'Confirmed' },
    ],
    offersInProgress: [],
  },
  {
    name: 'TRIPTYKH', slug: 'triptykh', category: 'priority',
    genre: 'Hard Techno', base: 'Dallas, TX',
    spotify: null, spotify_followers: null,
    instagram: '@triptykh', instagram_followers: null,
    club_fee: 'TBD', festival_fee: null,
    manager_name: 'Brendan', manager_email: 'brendan@megadog.io',
    label: null, eu_agent: null,
    notes: 'Asia/Aus/NZ territory handled by PAXX Group (andrew@paxxgroup.com).',
    confirmedShows: [],
    offersInProgress: [
      { event_date: 'Aug 2026', market: 'Denver, CO', venue: 'TBD', buyer: 'Local Promoter', buyer_company: null, fee_offered: '$1,800', stage: 'Request' },
    ],
  },
  {
    name: 'MORELIA', slug: 'morelia', category: 'priority',
    genre: 'Hard Techno', base: 'Los Angeles, CA',
    spotify: null, spotify_followers: null,
    instagram: '@moreliamusic', instagram_followers: null,
    club_fee: 'TBD', festival_fee: null,
    manager_name: null, manager_email: null,
    label: 'Teethy Records (owner)', eu_agent: null,
    notes: 'Boiler Room set. International shows in London, Paris, Sydney.',
    confirmedShows: [],
    offersInProgress: [
      { event_date: 'Jun 2026', market: 'London, UK', venue: 'Underground TBD', buyer: 'UK Promoter', buyer_company: null, fee_offered: '£2,500', stage: 'Offer In' },
    ],
  },
  {
    name: 'KETTING', slug: 'ketting', category: 'priority',
    genre: 'Hard Techno (LIVE)', base: 'Rotterdam, Netherlands',
    spotify: '6.4K', spotify_followers: null,
    instagram: '@ketting.live', instagram_followers: null,
    club_fee: 'TBD', festival_fee: null,
    manager_name: null, manager_email: null,
    label: 'No Rest (owner)', eu_agent: 'Octaine (Gearbox) — SIGNED',
    notes: '⚠️ LIVE artist — different tech/production rider than DJ.',
    confirmedShows: [], offersInProgress: [],
  },
  {
    name: 'MAD DOG', slug: 'mad-dog', category: 'priority',
    genre: 'Hard Techno / Hardcore', base: 'Netherlands',
    spotify: '222K', spotify_followers: null,
    instagram: null, instagram_followers: null,
    club_fee: '$4,000–$6,000', festival_fee: null,
    manager_name: 'Liz', manager_email: 'liz@djmaddog.com',
    label: 'Dogfight Records (owner)', eu_agent: 'Jinn Agency (HT), Most Wanted (HC)',
    notes: 'EU Hard Techno: bookings@jinnagency.com. EU Hardcore: shannon@mostwanted.dj. NYC offer at $3,500 is below $4,000 floor — counter or decline.',
    confirmedShows: [],
    offersInProgress: [
      { event_date: 'Aug 2026', market: 'New York, NY', venue: 'Club TBD', buyer: 'Bunker NYC', buyer_company: 'Bunker NYC', fee_offered: '$3,500', fee_target: '$4,000', stage: 'Negotiating' },
    ],
  },
  {
    name: 'AniMe', slug: 'anime', category: 'priority',
    genre: 'Hard Techno / Hard Dance', base: 'Belgium',
    spotify: '278.9K', spotify_followers: null,
    instagram: '@djanimeofficial', instagram_followers: '253K',
    club_fee: null, festival_fee: '$3,500–$6,000',
    manager_name: null, manager_email: null,
    label: null, eu_agent: null,
    notes: 'Biggest Instagram following on roster (253K). Strong festival potential.',
    confirmedShows: [],
    offersInProgress: [
      { event_date: 'Sep 2026', market: 'Dallas, TX', venue: 'Hard Techno Festival TBD', buyer: 'Trinity / Sxtcy', buyer_company: 'Trinity / Sxtcy', fee_offered: '$5,000', stage: 'Negotiating' },
    ],
  },
  {
    name: 'DR. GRECO', slug: 'dr-greco', category: 'priority',
    genre: 'Hard Techno / House', base: 'Miami, FL',
    spotify: null, spotify_followers: null,
    instagram: '@grecoshouse', instagram_followers: '17K',
    club_fee: 'TBD', festival_fee: null,
    manager_name: 'Greg', manager_email: 'greg@grtmgmt.com',
    label: 'Rawsome Recordings (founder)', eu_agent: null,
    notes: 'Support from Calvin Harris, Patrick Topping, Mau P.',
    confirmedShows: [],
    offersInProgress: [
      { event_date: 'Oct 2026', market: 'Miami, FL', venue: 'TBD', buyer: 'Domicile Miami', buyer_company: 'Domicile Miami', fee_offered: 'TBD', stage: 'Inquiry' },
    ],
  },
  // ── FULL ROSTER ────────────────────────────────────────────────────────────
  { name: 'Anoluxx', slug: 'anoluxx', category: 'roster', genre: 'Hard Techno', base: 'TBD', spotify: null, spotify_followers: null, instagram: null, instagram_followers: null, club_fee: 'TBD', festival_fee: null, manager_name: null, manager_email: null, label: null, eu_agent: null, notes: '', confirmedShows: [], offersInProgress: [] },
  { name: 'Water Spirit', slug: 'water-spirit', category: 'roster', genre: 'Hard Techno', base: 'Los Angeles, CA', spotify: '38K', spotify_followers: null, instagram: null, instagram_followers: null, club_fee: 'TBD', festival_fee: null, manager_name: 'Dalton', manager_email: 'dalton@excalibermgmt.com', label: null, eu_agent: null, notes: 'Trans artist.', confirmedShows: [], offersInProgress: [] },
  { name: 'Dea Magna', slug: 'dea-magna', category: 'roster', genre: 'Hard Techno / Schranz', base: 'Los Angeles, CA', spotify: '42.7K', spotify_followers: null, instagram: null, instagram_followers: null, club_fee: 'TBD', festival_fee: null, manager_name: null, manager_email: null, label: 'Filth On Acid, Virgin Records, Revealed', eu_agent: null, notes: '', confirmedShows: [], offersInProgress: [] },
  { name: 'Jenna Shaw', slug: 'jenna-shaw', category: 'roster', genre: 'Hard Techno / Acid', base: 'Austin, TX', spotify: null, spotify_followers: null, instagram: null, instagram_followers: null, club_fee: 'TBD', festival_fee: null, manager_name: null, manager_email: null, label: null, eu_agent: null, notes: 'Sara Landry NA tour manager.', confirmedShows: [], offersInProgress: [] },
  { name: 'Jay Toledo', slug: 'jay-toledo', category: 'roster', genre: 'Industrial Techno', base: 'Miami, FL', spotify: null, spotify_followers: null, instagram: null, instagram_followers: null, club_fee: 'TBD', festival_fee: null, manager_name: null, manager_email: null, label: 'Bootshaus Music (Universal Music) debut', eu_agent: null, notes: 'Nicaraguan, based in Miami. Bootshaus Music debut.', confirmedShows: [], offersInProgress: [] },
  { name: 'Naomi Luna', slug: 'naomi-luna', category: 'roster', genre: 'Hard Techno / Schranz', base: 'Miami, FL', spotify: '17', spotify_followers: null, instagram: null, instagram_followers: null, club_fee: 'TBD', festival_fee: null, manager_name: null, manager_email: null, label: null, eu_agent: null, notes: 'Italian/Cuban. Ground Zero Miami resident.', confirmedShows: [], offersInProgress: [] },
  { name: 'Gioh Cecato', slug: 'gioh-cecato', category: 'roster', genre: 'Hard Techno', base: 'Miami, FL', spotify: '484', spotify_followers: null, instagram: null, instagram_followers: null, club_fee: 'TBD', festival_fee: null, manager_name: 'Domicile', manager_email: 'sisraeli78@yahoo.com', label: null, eu_agent: null, notes: 'Brazil-born, Miami-based. Domicile Miami resident.', confirmedShows: [], offersInProgress: [] },
  { name: 'Pixie Dust', slug: 'pixie-dust', category: 'roster', genre: 'InnaTrance / EuroDance', base: 'Los Angeles → Berlin', spotify: '12.2K', spotify_followers: null, instagram: null, instagram_followers: null, club_fee: 'TBD', festival_fee: null, manager_name: 'Flynn', manager_email: 'Flynn@terminalmgmt.com', label: null, eu_agent: null, notes: 'Mexican. EU/Asia handled by Flynn @ Terminal Management.', confirmedShows: [], offersInProgress: [] },
  { name: 'Death Code', slug: 'death-code', category: 'roster', genre: 'Hard Industrial Techno', base: 'Los Angeles, CA', spotify: null, spotify_followers: null, instagram: null, instagram_followers: null, club_fee: 'TBD', festival_fee: null, manager_name: null, manager_email: null, label: null, eu_agent: null, notes: 'Real name: Garcia. NA bookings: dho@corsonagency.com. UK bookings: joshwarfareagent@gmail.com.', confirmedShows: [], offersInProgress: [] },
  { name: 'Taylor Torrence', slug: 'taylor-torrence', category: 'roster', genre: 'Hard Techno / Trance Hybrid', base: 'Los Angeles, CA', spotify: '310.6K', spotify_followers: null, instagram: null, instagram_followers: null, club_fee: '$1,500 all-in', festival_fee: null, manager_name: null, manager_email: null, label: null, eu_agent: null, notes: 'Practicing lawyer.', confirmedShows: [], offersInProgress: [] },
  { name: 'SIHK', slug: 'sihk', category: 'roster', genre: 'Hard Dance / Hardcore', base: 'Jakarta, Indonesia', spotify: null, spotify_followers: null, instagram: null, instagram_followers: null, club_fee: 'TBD', festival_fee: null, manager_name: null, manager_email: null, label: null, eu_agent: null, notes: 'Real name: Ricky Tjong. Former Rich Brian producer.', confirmedShows: [], offersInProgress: [] },
  { name: 'Lara Klart', slug: 'lara-klart', category: 'roster', genre: 'Psytrance / Hard Techno', base: 'Miami, FL', spotify: '1.5K', spotify_followers: null, instagram: null, instagram_followers: '34K', club_fee: 'TBD', festival_fee: null, manager_name: 'Domicile', manager_email: 'sisraeli78@yahoo.com', label: 'Artcore Records (Indira Paganotto)', eu_agent: null, notes: 'Ecuadorian. 34K Instagram.', confirmedShows: [], offersInProgress: [] },
  { name: 'Cyboy', slug: 'cyboy', category: 'roster', genre: 'Techno', base: 'Los Angeles, CA', spotify: null, spotify_followers: null, instagram: null, instagram_followers: null, club_fee: 'TBD', festival_fee: null, manager_name: null, manager_email: null, label: null, eu_agent: null, notes: 'Emerging, underground.', confirmedShows: [], offersInProgress: [] },
  { name: 'MANDY', slug: 'mandy', category: 'roster', genre: 'Hard Dance', base: 'Ghent, Belgium', spotify: '312.1K', spotify_followers: null, instagram: null, instagram_followers: null, club_fee: 'TBD', festival_fee: null, manager_name: null, manager_email: null, label: null, eu_agent: null, notes: 'Forbes 30 Under 30. Tomorrowland Mainstage 2024 + 2025.', confirmedShows: [], offersInProgress: [] },
  // ── LEO'S ARTISTS ──────────────────────────────────────────────────────────
  { name: 'TNT', slug: 'tnt', category: 'leo', genre: 'Hard Dance', base: 'TBD', spotify: null, spotify_followers: null, instagram: null, instagram_followers: null, club_fee: 'TBD', festival_fee: null, manager_name: null, manager_email: null, label: null, eu_agent: null, notes: "Leo Corson's artist — Danny assists.", confirmedShows: [], offersInProgress: [] },
  { name: 'Dual Damage', slug: 'dual-damage', category: 'leo', genre: 'Hard Dance', base: 'TBD', spotify: null, spotify_followers: null, instagram: null, instagram_followers: null, club_fee: 'TBD', festival_fee: null, manager_name: null, manager_email: null, label: null, eu_agent: null, notes: "Leo Corson's artist — Danny assists.", confirmedShows: [], offersInProgress: [] },
  { name: 'The Purge', slug: 'the-purge', category: 'leo', genre: 'Hard Dance', base: 'TBD', spotify: '457K', spotify_followers: null, instagram: null, instagram_followers: null, club_fee: 'TBD', festival_fee: null, manager_name: null, manager_email: null, label: 'Dirty Workz', eu_agent: 'Platinum Agency', notes: "Leo Corson's artist — Danny assists. EU: Platinum Agency. Dirty Workz.", confirmedShows: [], offersInProgress: [] },
  { name: 'Casska', slug: 'casska', category: 'leo', genre: 'Hard Dance', base: 'TBD', spotify: null, spotify_followers: null, instagram: null, instagram_followers: null, club_fee: 'TBD', festival_fee: null, manager_name: null, manager_email: null, label: null, eu_agent: null, notes: "Leo Corson's artist — Danny assists.", confirmedShows: [], offersInProgress: [] },
];

// ── SEED ─────────────────────────────────────────────────────────────────────
async function seed() {
  console.log('🌱 Seeding Corson Command Center database...\n');

  // 1. Artists
  console.log('Inserting 29 artists...');
  const artistRows = artistData.map(({ confirmedShows, offersInProgress, ...rest }) => ({
    ...rest,
    spotify_followers: parseCount(rest.spotify_followers),
    instagram_followers: parseCount(rest.instagram_followers),
  }));
  const { error: artistErr } = await supabase.from('artists').upsert(artistRows, { onConflict: 'slug' });
  if (artistErr) { console.error('❌ Artists failed:', artistErr.message); process.exit(1); }
  console.log(`✅ ${artistRows.length} artists upserted\n`);

  // Fetch inserted artists to get UUIDs for FK relationships
  const { data: insertedArtists } = await supabase.from('artists').select('id, slug');
  const slugToId = Object.fromEntries(insertedArtists.map((a) => [a.slug, a.id]));

  // 2. Shows (confirmed)
  console.log('Clearing existing shows...');
  await supabase.from('shows').delete().in('artist_slug', artistRows.map((a) => a.slug));

  const showRows = [];
  for (const a of artistData) {
    for (const s of a.confirmedShows) {
      showRows.push({ artist_id: slugToId[a.slug], artist_slug: a.slug, ...s });
    }
  }
  if (showRows.length > 0) {
    const { error: showErr } = await supabase.from('shows').insert(
      showRows.map(({ event_date, ...rest }) => ({
        ...rest,
        event_date: parseDate(event_date),
        notes: rest.notes ? `${event_date} — ${rest.notes}` : event_date,
      }))
    );
    if (showErr) { console.error('❌ Shows failed:', showErr.message); process.exit(1); }
    console.log(`✅ ${showRows.length} confirmed shows inserted\n`);
  } else {
    console.log('ℹ️  No confirmed shows\n');
  }

  // 3. Pipeline (offers/negotiations)
  console.log('Clearing existing pipeline...');
  await supabase.from('pipeline').delete().in('artist_slug', artistRows.map((a) => a.slug));

  const pipelineRows = [];
  for (const a of artistData) {
    for (const p of a.offersInProgress) {
      pipelineRows.push({ artist_id: slugToId[a.slug], artist_slug: a.slug, ...p });
    }
  }
  if (pipelineRows.length > 0) {
    const { error: pipeErr } = await supabase.from('pipeline').insert(
      pipelineRows.map(({ event_date, ...rest }) => ({
        ...rest,
        event_date: parseDate(event_date),
        notes: rest.notes ? `${event_date} — ${rest.notes}` : event_date,
      }))
    );
    if (pipeErr) { console.error('❌ Pipeline failed:', pipeErr.message); process.exit(1); }
    console.log(`✅ ${pipelineRows.length} pipeline deals inserted\n`);
  } else {
    console.log('ℹ️  No pipeline deals\n');
  }

  console.log('🎉 Seed complete!');
}

seed();
