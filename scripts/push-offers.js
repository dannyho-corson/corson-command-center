require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const offers = [
  {
    artist_slug: 'shogun',
    event_date: '2026-06-12',
    city: 'Columbus', state: 'OH',
    venue: 'The Sanctuary',
    fee_offered: '$1,250',
    bonus_structure: '$500 sellout bonus',
    walkout_potential: '$1,750',
    deal_type: 'Landed',
    hotel_included: true, ground_included: true, rider_included: true,
    capacity: 250, age_restriction: '18+', event_type: 'Headline',
    buyer: 'Jake Haller',
    buyer_email: 'jake@nightfallpresents.com',
    buyer_phone: '614-907-0085',
    buyer_company: 'Nightfall Presents',
    set_time: '1:30AM-3:00AM',
    stage: 'Offer In + Negotiating',
  },
  {
    artist_slug: 'anoluxx',
    event_date: '2026-05-22',
    city: 'Boston', state: 'MA',
    venue: 'Crown Boston',
    fee_offered: '$1,850',
    bonus_structure: '$650 after 380 tickets sold',
    walkout_potential: '$2,500',
    deal_type: 'Landed',
    hotel_included: true, ground_included: true, rider_included: true,
    capacity: 400, age_restriction: '21+', event_type: 'Headline',
    buyer: 'Zareus Ramos',
    buyer_email: '1NITIAL.Z117@GMAIL.COM',
    buyer_phone: '978-956-4632',
    buyer_company: 'Zareus Rave',
    set_time: '12AM-1AM',
    radius_clause: '50 miles',
    extra_notes: 'Z Fest event',
    stage: 'Offer In + Negotiating',
  },
  {
    artist_slug: 'shogun',
    event_date: '2026-06-26',
    city: 'Boston', state: 'MA',
    venue: 'Crown Boston',
    fee_offered: '$1,850',
    bonus_structure: '$650 after 380 tickets sold',
    walkout_potential: '$2,500',
    deal_type: 'Landed',
    hotel_included: true, ground_included: true, rider_included: true,
    capacity: 400, age_restriction: '21+', event_type: 'Headline',
    buyer: 'Zareus Ramos',
    buyer_email: '1NITIAL.Z117@GMAIL.COM',
    buyer_phone: '978-956-4632',
    buyer_company: 'Zareus Rave',
    set_time: '12AM-1AM',
    radius_clause: '50 miles',
    extra_notes: 'Hard Dance Rave. Same buyer as Anoluxx May 22 — Zareus has offers out for both artists',
    stage: 'Offer In + Negotiating',
  },
  {
    artist_slug: 'anime',
    event_date: '2026-08-08',
    city: 'Los Angeles', state: 'CA',
    venue: 'Warehouse TBD',
    fee_offered: '$5,000',
    bonus_structure: '$1,000 presale sellout bonus only — no bonus for door sales',
    walkout_potential: '$6,000',
    deal_type: 'Landed',
    hotel_included: true, ground_included: true, rider_included: true,
    capacity: 1000, age_restriction: '21+', event_type: 'Headline',
    buyer: null,
    buyer_email: null,
    buyer_phone: null,
    buyer_company: 'Sxtcy',
    set_time: 'TBD',
    radius_clause: 'No other LA shows 30 days before or after',
    extra_notes: 'Warehouse afterparty. No flights included. Previously booked Shalomo and Fantasm.',
    stage: 'Offer In + Negotiating',
  },
];

const buyers = [
  {
    name: 'Zareus Ramos',
    email: '1NITIAL.Z117@GMAIL.COM',
    phone: '978-956-4632',
    company: 'Zareus Rave',
    market: 'Boston, MA',
    status: 'Warm',
  },
  {
    name: 'Jake Haller',
    email: 'jake@nightfallpresents.com',
    phone: '614-907-0085',
    company: 'Nightfall Presents',
    market: 'Columbus, OH',
    status: 'Warm',
  },
];

