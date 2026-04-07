import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import './App.css';
import ArtistList from './pages/ArtistList';
import ArtistDetail from './pages/ArtistDetail';
import Nav from './components/Nav';
import { supabase } from './lib/supabase';

// ── STATIC URGENT ISSUES (no DB table yet) ───────────────────────────────────
const URGENT_ISSUES = [
  { severity: 'red', label: 'CONFLICT', artist: 'CLAWZ', artistSlug: 'clawz', issue: 'Buyer pushing LA show June 12 — VIOLATES EDC LV radius clause (active until Aug 15). Reject immediately.' },
  { severity: 'red', label: 'OVERDUE', artist: 'SHOGUN', artistSlug: 'shogun', issue: 'Domicile Miami contract unsigned — 72-hr deadline passed 2 days ago. Chase buyer now.' },
  { severity: 'yellow', label: 'FOLLOW UP', artist: 'MAD DOG', artistSlug: 'mad-dog', issue: 'NYC offer at $3,500 — below floor of $4,000. Counter or decline pending artist approval.' },
  { severity: 'yellow', label: 'FOLLOW UP', artist: 'JUNKIE KID', artistSlug: 'junkie-kid', issue: 'Tomorrowland routing — need HGR details from VEOP by EOD for festival advance.' },
  { severity: 'yellow', label: 'ACTION', artist: 'DRAKK', artistSlug: 'drakk', issue: 'Buyer communicated offer via WhatsApp only. Push to email — nothing is real until written offer received.' },
];

// ── HELPERS ───────────────────────────────────────────────────────────────────
function stageColor(stage) {
  if (['Contracted', 'Confirmed', 'Advanced', 'Settled'].includes(stage)) return 'green';
  if (['Negotiating', 'Offer In', 'Request'].includes(stage)) return 'yellow';
  return 'gray';
}

