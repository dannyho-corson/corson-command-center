import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import Nav from '../components/Nav';

// ── HELPERS ───────────────────────────────────────────────────────────────────
function parseFee(feeStr) {
  if (!feeStr) return 0;
  const nums = feeStr.replace(/[^0-9,]/g, ' ').trim().split(/\s+/);
  const n = parseFloat((nums[0] || '').replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

function formatUSD(n) {
  if (!n) return '—';
  return '$' + n.toLocaleString();
}

// Format stored ISO date "2026-07-04" or notes field for display
function fmtDate(row) {
  // The seed stores original display string in notes like "Jul 4, 2026"
  // Fall back to formatting the ISO date
  if (row.notes && /^[A-Z][a-z]/.test(row.notes)) {
    const display = row.notes.split(' — ')[0];
    if (display) return display;
  }
  if (!row.event_date) return '—';
  const d = new Date(row.event_date + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtCount(n) {
  if (!n) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

// ── KPI CARD ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, accent }) {
  const borders = { indigo: 'border-indigo-500', green: 'border-emerald-500', yellow: 'border-yellow-500' };
  const values = { indigo: 'text-indigo-400', green: 'text-emerald-400', yellow: 'text-yellow-400' };
  return (
    <div className={`bg-gray-900 rounded-xl p-5 border-l-4 ${borders[accent]}`}>
      <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">{label}</p>
      <p className={`text-3xl font-bold ${values[accent]}`}>{value}</p>
      {sub && <p className="text-gray-500 text-xs mt-1">{sub}</p>}
    </div>
  );
}

// ── DEAL BADGE ────────────────────────────────────────────────────────────────
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
  return <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${cls}`}>{type}</span>;
}

// ── LOADING SKELETON ──────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 h-40" />
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => <div key={i} className="bg-gray-900 rounded-xl border border-gray-800 h-24" />)}
      </div>
      <div className="bg-gray-900 rounded-xl border border-gray-800 h-40" />
    </div>
  );
}

// ── PAGE ──────────────────────────────────────────────────────────────────────
export default function ArtistDetail() {
  const { slug } = useParams();
  const [artist, setArtist] = useState(null);
  const [shows, setShows] = useState([]);
  const [pipeline, setPipeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const [artistRes, showsRes, pipelineRes] = await Promise.all([
          supabase.from('artists').select('*').eq('slug', slug).single(),
          supabase.from('shows').select('*').eq('artist_slug', slug).order('event_date'),
          supabase.from('pipeline').select('*').eq('artist_slug', slug).order('event_date'),
        ]);

        if (artistRes.error) throw artistRes.error;
        if (showsRes.error) throw showsRes.error;
        if (pipelineRes.error) throw pipelineRes.error;

        setArtist(artistRes.data);
        setShows(showsRes.data);
        setPipeline(pipelineRes.data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [slug]);

  const yearTotal = shows.reduce((sum, s) => sum + parseFee(s.fee), 0);

  if (!loading && !artist && !error) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white" style={{ backgroundColor: '#111827' }}>
        <div className="text-center">
          <p className="text-gray-400 text-lg mb-4">Artist not found.</p>
          <Link to="/artists" className="text-indigo-400 hover:underline text-sm">← Back to Roster</Link>
        </div>
      </div>
    );
  }

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
          <span className="text-gray-300">{artist?.name ?? slug}</span>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-6">

        {/* Error */}
        {error && (
          <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-xl px-5 py-4 mb-6 text-sm">
            Failed to load artist: {error}
          </div>
        )}

        {loading && <Skeleton />}

        {!loading && artist && (
          <>
            {/* ── ARTIST HEADER ── */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 mb-6">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">

                {/* Left: name + meta */}
                <div>
                  {artist.category === 'priority' && (
                    <span className="text-xs font-bold bg-indigo-900 text-indigo-300 border border-indigo-700 px-2 py-0.5 rounded uppercase tracking-wider mb-2 inline-block">
                      Priority Artist
                    </span>
                  )}
                  {artist.category === 'leo' && (
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
                          {artist.instagram_followers ? ` (${fmtCount(artist.instagram_followers)})` : ''}
                        </span>
                      </div>
                    )}
                    {artist.club_fee && artist.club_fee !== 'TBD' && (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500 text-xs uppercase tracking-wider">Club Fee</span>
                        <span className="text-emerald-400 font-semibold">{artist.club_fee}</span>
                      </div>
                    )}
                    {artist.festival_fee && (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500 text-xs uppercase tracking-wider">Festival Fee</span>
                        <span className="text-emerald-400 font-semibold">{artist.festival_fee}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: manager + label + EU agent */}
                <div className="flex flex-col gap-2 text-sm sm:text-right">
                  {artist.manager_name && (
                    <div>
                      <p className="text-gray-500 text-xs uppercase tracking-wider">Manager</p>
                      <p className="text-gray-300">{artist.manager_name}</p>
                      {artist.manager_email && (
                        <a href={`mailto:${artist.manager_email}`} className="text-indigo-400 text-xs hover:underline">
                          {artist.manager_email}
                        </a>
                      )}
                    </div>
                  )}
                  {artist.label && (
                    <div className="mt-1">
                      <p className="text-gray-500 text-xs uppercase tracking-wider">Label</p>
                      <p className="text-gray-300 text-xs">{artist.label}</p>
                    </div>
                  )}
                  {artist.eu_agent && (
                    <div className="mt-1">
                      <p className="text-gray-500 text-xs uppercase tracking-wider">EU Agent</p>
                      <p className="text-gray-300 text-xs">{artist.eu_agent}</p>
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
                label="Confirmed Shows" value={shows.length}
                sub={shows.length === 0 ? 'No confirmed shows yet' : 'This year'}
                accent="green"
              />
              <KpiCard
                label="Offers In Progress" value={pipeline.length}
                sub={pipeline.length === 0 ? 'Nothing in the works' : 'Pending + negotiating'}
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
              {shows.length === 0 ? (
                <div className="bg-gray-900 rounded-xl border border-gray-800 px-5 py-8 text-center">
                  <p className="text-gray-500 text-sm">No confirmed shows yet.</p>
                </div>
              ) : (
                <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800">
                        {['Date', 'City', 'Venue', 'Promoter', 'Fee', 'Deal Type'].map((h) => (
                          <th key={h} className="text-left text-gray-500 text-xs font-semibold uppercase tracking-wider px-5 py-3">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {shows.map((show) => (
                        <tr key={show.id} className="border-b border-gray-800 last:border-0 bg-emerald-950/10 hover:bg-emerald-950/20 transition-colors">
                          <td className="px-5 py-3.5 text-gray-300 whitespace-nowrap">{fmtDate(show)}</td>
                          <td className="px-5 py-3.5 text-gray-300">{show.city}</td>
                          <td className="px-5 py-3.5 text-white font-medium">{show.venue}</td>
                          <td className="px-5 py-3.5 text-gray-400">{show.promoter}</td>
                          <td className="px-5 py-3.5 text-emerald-400 font-semibold">{show.fee}</td>
                          <td className="px-5 py-3.5"><DealBadge type={show.deal_type} /></td>
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
              {pipeline.length === 0 ? (
                <div className="bg-gray-900 rounded-xl border border-gray-800 px-5 py-8 text-center">
                  <p className="text-gray-500 text-sm">No offers or negotiations in progress.</p>
                </div>
              ) : (
                <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800">
                        {['Date', 'Market', 'Venue', 'Buyer', 'Fee Offered', 'Stage'].map((h) => (
                          <th key={h} className="text-left text-gray-500 text-xs font-semibold uppercase tracking-wider px-5 py-3">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pipeline.map((deal) => (
                        <tr key={deal.id} className="border-b border-gray-800 last:border-0 bg-yellow-950/10 hover:bg-yellow-950/20 transition-colors">
                          <td className="px-5 py-3.5 text-gray-300 whitespace-nowrap">{fmtDate(deal)}</td>
                          <td className="px-5 py-3.5 text-gray-300">{deal.market}</td>
                          <td className="px-5 py-3.5 text-white font-medium">{deal.venue}</td>
                          <td className="px-5 py-3.5 text-gray-400">{deal.buyer_company || deal.buyer}</td>
                          <td className="px-5 py-3.5 text-yellow-400 font-semibold">{deal.fee_offered}</td>
                          <td className="px-5 py-3.5"><DealBadge type={deal.stage} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* ── ACTION BUTTONS ── */}
            <div className="flex flex-wrap gap-3">
              <button disabled className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm border border-indigo-600 text-indigo-300 opacity-50 cursor-not-allowed" title="Coming soon">
                <span>🎯</span> View Target List
              </button>
              <button disabled className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm border border-gray-600 text-gray-300 opacity-50 cursor-not-allowed" title="Coming soon">
                <span>📅</span> View Touring Grid
              </button>
              <Link to="/artists" className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm border border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200 transition-colors ml-auto">
                ← Back to Roster
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
