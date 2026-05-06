import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import Nav from '../components/Nav';
import ProspectsTable from '../components/ProspectsTable';

// ── TIER CONFIG ───────────────────────────────────────────────────────────────
const tierConfig = {
  priority: {
    label: 'Priority',
    dot: 'bg-indigo-500',
    badge: 'bg-indigo-900 text-indigo-300 border border-indigo-700',
  },
  roster: {
    label: 'Roster',
    dot: 'bg-gray-500',
    badge: 'bg-gray-800 text-gray-400 border border-gray-700',
  },
  leo: {
    label: "Leo's Artist",
    dot: 'bg-purple-500',
    badge: 'bg-purple-900 text-purple-300 border border-purple-700',
  },
};

// ── TAB DEFINITIONS ──────────────────────────────────────────────────────────
const ROSTER_SLUGS = [
  'shogun', 'junkie-kid', 'clawz', 'drakk', 'hellbound', 'triptykh', 'anime',
  'mad-dog', 'morelia', 'jenna-shaw', 'anoluxx', 'water-spirit', 'dea-magna',
  'ketting', 'dr-greco', 'death-code', 'jay-toledo', 'jayr', 'lara-klart',
  'mandy', 'naomi-luna', 'pixie-dust', 'sihk', 'taylor-torrence', 'the-purge',
  'cyboy', 'gioh-cecato', 'fernanda-martins',
];

const EUROPEAN_SLUGS = [
  'mandy', 'the-purge', 'mad-dog', 'ketting', 'hellbound', 'morelia',
  'pixie-dust', 'fernanda-martins', 'triptykh', 'drakk',
];

const TABS = [
  { id: 'roster',   label: 'Roster',            subtitle: 'Active roster' },
  { id: 'european', label: 'European Artists',  subtitle: 'Touring Europe' },
  { id: 'leo',      label: "Leo's Artists",     subtitle: 'Leo Corson roster' },
];

// Format integer follower counts for display: 13000 → "13K", 253000 → "253K"
function fmtCount(n) {
  if (!n) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

// ── ARTIST CARD ───────────────────────────────────────────────────────────────
function ArtistCard({ artist, confirmedCount, pipelineCount, confirmedFeeTotal }) {
  const tier = tierConfig[artist.category] || tierConfig.roster;

  return (
    <Link
      to={`/artists/${artist.slug}`}
      className="block bg-gray-900 rounded-xl border border-gray-800 p-5 hover:border-indigo-500 hover:bg-gray-800/60 transition-all group"
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${tier.dot}`} />
          <h3 className="text-white font-bold text-base truncate group-hover:text-indigo-300 transition-colors">
            {artist.name}
          </h3>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded flex-shrink-0 ${tier.badge}`}>
          {tier.label}
        </span>
      </div>

      {/* Meta */}
      <div className="space-y-1 mb-4">
        <p className="text-gray-400 text-xs">{artist.genre}</p>
        <p className="text-gray-500 text-xs">{artist.base}</p>
        {artist.spotify && (
          <p className="text-gray-500 text-xs">Spotify: {artist.spotify}</p>
        )}
        {artist.instagram && (
          <p className="text-gray-500 text-xs">
            {artist.instagram}
            {artist.instagram_followers ? ` (${fmtCount(artist.instagram_followers)})` : ''}
          </p>
        )}
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-3 pt-3 border-t border-gray-800">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="text-gray-400 text-xs">{confirmedCount} confirmed</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
          <span className="text-gray-400 text-xs">{pipelineCount} in works</span>
        </div>
        {confirmedFeeTotal > 0 && (
          <div className="ml-auto text-emerald-400 text-xs font-semibold">
            ${confirmedFeeTotal.toLocaleString()}
          </div>
        )}
      </div>
    </Link>
  );
}

