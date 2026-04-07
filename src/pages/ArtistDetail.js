import { Link, useParams } from 'react-router-dom';
import artists from '../data/artists';
import Nav from '../components/Nav';

// ── HELPERS ───────────────────────────────────────────────────────────────────
function parseFee(feeStr) {
  if (!feeStr) return 0;
  const nums = feeStr.replace(/[^0-9,]/g, ' ').trim().split(/\s+/);
  const n = parseFloat((nums[0] || '').replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

function totalFees(shows) {
  return shows.reduce((sum, s) => sum + parseFee(s.fee), 0);
}

function formatUSD(n) {
  if (!n) return '—';
  return '$' + n.toLocaleString();
}

// ── KPI CARD ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, accent }) {
  const borders = {
    indigo: 'border-indigo-500',
    green: 'border-emerald-500',
    yellow: 'border-yellow-500',
  };
  const values = {
    indigo: 'text-indigo-400',
    green: 'text-emerald-400',
    yellow: 'text-yellow-400',
  };
  return (
    <div className={`bg-gray-900 rounded-xl p-5 border-l-4 ${borders[accent]}`}>
      <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
        {label}
      </p>
      <p className={`text-3xl font-bold ${values[accent]}`}>{value}</p>
      {sub && <p className="text-gray-500 text-xs mt-1">{sub}</p>}
    </div>
  );
}

// ── DEAL TYPE BADGE ───────────────────────────────────────────────────────────
function DealBadge({ type }) {
  const map = {
    Contracted: 'bg-emerald-900 text-emerald-300 border-emerald-700',
    Confirmed: 'bg-emerald-900 text-emerald-300 border-emerald-700',
    Advanced: 'bg-blue-900 text-blue-300 border-blue-700',
    Settled: 'bg-gray-800 text-gray-400 border-gray-600',
    Negotiating: 'bg-yellow-900 text-yellow-300 border-yellow-700',
    'Offer In': 'bg-yellow-900 text-yellow-300 border-yellow-700',
    Request: 'bg-gray-800 text-gray-400 border-gray-600',
    Inquiry: 'bg-gray-800 text-gray-400 border-gray-600',
  };
  const cls = map[type] || 'bg-gray-800 text-gray-400 border-gray-600';
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${cls}`}>
      {type}
    </span>
  );
}

// ── PAGE ──────────────────────────────────────────────────────────────────────
export default function ArtistDetail() {
  const { slug } = useParams();
  const artist = artists.find((a) => a.slug === slug);

  if (!artist) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white" style={{ backgroundColor: '#111827' }}>
        <div className="text-center">
          <p className="text-gray-400 text-lg mb-4">Artist not found.</p>
          <Link to="/artists" className="text-indigo-400 hover:underline text-sm">
            ← Back to Roster
          </Link>
        </div>
      </div>
    );
  }

  const yearTotal = totalFees(artist.confirmedShows);

  return (
    <div className="min-h-screen text-white" style={{ backgroundColor: '#111827' }}>

      <Nav />

      {/* ── BREADCRUMB ── */}
      <div className="max-w-7xl mx-auto px-6 pt-6">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Link to="/" className="hover:text-white transition-colors">Dashboard</Link>
          <span>/</span>
          <Link to="/artists" className="hover:text-white transition-colors">Artists</Link>
          <span>/</span>
          <span className="text-gray-300">{artist.name}</span>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-6">

        {/* ── ARTIST HEADER ── */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">

            {/* Left: name + meta */}
            <div>
              {/* Tier badge */}
              {artist.tier === 'priority' && (
                <span className="text-xs font-bold bg-indigo-900 text-indigo-300 border border-indigo-700 px-2 py-0.5 rounded uppercase tracking-wider mb-2 inline-block">
                  Priority Artist
                </span>
              )}
              {artist.tier === 'leo' && (
                <span className="text-xs font-bold bg-purple-900 text-purple-300 border border-purple-700 px-2 py-0.5 rounded uppercase tracking-wider mb-2 inline-block">
                  Leo's Artist
                </span>
              )}

              <h2 className="text-3xl font-bold text-white mb-1">{artist.name}</h2>
              <p className="text-indigo-400 font-medium text-sm mb-3">{artist.genre}</p>

              <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 text-xs uppercase tracking-wider">Base</span>
                  <span className="text-gray-300">{artist.base}</span>
                </div>
                {artist.spotify && (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 text-xs uppercase tracking-wider">Spotify</span>
                    <span className="text-gray-300">{artist.spotify} monthly</span>
                  </div>
                )}
                {artist.instagram && (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 text-xs uppercase tracking-wider">IG</span>
                    <span className="text-gray-300">
                      {artist.instagram}
                      {artist.instagramFollowers ? ` (${artist.instagramFollowers})` : ''}
                    </span>
                  </div>
                )}
                {artist.fee && artist.fee !== 'TBD' && (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 text-xs uppercase tracking-wider">US Fee</span>
                    <span className="text-emerald-400 font-semibold">{artist.fee}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Right: manager + label */}
            <div className="flex flex-col gap-2 text-sm sm:text-right">
              {artist.manager && (
                <div>
                  <p className="text-gray-500 text-xs uppercase tracking-wider">Manager</p>
                  <p className="text-gray-300">{artist.manager.name}</p>
                  <a
                    href={`mailto:${artist.manager.email}`}
                    className="text-indigo-400 text-xs hover:underline"
                  >
                    {artist.manager.email}
                  </a>
                </div>
              )}
              {artist.label && (
                <div className="mt-1">
                  <p className="text-gray-500 text-xs uppercase tracking-wider">Label</p>
                  <p className="text-gray-300 text-xs">{artist.label}</p>
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          {artist.notes && (
            <div className="mt-4 pt-4 border-t border-gray-800">
              <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Notes</p>
              <p className="text-yellow-300 text-sm leading-relaxed">{artist.notes}</p>
            </div>
          )}
        </div>

        {/* ── KPI CARDS ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <KpiCard
            label="Confirmed Shows"
            value={artist.confirmedShows.length}
            sub={`${artist.confirmedShows.length === 0 ? 'No confirmed shows yet' : 'This year'}`}
            accent="green"
          />
          <KpiCard
            label="Offers In Progress"
            value={artist.offersInProgress.length}
            sub={`${artist.offersInProgress.length === 0 ? 'Nothing in the works' : 'Pending + negotiating'}`}
            accent="yellow"
          />
          <KpiCard
            label="Year Total"
            value={yearTotal > 0 ? formatUSD(yearTotal) : '—'}
            sub={yearTotal > 0 ? 'Confirmed fees 2026' : 'No confirmed fees yet'}
            accent="indigo"
          />
        </div>

        {/* ── CURRENT SCHEDULE ── */}
        <section className="mb-6">
          <h3 className="text-lg font-bold text-white mb-3">Current Schedule</h3>

          {artist.confirmedShows.length === 0 ? (
            <div className="bg-gray-900 rounded-xl border border-gray-800 px-5 py-8 text-center">
              <p className="text-gray-500 text-sm">No confirmed shows yet.</p>
            </div>
          ) : (
            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    {['Date', 'City', 'Venue', 'Promoter', 'Fee', 'Deal Type'].map((h) => (
                      <th
                        key={h}
                        className="text-left text-gray-500 text-xs font-semibold uppercase tracking-wider px-5 py-3"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {artist.confirmedShows.map((show, i) => (
                    <tr
                      key={i}
                      className="border-b border-gray-800 last:border-0 bg-emerald-950/10 hover:bg-emerald-950/20 transition-colors"
                    >
                      <td className="px-5 py-3.5 text-gray-300 whitespace-nowrap">{show.date}</td>
                      <td className="px-5 py-3.5 text-gray-300">{show.city}</td>
                      <td className="px-5 py-3.5 text-white font-medium">{show.venue}</td>
                      <td className="px-5 py-3.5 text-gray-400">{show.promoter}</td>
                      <td className="px-5 py-3.5 text-emerald-400 font-semibold">{show.fee}</td>
                      <td className="px-5 py-3.5">
                        <DealBadge type={show.dealType} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── IN THE WORKS ── */}
        <section className="mb-8">
          <h3 className="text-lg font-bold text-white mb-3">In The Works</h3>

          {artist.offersInProgress.length === 0 ? (
            <div className="bg-gray-900 rounded-xl border border-gray-800 px-5 py-8 text-center">
              <p className="text-gray-500 text-sm">No offers or negotiations in progress.</p>
            </div>
          ) : (
            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    {['Date', 'City', 'Venue', 'Promoter', 'Fee', 'Stage'].map((h) => (
                      <th
                        key={h}
                        className="text-left text-gray-500 text-xs font-semibold uppercase tracking-wider px-5 py-3"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {artist.offersInProgress.map((offer, i) => (
                    <tr
                      key={i}
                      className="border-b border-gray-800 last:border-0 bg-yellow-950/10 hover:bg-yellow-950/20 transition-colors"
                    >
                      <td className="px-5 py-3.5 text-gray-300 whitespace-nowrap">{offer.date}</td>
                      <td className="px-5 py-3.5 text-gray-300">{offer.city}</td>
                      <td className="px-5 py-3.5 text-white font-medium">{offer.venue}</td>
                      <td className="px-5 py-3.5 text-gray-400">{offer.promoter}</td>
                      <td className="px-5 py-3.5 text-yellow-400 font-semibold">{offer.fee}</td>
                      <td className="px-5 py-3.5">
                        <DealBadge type={offer.stage} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── ACTION BUTTONS ── */}
        <div className="flex flex-wrap gap-3">
          <button
            disabled
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm border border-indigo-600 text-indigo-300 opacity-50 cursor-not-allowed"
            title="Coming soon"
          >
            <span>🎯</span> View Target List
          </button>
          <button
            disabled
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm border border-gray-600 text-gray-300 opacity-50 cursor-not-allowed"
            title="Coming soon"
          >
            <span>📅</span> View Touring Grid
          </button>
          <Link
            to="/artists"
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm border border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200 transition-colors ml-auto"
          >
            ← Back to Roster
          </Link>
        </div>

      </main>
    </div>
  );
}
