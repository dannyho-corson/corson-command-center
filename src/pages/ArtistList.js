import { Link } from 'react-router-dom';
import artists from '../data/artists';
import Nav from '../components/Nav';

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

// ── ARTIST CARD ───────────────────────────────────────────────────────────────
function ArtistCard({ artist }) {
  const tier = tierConfig[artist.tier] || tierConfig.roster;
  const totalConfirmed = artist.confirmedShows.reduce((sum, s) => {
    const n = parseFloat((s.fee || '').replace(/[^0-9.]/g, ''));
    return sum + (isNaN(n) ? 0 : n);
  }, 0);

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
          <p className="text-gray-500 text-xs">{artist.instagram}</p>
        )}
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-3 pt-3 border-t border-gray-800">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="text-gray-400 text-xs">
            {artist.confirmedShows.length} confirmed
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
          <span className="text-gray-400 text-xs">
            {artist.offersInProgress.length} in works
          </span>
        </div>
        {totalConfirmed > 0 && (
          <div className="ml-auto text-emerald-400 text-xs font-semibold">
            ${totalConfirmed.toLocaleString()}
          </div>
        )}
      </div>
    </Link>
  );
}

// ── PAGE ──────────────────────────────────────────────────────────────────────
export default function ArtistList() {
  const priority = artists.filter((a) => a.tier === 'priority');
  const roster = artists.filter((a) => a.tier === 'roster');
  const leo = artists.filter((a) => a.tier === 'leo');

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

      {/* ── MAIN ── */}
      <main className="max-w-7xl mx-auto px-6 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-white">Artist Roster</h2>
            <p className="text-gray-500 text-sm mt-1">{artists.length} artists total</p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            {Object.entries(tierConfig).map(([key, val]) => (
              <div key={key} className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${val.dot}`} />
                <span className="text-gray-400">{val.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── PRIORITY ── */}
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest">
              Priority Artists
            </h3>
            <span className="text-gray-600 text-xs bg-gray-800 px-2 py-0.5 rounded-full">
              {priority.length}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {priority.map((a) => (
              <ArtistCard key={a.slug} artist={a} />
            ))}
          </div>
        </section>

        {/* ── FULL ROSTER ── */}
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest">
              Full Roster
            </h3>
            <span className="text-gray-600 text-xs bg-gray-800 px-2 py-0.5 rounded-full">
              {roster.length}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {roster.map((a) => (
              <ArtistCard key={a.slug} artist={a} />
            ))}
          </div>
        </section>

        {/* ── LEO'S ARTISTS ── */}
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest">
              Leo's Artists
            </h3>
            <span className="text-gray-600 text-xs bg-gray-800 px-2 py-0.5 rounded-full">
              {leo.length}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {leo.map((a) => (
              <ArtistCard key={a.slug} artist={a} />
            ))}
          </div>
        </section>

      </main>
    </div>
  );
}
