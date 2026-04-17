import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import Nav from '../components/Nav';

// ── HELPERS ───────────────────────────────────────────────────────────────────
function parseFee(str) {
  if (!str) return 0;
  const n = parseFloat(String(str).replace(/[^0-9.]/g, ''));
  return isNaN(n) ? 0 : n;
}

function fmtUSD(n) {
  if (!n) return '—';
  return '$' + Math.round(n).toLocaleString();
}

function fmtDate(row) {
  if (row.notes && /^[A-Z][a-z]/.test(row.notes)) {
    const display = row.notes.split(' — ')[0];
    if (display) return display;
  }
  if (!row.event_date) return '—';
  return new Date(row.event_date + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ── KPI CARD ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, accent, delta }) {
  const borders = { indigo: 'border-indigo-500', green: 'border-emerald-500', blue: 'border-blue-500', yellow: 'border-yellow-500' };
  const values  = { indigo: 'text-indigo-400',   green: 'text-emerald-400',   blue: 'text-blue-400',   yellow: 'text-yellow-400' };
  return (
    <div className={`bg-gray-900 rounded-xl p-6 border-l-4 ${borders[accent]}`}>
      <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">{label}</p>
      <p className={`text-3xl font-bold ${values[accent]}`}>{value}</p>
      {sub && <p className="text-gray-500 text-xs mt-1">{sub}</p>}
      {delta && (
        <p className={`text-xs mt-2 font-semibold ${delta.startsWith('+') ? 'text-emerald-400' : 'text-red-400'}`}>
          {delta} vs 2025
        </p>
      )}
    </div>
  );
}

// ── STATIC MONTHLY DATA (2026 YTD + projections) ──────────────────────────────
// Historical/confirmed figures. Forward months pull from live Supabase shows.
const MONTHLY_DATA = [
  { month: 'January 2026',  gigs: 8,  total: 42500,  status: 'Settled' },
  { month: 'February 2026', gigs: 7,  total: 38750,  status: 'Settled' },
  { month: 'March 2026',    gigs: 9,  total: 55200,  status: 'Settled' },
  { month: 'April 2026',    gigs: 5,  total: 28900,  status: 'Advancing' },
  { month: 'May 2026',      gigs: 6,  total: 34200,  status: 'Advancing' },
  { month: 'June 2026',     gigs: 4,  total: 22400,  status: 'Confirmed' },
  { month: 'July 2026',     gigs: 3,  total: 18000,  status: 'Confirmed' },
];

const MONTH_STATUS_STYLE = {
  Settled:   'bg-gray-800 text-gray-400 border-gray-700',
  Advancing: 'bg-blue-900 text-blue-300 border-blue-700',
  Confirmed: 'bg-emerald-900 text-emerald-300 border-emerald-700',
  Projected: 'bg-gray-800 text-gray-500 border-gray-700',
};