function buildNotes(o) {
  const lines = [];
  lines.push(`Event type: ${o.event_type}`);
  lines.push(`Capacity: ${o.capacity} (${o.age_restriction})`);
  lines.push(`Set time: ${o.set_time}`);
  lines.push(`Bonus: ${o.bonus_structure}`);
  lines.push(`Walkout potential: ${o.walkout_potential}`);
  const inc = [];
  if (o.hotel_included) inc.push('hotel');
  if (o.ground_included) inc.push('ground');
  if (o.rider_included) inc.push('rider');
  if (inc.length) lines.push(`Included: ${inc.join(', ')}`);
  if (o.radius_clause) lines.push(`Radius: ${o.radius_clause}`);
  if (o.buyer_email) lines.push(`Buyer email: ${o.buyer_email}`);
  if (o.buyer_phone) lines.push(`Buyer phone: ${o.buyer_phone}`);
  if (o.extra_notes) lines.push(o.extra_notes);
  return lines.join('\n');
}

(async () => {
  console.log('=== PUSHING OFFERS TO PIPELINE ===\n');

  // Artist lookups
  const { data: artistsData, error: aErr } = await supabase
    .from('artists').select('id, slug');
  if (aErr) throw aErr;
  const artistBySlug = Object.fromEntries(artistsData.map(a => [a.slug, a.id]));

  for (const o of offers) {
    const artist_id = artistBySlug[o.artist_slug];
    if (!artist_id) {
      console.log(`SKIP — artist_slug "${o.artist_slug}" not found in artists table`);
      continue;
    }

    const payload = {
      artist_id,
      artist_slug: o.artist_slug,
      stage: o.stage,
      event_date: o.event_date,
      market: `${o.city}, ${o.state}`,
      venue: o.venue,
      buyer: o.buyer,
      buyer_company: o.buyer_company,
      fee_offered: o.fee_offered,
      deal_type: o.deal_type,
      notes: buildNotes(o),
    };

    // Check existing
    const { data: existing, error: exErr } = await supabase
      .from('pipeline')
      .select('id')
      .eq('artist_slug', o.artist_slug)
      .eq('event_date', o.event_date);
    if (exErr) { console.error('LOOKUP ERR:', exErr); continue; }

    if (existing && existing.length > 0) {
      const id = existing[0].id;
      const { error: upErr } = await supabase
        .from('pipeline').update(payload).eq('id', id);
      if (upErr) console.error(`UPDATE ERR [${o.artist_slug} ${o.event_date}]:`, upErr);
      else console.log(`UPDATED  ${o.artist_slug}  ${o.event_date}  ${o.city}  (id=${id})`);
    } else {
      const { data: ins, error: inErr } = await supabase
        .from('pipeline').insert(payload).select('id');
      if (inErr) console.error(`INSERT ERR [${o.artist_slug} ${o.event_date}]:`, inErr);
      else console.log(`INSERTED ${o.artist_slug}  ${o.event_date}  ${o.city}  (id=${ins[0].id})`);
    }
  }

  console.log('\n=== UPSERTING BUYERS ===\n');
  for (const b of buyers) {
    const { data: existing, error: exErr } = await supabase
      .from('buyers')
      .select('id')
      .eq('email', b.email);
    if (exErr) { console.error('LOOKUP ERR:', exErr); continue; }

    // buyers schema does not have phone — store phone in notes
    const payload = {
      name: b.name,
      company: b.company,
      market: b.market,
      email: b.email,
      status: b.status,
      notes: `Phone: ${b.phone}`,
    };

    if (existing && existing.length > 0) {
      const id = existing[0].id;
      const { error: upErr } = await supabase
        .from('buyers').update(payload).eq('id', id);
      if (upErr) console.error(`BUYER UPDATE ERR [${b.name}]:`, upErr);
      else console.log(`BUYER EXISTS  ${b.name}  (id=${id}) — updated`);
    } else {
      const { data: ins, error: inErr } = await supabase
        .from('buyers').insert(payload).select('id');
      if (inErr) console.error(`BUYER INSERT ERR [${b.name}]:`, inErr);
      else console.log(`BUYER ADDED   ${b.name}  (id=${ins[0].id})`);
    }
  }

  console.log('\nDone.');
})();
