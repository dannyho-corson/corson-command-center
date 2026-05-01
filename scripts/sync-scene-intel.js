#!/usr/bin/env node
/*
 * One-off sync from CORSON_SCENE_INTEL.md → industry_intel table.
 *
 * Source of truth: ~/Documents/Corson Agency/CORSON_SCENE_INTEL.md
 * (the doc itself is the human-facing strategy reference; this script
 *  mirrors the structured-enough sections into Supabase so the
 *  Dashboard widget reflects current scene knowledge.)
 *
 * Categories synced:
 *   • festival — festival pipeline section
 *   • agency   — agency map (JINN, ATA, Odysseys, etc.)
 *   • trend    — strategic synthesis insights
 *
 * NOT synced: buyer rows. Existing buyer rows in industry_intel are
 * left untouched.
 *
 * Upserts on (category, name). Existing rows are UPDATED in place;
 * new rows are INSERTED. Nothing is ever deleted by this script.
 *
 * Safe to re-run.
 */
const fs = require('fs');
const path = require('path');

// ── Config ──────────────────────────────────────────────────────────────────
// Doc moved from ~/Downloads/ to ~/Documents/Corson Agency/ as the stable
// source. Update this path if the doc moves again.
const SCENE_INTEL_PATH = path.join(
  process.env.HOME,
  'Documents',
  'Corson Agency',
  'CORSON_SCENE_INTEL.md'
);

