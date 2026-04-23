require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const shows = [
  // SHOGUN
  { slug: 'shogun', date: '2026-05-09', city: 'Albuquerque, NM', venue: 'Effex / Space 515', status: 'Confirmed', event_type: 'Headline' },
  { slug: 'shogun', date: '2026-06-06', city: 'Los Angeles, CA', status: 'Confirmed', notes_extra: 'EDC adjacent show' },
  { slug: 'shogun', date: '2026-06-12', city: 'Columbus, OH', venue: 'The Sanctuary', fee: '$1,250', status: 'Offer', buyer: 'Jake Haller', promoter: 'Nightfall Presents', deal_type: 'Landed', event_type: 'Headline' },
  { slug: 'shogun', date: '2026-06-26', city: 'Boston, MA', venue: 'Crown Boston', fee: '$1,850', status: 'Offer', buyer: 'Zareus Ramos', promoter: 'Zareus Rave', deal_type: 'Landed', event_type: 'Headline' },

  // ANOLUXX
  { slug: 'anoluxx', date: '2026-05-22', city: 'Boston, MA', venue: 'Crown Boston', fee: '$1,850', status: 'Offer', buyer: 'Zareus Ramos', promoter: 'Zareus Rave', deal_type: 'Landed', event_type: 'Headline' },
  { slug: 'anoluxx', date: '2026-07-18', city: 'Salt Lake City, UT', venue: 'Yamila Event Center', status: 'Confirmed', event_type: 'Headline' },

  // CLAWZ
  { slug: 'clawz', date: '2026-05-16', city: 'Las Vegas, NV', venue: 'EDC Las Vegas', status: 'Confirmed', promoter: 'Insomniac', event_type: 'Festival Stage', notes_extra: 'wasteLAND stage' },
  { slug: 'clawz', date: '2026-09-05', city: 'San Bernardino, CA', venue: 'Wasteland Festival', status: 'Confirmed', promoter: 'Insomniac/Mutate', event_type: 'Festival Stage' },

  // JUNKIE KID
  { slug: 'junkie-kid', date: '2026-07-18', city: 'Belgium', venue: 'Tomorrowland', fee: '$6,000', status: 'Confirmed', promoter: 'Tomorrowland', event_type: 'Festival Stage' },

  // JENNA SHAW
  { slug: 'jenna-shaw', date: '2026-04-19', city: 'Indio, CA', venue: 'Coachella Yuma Tent', status: 'Confirmed', promoter: 'Goldenvoice/AEG', event_type: 'Festival Stage' },

  // ANIME
  { slug: 'anime', date: '2026-08-08', city: 'Los Angeles, CA', venue: 'Warehouse', fee: '$5,000', status: 'Offer', promoter: 'Sxtcy', event_type: 'Headline', notes_extra: 'No flights. 30 day LA radius clause.' },
  { slug: 'anime', date: '2026-10-30', city: 'San Bernardino, CA', venue: 'Escape Halloween', status: 'Confirmed', promoter: 'Insomniac', event_type: 'Festival Stage' },
  { slug: 'anime', date: '2026-10-31', city: 'San Bernardino, CA', venue: 'Escape Halloween', status: 'Confirmed', promoter: 'Insomniac', event_type: 'Festival Stage' },

  // DEA MAGNA
  { slug: 'dea-magna', date: '2026-08-29', city: 'San Bernardino, CA', venue: 'Wasteland Festival', status: 'Confirmed', promoter: 'Insomniac/Mutate', event_type: 'Festival Stage' },

  // MAD DOG
  { slug: 'mad-dog', date: '2026-06-20', city: 'EU Tour', status: 'Confirmed', notes_extra: 'EU based, very limited US avails' },
  { slug: 'mad-dog', date: '2026-06-21', city: 'EU Tour', status: 'Confirmed', notes_extra: 'EU based' },
  { slug: 'mad-dog', date: '2026-07-11', city: 'EU Tour', status: 'Confirmed', notes_extra: 'EU based' },
  { slug: 'mad-dog', date: '2026-07-12', city: 'EU Tour', status: 'Confirmed', notes_extra: 'EU based' },
  { slug: 'mad-dog', date: '2026-08-22', city: 'EU Tour', status: 'Confirmed', notes_extra: 'EU based' },
  { slug: 'mad-dog', date: '2026-08-23', city: 'EU Tour', status: 'Confirmed', notes_extra: 'EU based' },
  { slug: 'mad-dog', date: '2026-10-24', city: 'EU Tour', status: 'Confirmed', notes_extra: 'EU based' },
  { slug: 'mad-dog', date: '2026-10-25', city: 'EU Tour', status: 'Confirmed', notes_extra: 'EU based' },

  // MANDY
  { slug: 'mandy', date: '2026-04-24', city: 'Brooklyn, NY', venue: 'Brooklyn Monarch', status: 'Confirmed', event_type: 'Headline', notes_extra: 'Masters of Techno' },
  { slug: 'mandy', date: '2026-04-25', city: 'Denver, CO', venue: 'Warehouse', status: 'Confirmed', event_type: 'Headline', buyer: 'Weston Hartshorn' },

  // LARA KLART
  { slug: 'lara-klart', date: '2026-04-25', city: 'Albuquerque, NM', status: 'Confirmed', event_type: 'Headline' },

  // HELLBOUND
  { slug: 'hellbound', date: '2026-06-12', city: 'Vancouver, BC', status: 'Confirmed', event_type: 'Direct Support', notes_extra: 'Kayzo support' },

  // MORELIA
  { slug: 'morelia', date: '2026-04-11', city: 'Albuquerque, NM', venue: 'Effex', status: 'Confirmed', event_type: 'Headline' },

  // THE PURGE
  { slug: 'the-purge', date: '2026-05-02', city: 'New York, NY', status: 'Confirmed', event_type: 'Headline' },
  { slug: 'the-purge', date: '2026-10-30', city: 'San Bernardino, CA', venue: 'Escape Halloween', status: 'Confirmed', promoter: 'Insomniac', event_type: 'Festival Stage' },
  { slug: 'the-purge', date: '2026-10-31', city: 'San Bernardino, CA', venue: 'Escape Halloween', status: 'Confirmed', promoter: 'Insomniac', event_type: 'Festival Stage' },

  // TRIPTYKH
  { slug: 'triptykh', date: '2026-06-19', city: 'Chicago, IL', venue: 'Cermak Hall', status: 'Offer', promoter: 'Auris Presents', buyer: 'Yianni Papagiannopoulos', event_type: 'Headline' },
];