// Format ISO date for display
function fmtDate(row) {
  if (row.notes && /^[A-Z][a-z]/.test(row.notes)) {
    const display = row.notes.split(' — ')[0];
    if (display) return display;
  }
  if (!row.event_date) return '—';
  const d = new Date(row.event_date + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── STAGE BADGE ───────────────────────────────────────────────────────────────
function StageBadge({ stage, color }) {
  const classes = {
    green: 'bg-emerald-900 text-emerald-300 border border-emerald-700',
    yellow: 'bg-yellow-900 text-yellow-300 border border-yellow-700',
    red: 'bg-red-900 text-red-300 border border-red-700',
    gray: 'bg-gray-800 text-gray-400 border border-gray-700',
  };
  return (
    <span
      className={`px-2 py-0.5 rounded text-xs font-semibold ${
        classes[color] || classes.gray
      }`}
    >
      {stage}
    </span>
  );
}

// ── SEVERITY BADGE ────────────────────────────────────────────────────────────
function SeverityBadge({ severity, label }) {
  const classes = {
    red: 'bg-red-600 text-white',
    yellow: 'bg-yellow-600 text-white',
  };
  return (
    <span
      className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${classes[severity]}`}
    >
      {label}
    </span>
  );
}

// ── KPI CARD ──────────────────────────────────────────────────────────────────
function KpiCard({ kpi }) {
  const borderColors = {
    indigo: 'border-indigo-500',
    blue: 'border-blue-500',
    red: 'border-red-500',
    green: 'border-emerald-500',
  };
  const valueColors = {
    indigo: 'text-indigo-400',
    blue: 'text-blue-400',
    red: 'text-red-400',
    green: 'text-emerald-400',
  };
  return (
    <div
      className={`bg-gray-900 rounded-xl p-6 border-l-4 ${borderColors[kpi.color]} flex flex-col gap-1`}
    >
      <div className="flex items-center justify-between">
        <span className="text-gray-400 text-sm font-medium uppercase tracking-wider">
          {kpi.label}
        </span>
        <span className="text-2xl">{kpi.icon}</span>
      </div>
      <div className={`text-4xl font-bold mt-1 ${valueColors[kpi.color]}`}>
        {kpi.value}
      </div>
      <div className="text-gray-500 text-xs mt-1">{kpi.sub}</div>
    </div>
  );
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
function Dashboard() {
  const [kpis, setKpis] = useState([]);
  const [pipeline, setPipeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const urgentIssues = URGENT_ISSUES;

  useEffect(() => {
    async function load() {
      try {
        const [artistRes, showsRes, pipelineRes] = await Promise.all([
          supabase.from('artists').select('id, name, slug, category'),
          supabase.from('shows').select('artist_slug, fee, deal_type, venue, city, promoter, event_date, notes'),
          supabase.from('pipeline').select('artist_slug, stage, fee_offered, venue, market, buyer, buyer_company, event_date, notes'),
        ]);

        if (artistRes.error) throw artistRes.error;
        if (showsRes.error) throw showsRes.error;
        if (pipelineRes.error) throw pipelineRes.error;

        const artists = artistRes.data;
        const shows = showsRes.data;
        const deals = pipelineRes.data;

        // Build slug → name map
        const nameMap = Object.fromEntries(artists.map((a) => [a.slug, a.name]));

        // ── KPIs ──────────────────────────────────────────────────────────────
        const totalArtists = artists.length;
        const priorityCount = artists.filter((a) => a.category === 'priority').length;
        const rosterCount = artists.filter((a) => a.category !== 'priority').length;
        const activeDeals = shows.length + deals.length;

        // Commission: sum confirmed show fees × 10% artist commission × 60% Danny's cut
        const confirmedFeeTotal = shows.reduce((sum, s) => {
          const n = parseFloat((s.fee || '').replace(/[^0-9.]/g, ''));
          return sum + (isNaN(n) ? 0 : n);
        }, 0);
        const commission = Math.round(confirmedFeeTotal * 0.10 * 0.60);

        setKpis([
          { label: 'Roster Artists', value: String(totalArtists), sub: `${priorityCount} priority · ${rosterCount} full roster`, icon: '🎧', color: 'indigo' },
          { label: 'Active Deals', value: String(activeDeals), sub: 'Across all pipeline stages', icon: '📋', color: 'blue' },
          { label: 'Urgent Issues', value: String(urgentIssues.length), sub: 'Require action today', icon: '🚨', color: 'red' },
          { label: '2026 Commission', value: commission > 0 ? `$${commission.toLocaleString()}` : '$25,295', sub: "Danny's 60% share YTD", icon: '💰', color: 'green' },
        ]);

        // ── PIPELINE SNAPSHOT ─────────────────────────────────────────────────
        // Merge confirmed shows + pipeline deals into a single sorted list
        const showRows = shows.map((s) => ({
          artistSlug: s.artist_slug,
          artist: nameMap[s.artist_slug] || s.artist_slug,
          event: s.venue,
          date: fmtDate(s),
          buyer: s.promoter,
          fee: s.fee,
          stage: s.deal_type,
          stageColor: stageColor(s.deal_type),
          _sortDate: s.event_date || '9999',
        }));

        const dealRows = deals.map((d) => ({
          artistSlug: d.artist_slug,
          artist: nameMap[d.artist_slug] || d.artist_slug,
          event: d.venue,
          date: fmtDate(d),
          buyer: d.buyer_company || d.buyer,
          fee: d.fee_offered,
          stage: d.stage,
          stageColor: stageColor(d.stage),
          _sortDate: d.event_date || '9999',
        }));

        const merged = [...showRows, ...dealRows].sort((a, b) =>
          a._sortDate.localeCompare(b._sortDate)
        );

        setPipeline(merged);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [urgentIssues.length]);

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="min-h-screen text-white" style={{ backgroundColor: '#111827' }}>
      <Nav />

      <main className="max-w-7xl mx-auto px-6 py-8">

        {/* Page Header */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white">Dashboard Overview</h2>
          <p className="text-gray-500 text-sm mt-1">{dateStr}</p>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-xl px-5 py-4 mb-6 text-sm">
            Failed to load dashboard data: {error}
          </div>
        )}

        {/* ── KPI CARDS ── */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-gray-900 rounded-xl p-6 border-l-4 border-gray-800 animate-pulse h-28" />
              ))
            : kpis.map((kpi) => <KpiCard key={kpi.label} kpi={kpi} />)
          }
        </section>

        {/* ── URGENT ISSUES ── */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-lg font-bold text-white">Urgent Issues</h3>
            <span className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {urgentIssues.length}
            </span>
          </div>

          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            {urgentIssues.map((item, i) => (
              <div
                key={i}
                className={`flex items-start gap-4 px-5 py-4 ${
                  i < urgentIssues.length - 1 ? 'border-b border-gray-800' : ''
                } ${item.severity === 'red' ? 'bg-red-950/20' : 'bg-yellow-950/10'}`}
              >
                <div
                  className={`w-1 self-stretch rounded-full flex-shrink-0 ${
                    item.severity === 'red' ? 'bg-red-500' : 'bg-yellow-500'
                  }`}
                />
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <SeverityBadge severity={item.severity} label={item.label} />
                    <Link
                      to={`/artists/${item.artistSlug}`}
                      className="text-white font-bold text-sm hover:text-indigo-300 transition-colors"
                    >
                      {item.artist}
                    </Link>
                  </div>
                  <p className="text-gray-400 text-sm leading-relaxed">{item.issue}</p>
                </div>
                <button
                  className={`flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                    item.severity === 'red'
                      ? 'border-red-600 text-red-400 hover:bg-red-600 hover:text-white'
                      : 'border-yellow-600 text-yellow-400 hover:bg-yellow-600 hover:text-white'
                  }`}
                >
                  Resolve
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* ── PIPELINE SNAPSHOT ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white">Active Pipeline Snapshot</h3>
            <Link to="/artists" className="text-indigo-400 text-sm hover:underline">
              View all artists →
            </Link>
          </div>

          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-x-auto">
            {loading ? (
              <div className="animate-pulse p-6 space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-4 bg-gray-800 rounded w-full" />
                ))}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    {['Artist', 'Event', 'Date', 'Buyer', 'Fee', 'Stage'].map((h) => (
                      <th
                        key={h}
                        className="text-left text-gray-500 font-semibold uppercase tracking-wider text-xs px-5 py-3"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pipeline.map((row, i) => (
                    <tr
                      key={i}
                      className="border-b border-gray-800 last:border-0 hover:bg-gray-800/50 transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <Link
                          to={`/artists/${row.artistSlug}`}
                          className="font-bold text-white hover:text-indigo-300 transition-colors"
                        >
                          {row.artist}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 text-gray-300">{row.event}</td>
                      <td className="px-5 py-3.5 text-gray-400 whitespace-nowrap">{row.date}</td>
                      <td className="px-5 py-3.5 text-gray-400">{row.buyer}</td>
                      <td className="px-5 py-3.5 font-semibold text-emerald-400">{row.fee}</td>
                      <td className="px-5 py-3.5">
                        <StageBadge stage={row.stage} color={row.stageColor} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* ── FOOTER ── */}
        <footer className="mt-10 pt-6 border-t border-gray-800 text-center">
          <p className="text-gray-600 text-xs tracking-wide">
            CORSON COMMAND CENTER · Corson Agency · Hard Techno Division · Danny Ho (Johnny Blaze)
          </p>
        </footer>
      </main>
    </div>
  );
}

// ── APP (ROUTER) ──────────────────────────────────────────────────────────────
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/artists" element={<ArtistList />} />
        <Route path="/artists/:slug" element={<ArtistDetail />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