const ENV_PATH = path.join(__dirname, '.env');
const raw = fs.readFileSync(ENV_PATH, 'utf8');
const env = {};
for (const line of raw.split('\n')) {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const { createClient } = require(path.join(__dirname, '..', 'node_modules/@supabase/supabase-js/dist/index.cjs'));
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

const TODAY = new Date().toISOString().slice(0, 10);

// ── Existence check ─────────────────────────────────────────────────────────
// We read the doc only to confirm it exists and to log a freshness timestamp.
// The structured entries below are hand-extracted (not parsed) because the
// doc is prose-heavy and parsing it brittle. When the doc gets a meaningful
// update, re-curate the entries below in this file.
if (!fs.existsSync(SCENE_INTEL_PATH)) {
  console.error(`SCENE_INTEL_PATH does not exist: ${SCENE_INTEL_PATH}`);
  process.exit(1);
}
const docMtime = fs.statSync(SCENE_INTEL_PATH).mtime.toISOString().slice(0, 10);
console.log(`Source doc: ${SCENE_INTEL_PATH} (mtime ${docMtime})`);

// ── Structured entries ──────────────────────────────────────────────────────
// Curated from CORSON_SCENE_INTEL.md (Apr 26 2026 cook session).
// To refresh: re-read the doc, edit these arrays, re-run the script.

const FESTIVALS = [
  // ── Velocity / Legitimacy / Conversion / Prestige tier ───────────────────
  {
    name: 'Verknipt',
    market: 'Netherlands',
    corson_status: 'target',
    priority: 'urgent',
    notes: 'Velocity platform — single clearest scene signal for who is next. 4 stages, 40,000-cap ArenA, Easter + NYE specials. Path in: through Odysseys / JINN / direct.',
    why_it_matters: 'Single biggest unlock for Tier 3 → Tier 2 jumps. Named buyer is an open intel gap — find via ADE 2026.',
    description: 'Netherlands hard-techno velocity platform — 2026 lineup includes KLOFAMA, JAZZY, Restricted, Vieze Asbak.',
    key_contacts: 'UNVERIFIED — gap to fill. Path likely through Odysseys / JINN.',
    corson_artists: [],
  },
  {
    name: 'Awakenings',
    market: 'Netherlands',
    corson_status: 'target',
    priority: 'high',
    notes: 'Legitimacy platform — comes AFTER Verknipt in the playbook. Tests durability and long-term techno-market demand. 80,000 over weekend, 8 areas, plus Upclose/Easter/Spring/Winter editions.',
    why_it_matters: 'Awakenings invites once Verknipt validates. Stage logic = market partition signals. Area Y is the hard/new-wave lane.',
    description: 'The legitimacy platform — once Verknipt validates, Awakenings invites.',
    key_contacts: 'UNVERIFIED — gap to fill.',
    corson_artists: [],
  },
  {
    name: 'EDC Las Vegas Wasteland',
    market: 'Las Vegas, NV',
    corson_status: 'in',
    priority: 'high',
    event_date: 'May 15-17, 2026',
    notes: 'Insomniac. Our home court via Leo + Basscon history. 2026 Wasteland is the decisive year — now a genuine hard-techno + crossover import platform.',
    why_it_matters: 'Push for max Corson artists at Wasteland 2027. CLAWZ priority for 2027 mainstream consideration.',
    description: 'US conversion engine — 525,000+ across the weekend. Strongest formal infrastructure for hard techno in the US.',
    key_contacts: 'Matt Smith + Carlos (Mutate), Jasper Li (Basscon), Naar Sahakian, Jackie Bray',
    corson_artists: ['clawz', 'junkie-kid', 'mad-dog', 'sihk', 'dea-magna', 'the-purge'],
  },
  {
    name: 'Tomorrowland',
    market: 'Belgium / Global',
    corson_status: 'in',
    priority: 'medium',
    event_date: 'July 2026',
    notes: 'Q-dance + CORE stages. Hard styles host block on Q-dance. CORE is melodic/leftfield (deeper crossover audience neorave/hardgroove eventually want).',
    why_it_matters: 'Ceiling indicator more than origin point — where artists confirm they have made it, not where they break.',
    description: 'Prestige validator. 400,000 over two weekends, 16 stages. CORE LA expansion confirms US prestige reach.',
    key_contacts: 'Beers brothers (founders)',
    corson_artists: ['mandy', 'junkie-kid', 'tnt', 'dual-damage'],
  },

  // ── Strategic targets (no Corson yet) ────────────────────────────────────
  {
    name: 'Time Warp Miami',
    market: 'Miami, FL',
    corson_status: 'target',
    priority: 'urgent',
    event_date: 'April 25, 2026',
    notes: 'Cosmopop. Maarten van Dulst at Verknipt is a warm lead per our notes. Push for 2027 placement.',
    why_it_matters: 'Global benchmark EU fest expanding US — nobody Corson is in yet. Miami leg already past for 2026 — pivot to 2027.',
    description: 'Mannheim → Miami → NYC. EU benchmark rolling into US.',
    key_contacts: 'Maarten van Dulst (Verknipt) — warm lead',
    corson_artists: [],
  },
  {
    name: 'Time Warp NYC',
    market: 'New York, NY',
    corson_status: 'target',
    priority: 'urgent',
    event_date: 'November 2026',
    notes: 'No Corson presence — the urgent NA target. Pair with Time Warp Miami warm-lead approach via Maarten van Dulst.',
    why_it_matters: 'NYC market exposure for the entire roster on a credible global brand.',
    description: 'Time Warp NYC edition — fall 2026.',
    key_contacts: 'Maarten van Dulst (Verknipt) — warm lead',
    corson_artists: [],
  },
  {
    name: 'Movement Detroit',
    market: 'Detroit, MI',
    corson_status: 'dream',
    priority: 'high',
    event_date: 'May 23-26, 2026',
    notes: 'Paxahau — most credible US techno brand. Dream target.',
    why_it_matters: 'Most credible US techno credential available. Tier 1 legitimacy.',
    description: 'Paxahau — Memorial Day weekend US techno institution.',
    key_contacts: 'Paxahau (booker UNVERIFIED)',
    corson_artists: [],
  },
  {
    name: 'HARD Summer',
    market: 'Los Angeles, CA',
    corson_status: 'target',
    priority: 'high',
    event_date: 'Aug 1-2, 2026',
    notes: 'HARD Events / Live Nation. LA-based.',
    why_it_matters: 'LA festival-stage entry point outside the Insomniac orbit.',
    description: 'HARD Events / Live Nation — hard-leaning LA mainstream.',
    key_contacts: 'HARD Events (Live Nation)',
    corson_artists: [],
  },
  {
    name: 'ADE Amsterdam',
    market: 'Amsterdam, NL',
    corson_status: 'target',
    priority: 'urgent',
    event_date: 'Oct 21-25, 2026',
    notes: '30th anniversary 2026 = highest-leverage scene event of the year. The launchpad. Don\'t miss.',
    why_it_matters: 'Industry conference where the Verknipt / Awakenings / Boiler Room conversations actually happen. Plan attendance with meetings booked: Odysseys, JINN, ATA, KNTXT, R Label Group, 240 KM/H, Artcore.',
    description: 'Amsterdam Dance Event — 30th anniversary edition, the industry launchpad.',
    key_contacts: 'Industry-wide — not a single buyer',
    corson_artists: [],
  },
  {
    name: 'Possession Paris',
    market: 'Paris, FR',
    corson_status: 'target',
    priority: 'medium',
    notes: 'I Hate Models\' fest — dark French hard techno.',
    why_it_matters: 'Paris dark/industrial credibility platform. Adjacent to DRAKK and Triptykh\'s lane.',
    description: 'Dark French hard techno — I Hate Models territory.',
    key_contacts: 'I Hate Models / Possession org',
    corson_artists: [],
  },
  {
    name: 'Defqon.1',
    market: 'Netherlands',
    corson_status: 'target',
    priority: 'medium',
    notes: 'Q-dance hardstyle pilgrimage. Leo\'s territory.',
    why_it_matters: 'Hardstyle tier credential — relevant for The Purge and Leo\'s roster, secondary for hard-techno developmental artists.',
    description: 'Q-dance hardstyle institution.',
    key_contacts: 'Q-dance (booker UNVERIFIED)',
    corson_artists: [],
  },
  {
    name: 'Rotterdam Rave',
    market: 'Rotterdam, NL',
    corson_status: 'target',
    priority: 'medium',
    notes: 'Verknipt org\'s home-base brand. Adjacent to the Verknipt path.',
    why_it_matters: 'Routing pair to Verknipt — same org, easier secondary placement once the relationship lands.',
    description: 'Verknipt-affiliated Rotterdam rave brand.',
    key_contacts: 'Verknipt org',
    corson_artists: [],
  },
  {
    name: 'Awakenings Monegros',
    market: 'Spain',
    corson_status: 'target',
    priority: 'high',
    notes: 'Spain heat zone confirmation event. Junkie Kid corridor.',
    why_it_matters: 'Spain validation for the bounce/hard-techno hybrid lane. Direct unlock for JK Spanish-corridor strategy.',
    description: 'Spain heat zone festival validation.',
    key_contacts: 'Awakenings org',
    corson_artists: [],
  },
  {
    name: 'Coachella Yuma',
    market: 'Indio, CA',
    corson_status: 'in',
    priority: 'medium',
    event_date: 'April 2026',
    notes: 'Goldenvoice underground tent. Jenna Shaw confirmed — her credential.',
    why_it_matters: 'US underground prestige outside the Insomniac orbit.',
    description: 'Goldenvoice underground tent.',
    key_contacts: 'Goldenvoice',
    corson_artists: ['jenna-shaw'],
  },
  {
    name: 'Escape Halloween',
    market: 'San Bernardino, CA',
    corson_status: 'in',
    priority: 'medium',
    event_date: 'Oct 30-31, 2026',
    notes: 'Insomniac Halloween. Anime + The Purge confirmed.',
    why_it_matters: 'Insomniac Halloween anchor — pair with Wasteland for Q4 US strategy.',
    description: 'Insomniac Halloween weekender.',
    key_contacts: 'Insomniac (Mutate / Basscon contacts apply)',
    corson_artists: ['anime', 'the-purge'],
  },
];

const AGENCIES = [
  // ── Top three priorities ──────────────────────────────────────────────────
  {
    name: 'JINN Agency',
    market: 'EU / Global',
    corson_status: 'in',
    priority: 'high',
    notes: 'Already partial via Mad Dog (EU hard techno). Roster: 4000HZ, Alex Farell, Azyr, Cybersex, DJ Cringey, Faster Horses, JAZZY, JOWI, Kander, KIRSTY.',
    why_it_matters: 'Specialist EU hard-techno representation — every Tier 3 → Tier 2 jumper had a JINN/Odysseys/ATA-style stack. Deepen relationship to get developmental artists onto support slots when JINN roster headlines US.',
    description: 'Specialist EU hard-techno booking agency.',
    key_contacts: 'bookings@jinnagency.com',
    corson_artists: ['mad-dog'],
  },
  {
    name: 'Active Talent Agency (ATA)',
    market: 'Americas',
    corson_status: 'in',
    priority: 'high',
    notes: 'Already partial via Josh Haygarth (Junkie Kid ROW). Roster: Azyr, Alex Farell, Cybersex, DØMINA, JOWI, Nikolina + Teletech brand tour.',
    why_it_matters: 'Cleanest EU-to-Americas bridge. Ask Josh for warm intros to ATA\'s hard-techno desk for CLAWZ + others.',
    description: 'Americas-side specialist agency for hard techno.',
    key_contacts: 'Josh Haygarth (josh@activetalentagency.com) — warm via Junkie Kid ROW',
    corson_artists: ['junkie-kid'],
  },
  {
    name: 'Odysseys',
    market: 'Netherlands',
    corson_status: 'target',
    priority: 'urgent',
    notes: 'NEW relationship to build. Priority cold outreach. Roster: Fantasm, Karah, KLOFAMA, Winson — direct comps for Shogun\'s lane.',
    why_it_matters: 'THE move for Shogun. Same lane, same agency model, same Verknipt-target trajectory. Pitch Shogun in particular, citing Leo\'s lineage + EU tour proof points.',
    description: 'Dutch specialist — Falsive ecosystem, industrial hard-techno crossover.',
    key_contacts: 'hanne@odysseys.nl',
    corson_artists: [],
  },

  // ── Second tier (relevant, not priority) ──────────────────────────────────
  {
    name: 'Pure Bookings',
    market: 'Netherlands',
    corson_status: 'target',
    priority: 'medium',
    notes: 'Netherlands hard styles giant. Useful for rawstyle/hardcore/faster crossover routing.',
    why_it_matters: 'Adjacent crossover routing — relevant for hardstyle-leaning developmental artists.',
    description: 'Netherlands hard-styles agency.',
    key_contacts: 'info@purebookings.nl',
    corson_artists: [],
  },
  {
    name: 'Most Wanted DJ Agency',
    market: 'EU',
    corson_status: 'in',
    priority: 'medium',
    notes: 'Hard dance heavyweight. Already partial via AniMe + Mad Dog (Shannon for hardcore).',
    why_it_matters: 'Critical adjacent crossover house for hardcore/uptempo/frenchcore needs.',
    description: 'Hard-dance / hardcore booking heavyweight.',
    key_contacts: 'shannon@mostwanted.dj',
    corson_artists: ['anime', 'mad-dog'],
  },
  {
    name: 'Platinum Agency',
    market: 'Amsterdam, NL',
    corson_status: 'in',
    priority: 'medium',
    notes: 'Amsterdam. Big-room hard styles. Already partial via The Purge (Leo\'s roster).',
    why_it_matters: 'Hard-styles bridge — relevant for The Purge advancing and routing pairs.',
    description: 'Amsterdam big-room hard-styles agency.',
    key_contacts: 'info@platinum-agency.com',
    corson_artists: ['the-purge'],
  },
  {
    name: 'Adrenaline Booking',
    market: 'Cologne, DE',
    corson_status: 'target',
    priority: 'medium',
    notes: 'Adrián Mills\' agency — direct comp for Junkie Kid in the bounce-hard-techno lane.',
    why_it_matters: 'German market intel + 240 KM/H ecosystem proximity. Worth direct outreach for Junkie Kid Spain corridor strategy.',
    description: 'Cologne specialist — bounce-hard-techno, 240 KM/H-adjacent.',
    key_contacts: 'paul@adrenalinebooking.de',
    corson_artists: [],
  },
  {
    name: 'Octane Agency',
    market: 'EU',
    corson_status: 'in',
    priority: 'medium',
    notes: 'Late 2025 launch. Hardstyle-to-hard-techno funnel via Pure Bookings. Already partial via Ketting.',
    why_it_matters: 'Hardstyle-to-hard-techno bridge — Ketting overlap means there is an existing relationship to deepen.',
    description: 'Hardstyle-to-hard-techno funnel agency.',
    key_contacts: 'info@octane-agency.com',
    corson_artists: ['ketting'],
  },
  {
    name: 'PAXX Group / Audiopaxx',
    market: 'Sydney, AU',
    corson_status: 'in',
    priority: 'medium',
    notes: 'Sydney. Already partial via Triptykh (Asia/Aus/NZ).',
    why_it_matters: 'ROW partner for Triptykh, with extension potential for other roster artists routing through Asia/Aus.',
    description: 'Asia/Aus/NZ booking group.',
    key_contacts: 'andrew@paxxgroup.com',
    corson_artists: ['triptykh'],
  },
  {
    name: 'Cubbo Bookings',
    market: 'Barcelona, ES',
    corson_status: 'target',
    priority: 'medium',
    notes: 'Barcelona-based — Spain market intel value.',
    why_it_matters: 'Spain heat zone — Junkie Kid corridor entry point.',
    description: 'Spain market specialist.',
    key_contacts: 'Cubbo Bookings (contact UNVERIFIED)',
    corson_artists: [],
  },
  {
    name: 'Noculan Bookings',
    market: 'Netherlands',
    corson_status: 'target',
    priority: 'medium',
    notes: 'Hardstyle/hardcore/classics/techno. Adjacent crossover routing.',
    why_it_matters: 'Adjacent crossover routing — useful for hardstyle/hardcore-leaning developmental artists.',
    description: 'Netherlands crossover agency.',
    key_contacts: 'info@noculanbookings.com / hans@noculanbookings.com',
    corson_artists: [],
  },
];

const TRENDS = [
  {
    name: 'Spain is the next heat zone — Junkie Kid\'s biggest strategic unlock',
    market: 'Spain',
    priority: 'urgent',
    notes: 'Madrid + Barcelona over-index for bounce, hardgroove, fast crossover. Awakenings | Monegros = Spain validation. 240 KM/H Spain corridor.',
    why_it_matters: 'JK is Mexican-based, Spanish-speaking, 240 KM/H-aligned sound. Build a Spain campaign in Q3 2026.',
    description: 'Spain corridor is over-indexing on bounce-hard-techno and crossover.',
  },
  {
    name: 'Specialist EU agency representation is the universal Tier 3 → Tier 2 catalyst',
    market: 'EU',
    priority: 'urgent',
    notes: 'Every Tier 3 → Tier 2 jumper observed in 2024-2026 had specialist EU representation (JINN, Odysseys, ATA, Adrenaline). Pattern is stable across genres and geographies.',
    why_it_matters: 'Cold outreach to Odysseys for Shogun/Triptykh, JINN deepening via Mad Dog, ATA expansion via Josh Haygarth — the agency stack is the work.',
    description: 'Specialist EU agency signing = the universal break-through catalyst.',
  },
  {
    name: 'Format hybridization beats pure industrial — combine groove, trance, bounce, acid, gabber',
    market: 'Global',
    priority: 'high',
    notes: 'Acts that combine hard techno with groove, trance, bounce, acid, rawstyle, gabber, or strong performance aesthetics generally have more upside than pure industrial purists.',
    why_it_matters: 'Most of our roster is already on the right side of this — JK, CLAWZ, Shogun, Anoluxx, Taylor Torrence. Lean INTO the hybridization.',
    description: 'Hybrid sub-genres outperform pure industrial purists in 2026.',
  },
  {
    name: 'Ecosystem-driven labels (KNTXT / Artcore / 240 KM/H / Falsive) are career escalators',
    market: 'EU',
    priority: 'high',
    notes: 'A release on these is a career escalator, not just a record. KNTXT, R Label Group, Artcore, 240 KM/H, Falsive — labels with events, social platforms, tastemaker founders.',
    why_it_matters: 'Per-artist ecosystem fit identified: Lara Klart → Artcore is her single biggest strategic move. Shogun → Falsive (door is hanne@odysseys.nl).',
    description: 'Ecosystem labels = career escalators, not just releases.',
  },
  {
    name: 'Boiler Room debut is the breakout content stamp the industry recognizes',
    market: 'Global',
    priority: 'high',
    notes: 'Pattern observed: Alex Farell ("surprise Boiler Room debut"), Kander ("second Boiler Room year"), Morelia (already executed). Books through their own team — relationships needed: BR programming team + B2B partners who can recommend our artists into existing slots.',
    why_it_matters: 'Engineer Boiler Room slots for CLAWZ, Shogun, DRAKK, Triptykh.',
    description: 'Boiler Room as the universal breakout content credential.',
  },
  {
    name: 'Verknipt placement = single biggest unlock from Tier 3 to Tier 2',
    market: 'Netherlands',
    priority: 'urgent',
    notes: 'Velocity platform — if you get upgraded there, the wider market notices. 4 stages, 25+ debuting artists/year. Path likely through Odysseys / JINN / direct.',
    why_it_matters: 'Named-buyer intel gap — fill via ADE 2026.',
    description: 'Verknipt is the velocity platform — the single biggest Tier-3-to-Tier-2 unlock.',
  },
  {
    name: 'The PR sequence is clip → platform → festival → more clip',
    market: 'Global',
    priority: 'medium',
    notes: 'Per the GPT report: "One well-cut live clip often matters more than one review, but the clips work best once they are reinforced by one serious platform stamp."',
    why_it_matters: 'For every developmental artist: shoot clips at every show, push best clips to social, pair with platform stamp (HÖR / HATE / RA podcast / Boiler Room), convert to festival booking, repeat.',
    description: 'Clip → platform → festival → more clip is the breakout PR sequence.',
  },
  {
    name: 'EDC Wasteland is the US conversion engine — push for max Corson artists in 2027',
    market: 'Las Vegas, NV',
    priority: 'high',
    notes: '2026 Wasteland: Adrián Mills, CLAWZ, Cloudy, DØMINA, DYEN, JK, KUKO, Mad Dog, Rebekah, Restricted, SIHK, Stan Christ, Vieze Asbak, Warface, The Purge. Now a genuine hard-techno + crossover import platform.',
    why_it_matters: 'Our home court via Leo + Insomniac history. CLAWZ priority for 2027 mainstream consideration.',
    description: 'Wasteland is the US conversion engine and our home court.',
  },
];

// ── Build payload rows ──────────────────────────────────────────────────────
function buildRows() {
  const rows = [];
  for (const f of FESTIVALS) rows.push({ ...f, category: 'festival', last_updated: TODAY });
  for (const a of AGENCIES) rows.push({ ...a, category: 'agency',   last_updated: TODAY });
  for (const t of TRENDS)   rows.push({ ...t, category: 'trend',    last_updated: TODAY });
  return rows;
}

// ── Sync ────────────────────────────────────────────────────────────────────
(async () => {
  const rows = buildRows();
  console.log(`Curated ${rows.length} rows from doc — ${FESTIVALS.length} festivals · ${AGENCIES.length} agencies · ${TRENDS.length} trends`);

  let inserted = 0, updated = 0, errs = 0;

  for (const row of rows) {
    const { data: existing, error: selErr } = await supabase
      .from('industry_intel')
      .select('id')
      .eq('category', row.category)
      .eq('name', row.name)
      .limit(1);

    if (selErr) {
      console.error(`  ERR select ${row.category}/${row.name}: ${selErr.message}`);
      errs++;
      continue;
    }

    if (existing && existing.length > 0) {
      const { error } = await supabase
        .from('industry_intel')
        .update(row)
        .eq('id', existing[0].id);
      if (error) {
        console.error(`  ERR update ${row.category}/${row.name}: ${error.message}`);
        errs++;
      } else {
        updated++;
      }
    } else {
      const { error } = await supabase
        .from('industry_intel')
        .insert(row);
      if (error) {
        console.error(`  ERR insert ${row.category}/${row.name}: ${error.message}`);
        errs++;
      } else {
        inserted++;
      }
    }
  }

  console.log(`Upserted ${inserted + updated} rows · ${inserted} new · ${updated} updated · skipped ${errs}`);
})();