function buildNotes(s) {
  const parts = [];
  if (s.event_type) parts.push(s.event_type);
  if (s.buyer) parts.push(`Buyer: ${s.buyer}`);
  if (s.notes_extra) parts.push(s.notes_extra);
  return parts.length ? parts.join(' | ') : null;
}

(async () => {
  console.log('=== PUSHING SHOWS TO SUPABASE ===\n');

  const { data: artistsData, error: aErr } = await supabase
    .from('artists').select('id, slug');
  if (aErr) throw aErr;
  const artistBySlug = Object.fromEntries(artistsData.map(a => [a.slug, a.id]));

  let inserted = 0, updated = 0, skipped = 0;
  const touchedArtists = new Set();

  for (const s of shows) {
    const artist_id = artistBySlug[s.slug];
    if (!artist_id) {
      console.log(`SKIP — artist_slug "${s.slug}" not found`);
      skipped++;
      continue;
    }

    const payload = {
      artist_id,
      artist_slug: s.slug,
      event_date: s.date,
      city: s.city,
      venue: s.venue || null,
      promoter: s.promoter || null,
      fee: s.fee || null,
      deal_type: s.deal_type || null,
      status: s.status,
      notes: buildNotes(s),
    };

    const { data: existing, error: exErr } = await supabase
      .from('shows')
      .select('id')
      .eq('artist_slug', s.slug)
      .eq('event_date', s.date);
    if (exErr) { console.error('LOOKUP ERR:', exErr); continue; }

    if (existing && existing.length > 0) {
      const id = existing[0].id;
      // Collapse nulls: don't overwrite existing venue/promoter/fee with null
      const clean = Object.fromEntries(
        Object.entries(payload).filter(([, v]) => v !== null && v !== undefined)
      );
      const { error: upErr } = await supabase
        .from('shows').update(clean).eq('id', id);
      if (upErr) { console.error(`UPDATE ERR [${s.slug} ${s.date}]:`, upErr); continue; }
      console.log(`UPDATED  ${s.slug.padEnd(14)} ${s.date}  ${s.city}${s.venue ? ' @ ' + s.venue : ''}`);
      updated++;
    } else {
      const { error: inErr } = await supabase
        .from('shows').insert(payload);
      if (inErr) { console.error(`INSERT ERR [${s.slug} ${s.date}]:`, inErr); continue; }
      console.log(`INSERTED ${s.slug.padEnd(14)} ${s.date}  ${s.city}${s.venue ? ' @ ' + s.venue : ''}`);
      inserted++;
    }
    touchedArtists.add(s.slug);
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Inserted: ${inserted}`);
  console.log(`Updated:  ${updated}`);
  console.log(`Skipped:  ${skipped}`);
  console.log(`Artists touched: ${touchedArtists.size} — ${[...touchedArtists].join(', ')}`);
})();