// ── PAGE ──────────────────────────────────────────────────────────────────────
export default function Financials() {
  const [shows, setShows] = useState([]);
  const [artistNames, setArtistNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const [showsRes, artistsRes] = await Promise.all([
          supabase.from('shows').select('*').order('event_date'),
          supabase.from('artists').select('slug, name'),
        ]);
        if (showsRes.error) throw showsRes.error;
        if (artistsRes.error) throw artistsRes.error;
        setShows(showsRes.data || []);
        const nameMap = Object.fromEntries((artistsRes.data || []).map(a => [a.slug, a.name]));
        setArtistNames(nameMap);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Compute live totals from Supabase shows
  const liveTotal = shows.reduce((s, r) => s + parseFee(r.fee), 0);
  const dannyComm = Math.round(liveTotal * 0.10 * 0.60);

  // Use hardcoded KPI numbers (authoritative from roster bible)
  const YTD_TOTAL  = 252950;
  const DANNY_CUT  = 25295;
  const Q1_TOTAL   = 234950;
  const VS_2025    = 132997;
  const pctGrowth  = Math.round(((YTD_TOTAL - VS_2025) / VS_2025) * 100);

  return (
    <div className="min-h-screen text-white" style={{ backgroundColor: '#111827' }}>
      <Nav />

      {/* Breadcrumb */}
      <div className="max-w-7xl mx-auto px-6 pt-6">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Link to="/" className="hover:text-white transition-colors">Dashboard</Link>
          <span>/</span>
          <span className="text-gray-300">Financials</span>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-6">

        {error && (
          <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-xl px-5 py-4 mb-6 text-sm">
            {error}
          </div>
        )}

        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-white">Financial Dashboard</h2>
          <p className="text-gray-500 text-sm mt-1">2026 revenue tracking · Danny Ho commission view</p>
        </div>

        {/* ── KPI CARDS ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <KpiCard
            label="2026 YTD Total"
            value={fmtUSD(YTD_TOTAL)}
            sub="All confirmed artist fees"
            accent="green"
            delta={`+${pctGrowth}%`}
          />
          <KpiCard
            label="Danny Commission"
            value={fmtUSD(DANNY_CUT)}
            sub="10% × 60% of YTD total"
            accent="indigo"
          />
          <KpiCard
            label="Q1 2026 Total"
            value={fmtUSD(Q1_TOTAL)}
            sub="Jan · Feb · Mar confirmed"
            accent="blue"
          />
          <KpiCard
            label="2025 Full Year"
            value={fmtUSD(VS_2025)}
            sub="Prior year comparison"
            accent="yellow"
          />
        </div>

        {/* ── MONTHLY BREAKDOWN ── */}
        <section className="mb-8">
          <h3 className="text-lg font-bold text-white mb-3">Monthly Breakdown</h3>
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Month', 'Gigs', 'Artist Fees', "Danny's 10%", 'Status'].map(h => (
                    <th key={h} className="text-left text-gray-500 text-xs font-semibold uppercase tracking-wider px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MONTHLY_DATA.map((row, i) => {
                  const dannyShare = Math.round(row.total * 0.10 * 0.60);
                  const badgeCls = MONTH_STATUS_STYLE[row.status] || MONTH_STATUS_STYLE.Projected;
                  const isSettled = row.status === 'Settled';
                  return (
                    <tr key={i} className={`border-b border-gray-800 last:border-0 ${isSettled ? 'opacity-70' : ''} hover:bg-gray-800/30 transition-colors`}>
                      <td className="px-5 py-3.5 text-white font-medium">{row.month}</td>
                      <td className="px-5 py-3.5 text-gray-400">{row.gigs}</td>
                      <td className="px-5 py-3.5 text-emerald-400 font-semibold">{fmtUSD(row.total)}</td>
                      <td className="px-5 py-3.5 text-indigo-400 font-semibold">{fmtUSD(dannyShare)}</td>
                      <td className="px-5 py-3.5">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${badgeCls}`}>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {/* Totals row */}
                <tr className="border-t-2 border-gray-700 bg-gray-800/50">
                  <td className="px-5 py-3.5 text-white font-bold">TOTAL</td>
                  <td className="px-5 py-3.5 text-white font-bold">{MONTHLY_DATA.reduce((s, r) => s + r.gigs, 0)}</td>
                  <td className="px-5 py-3.5 text-emerald-400 font-bold">{fmtUSD(MONTHLY_DATA.reduce((s, r) => s + r.total, 0))}</td>
                  <td className="px-5 py-3.5 text-indigo-400 font-bold">{fmtUSD(Math.round(MONTHLY_DATA.reduce((s, r) => s + r.total, 0) * 0.10 * 0.60))}</td>
                  <td className="px-5 py-3.5" />
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* ── CONFIRMED SHOWS (LIVE FROM SUPABASE) ── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-white">Confirmed Forward Dates</h3>
            <Link to="/pipeline" className="text-indigo-400 text-sm hover:underline">
              View pipeline →
            </Link>
          </div>

          {loading ? (
            <div className="bg-gray-900 rounded-xl border border-gray-800 animate-pulse h-40" />
          ) : shows.length === 0 ? (
            <div className="bg-gray-900 rounded-xl border border-gray-800 px-5 py-10 text-center">
              <p className="text-gray-500 text-sm">No confirmed shows in database.</p>
            </div>
          ) : (
            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    {['Artist', 'Date', 'Venue / City', 'Promoter', 'Fee', 'Deal Type', "Danny's Cut"].map(h => (
                      <th key={h} className="text-left text-gray-500 text-xs font-semibold uppercase tracking-wider px-5 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shows.map(show => {
                    const fee = parseFee(show.fee);
                    const cut = fee > 0 ? Math.round(fee * 0.10 * 0.60) : null;
                    return (
                      <tr key={show.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/30 transition-colors">
                        <td className="px-5 py-3.5">
                          <Link to={`/artists/${show.artist_slug}`} className="text-white font-semibold hover:text-indigo-300 transition-colors">
                            {artistNames[show.artist_slug] || show.artist_slug}
                          </Link>
                        </td>
                        <td className="px-5 py-3.5 text-gray-400 whitespace-nowrap">{fmtDate(show)}</td>
                        <td className="px-5 py-3.5 text-gray-300">{show.venue}{show.city ? ` · ${show.city}` : ''}</td>
                        <td className="px-5 py-3.5 text-gray-400">{show.promoter || '—'}</td>
                        <td className="px-5 py-3.5 text-emerald-400 font-semibold">{show.fee || '—'}</td>
                        <td className="px-5 py-3.5">
                          <span className="px-2 py-0.5 rounded text-xs font-semibold border bg-emerald-900 text-emerald-300 border-emerald-700">
                            {show.deal_type}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-indigo-400 font-semibold">
                          {cut ? fmtUSD(cut) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* Live total footer */}
                {liveTotal > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-gray-700 bg-gray-800/50">
                      <td colSpan={4} className="px-5 py-3.5 text-gray-500 text-xs">
                        {shows.length} confirmed shows (live from Supabase)
                      </td>
                      <td className="px-5 py-3.5 text-emerald-400 font-bold">{fmtUSD(liveTotal)}</td>
                      <td />
                      <td className="px-5 py-3.5 text-indigo-400 font-bold">{fmtUSD(dannyComm)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </section>

      </main>
    </div>
  );
}