// ── PAGE ──────────────────────────────────────────────────────────────────────
export default function ArtistList() {
  const [artists, setArtists] = useState([]);
  const [showCounts, setShowCounts] = useState({});
  const [pipelineCounts, setPipelineCounts] = useState({});
  const [showFees, setShowFees] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('roster');

  useEffect(() => {
    async function load() {
      try {
        const [artistRes, showsRes, pipelineRes] = await Promise.all([
          supabase.from('artists').select('*').order('name'),
          supabase.from('shows').select('artist_slug, fee'),
          supabase.from('pipeline').select('artist_slug'),
        ]);

        if (artistRes.error) throw artistRes.error;
        if (showsRes.error) throw showsRes.error;
        if (pipelineRes.error) throw pipelineRes.error;

        // Build count maps from shows
        const sCount = {};
        const sFees = {};
        for (const s of showsRes.data) {
          sCount[s.artist_slug] = (sCount[s.artist_slug] || 0) + 1;
          const n = parseFloat((s.fee || '').replace(/[^0-9.]/g, ''));
          if (!isNaN(n)) sFees[s.artist_slug] = (sFees[s.artist_slug] || 0) + n;
        }

        // Build count map from pipeline
        const pCount = {};
        for (const p of pipelineRes.data) {
          pCount[p.artist_slug] = (pCount[p.artist_slug] || 0) + 1;
        }

        setArtists(artistRes.data);
        setShowCounts(sCount);
        setPipelineCounts(pCount);
        setShowFees(sFees);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const q = search.trim().toLowerCase();

  // Build tab buckets. Preserve configured ordering for Roster + European tabs.
  const bySlug = Object.fromEntries(artists.map(a => [a.slug, a]));
  const rosterTab   = ROSTER_SLUGS.map(slug => bySlug[slug]).filter(Boolean);
  const europeanTab = EUROPEAN_SLUGS.map(slug => bySlug[slug]).filter(Boolean);
  const leoTab      = artists.filter(a => a.category === 'leo');

  const tabArtists = activeTab === 'roster' ? rosterTab
                   : activeTab === 'european' ? europeanTab
                   : leoTab;

  const filtered = q
    ? tabArtists.filter(a =>
        a.name.toLowerCase().includes(q) ||
        (a.genre || '').toLowerCase().includes(q)
      )
    : tabArtists;

  const tabCounts = { roster: rosterTab.length, european: europeanTab.length, leo: leoTab.length };

  return (
    <div className="min-h-screen text-white" style={{ backgroundColor: '#111827' }}>
      <Nav />

      {/* ── BREADCRUMB ── */}
      <div className="max-w-7xl mx-auto px-6 pt-6">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Link to="/" className="hover:text-white transition-colors">Dashboard</Link>
          <span>/</span>
          <span className="text-gray-300">Artists</span>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white">Artists</h2>
            <p className="text-gray-500 text-sm mt-1">
              {loading ? 'Loading…' : `${tabCounts.roster} roster · ${tabCounts.european} European · ${tabCounts.leo} Leo's`}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-gray-800">
          <div className="flex flex-wrap gap-1">
            {TABS.map(t => {
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px ${
                    active
                      ? 'border-indigo-500 text-white'
                      : 'border-transparent text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {t.label}
                  <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${active ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-500'}`}>
                    {tabCounts[t.id]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Search */}
        <div className="mb-6">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search within tab by name or genre…"
            className="w-full sm:max-w-sm bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-4 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600"
          />
          {q && (
            <p className="text-gray-500 text-xs mt-2">
              {filtered.length} result{filtered.length !== 1 ? 's' : ''} for "{search}"
            </p>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-xl px-5 py-4 mb-6 text-sm">
            Failed to load artists: {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="bg-gray-900 rounded-xl border border-gray-800 p-5 animate-pulse">
                <div className="h-4 bg-gray-800 rounded w-3/4 mb-3" />
                <div className="h-3 bg-gray-800 rounded w-1/2 mb-2" />
                <div className="h-3 bg-gray-800 rounded w-2/3" />
              </div>
            ))}
          </div>
        )}

        {!loading && !error && (
          <>
            {filtered.length === 0 ? (
              <div className="bg-gray-900 rounded-xl border border-gray-800 px-5 py-10 text-center">
                <p className="text-gray-500 text-sm">
                  {q ? `No artists match "${search}" in this tab.` : 'No artists in this tab.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filtered.map((a) => (
                  <ArtistCard
                    key={a.slug} artist={a}
                    confirmedCount={showCounts[a.slug] || 0}
                    pipelineCount={pipelineCounts[a.slug] || 0}
                    confirmedFeeTotal={showFees[a.slug] || 0}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* ── HIP POCKET & A&R (Phase 2.7.5) ──────────────────────────────
            Folded in from the killed standalone /ar-inbox tab. Uses the
            same ProspectsTable component the legacy /ar-inbox route uses,
            so future edits flow to both surfaces. Visual treatment is
            intentionally muted — this is the watch list, not the active
            booking roster above. */}
        <section className="mt-12 pt-10 border-t border-gray-800/80 opacity-90">
          <div className="mb-5">
            <h3 className="text-lg font-semibold text-gray-300 tracking-tight">
              Hip Pocket &amp; A&amp;R
            </h3>
            <p className="text-gray-500 text-xs mt-1">
              Artists in development, prospects under review, unsolicited inflows.
            </p>
          </div>
          <ProspectsTable compact />
        </section>
      </main>
    </div>
  );
}
