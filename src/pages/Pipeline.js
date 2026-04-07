import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import Nav from '../components/Nav';

// ── COLUMN DEFINITIONS ────────────────────────────────────────────────────────
// Maps each kanban column to which stages from pipeline/shows belong there.
const COLUMNS = [
  {
    id: 'offer-in',
    label: 'Offer In',
    stages: ['Inquiry', 'Request', 'Offer In'],
    source: 'pipeline',
    accent: 'border-yellow-600',
    headerBg: 'bg-yellow-900/30',
    headerText: 'text-yellow-300',
    dot: 'bg-yellow-500',
  },
  {
    id: 'negotiating',
    label: 'Negotiating',
    stages: ['Negotiating'],
    source: 'pipeline',
    accent: 'border-orange-500',
    headerBg: 'bg-orange-900/30',
    headerText: 'text-orange-300',
    dot: 'bg-orange-500',
  },
  {
    id: 'confirmed',
    label: 'Confirmed',
    stages: ['Confirmed', 'Contracted'],
    source: 'shows',
    accent: 'border-emerald-600',
    headerBg: 'bg-emerald-900/30',
    headerText: 'text-emerald-300',
    dot: 'bg-emerald-500',
  },
  {
    id: 'advancing',
    label: 'Advancing',
    stages: ['Advanced'],
    source: 'shows',
    accent: 'border-blue-500',
    headerBg: 'bg-blue-900/30',
    headerText: 'text-blue-300',
    dot: 'bg-blue-500',
  },
  {
    id: 'settled',
    label: 'Settled',
    stages: ['Settled'],
    source: 'shows',
    accent: 'border-gray-500',
    headerBg: 'bg-gray-800/50',
    headerText: 'text-gray-400',
    dot: 'bg-gray-500',
  },
];

// ── HELPERS ───────────────────────────────────────────────────────────────────
function fmtDate(eventDate, notes) {
  if (notes && /^[A-Z][a-z]/.test(notes)) {
    const display = notes.split(' — ')[0];
    if (display) return display;
  }
  if (!eventDate) return '—';
  const d = new Date(eventDate + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── DEAL CARD ─────────────────────────────────────────────────────────────────
function DealCard({ deal, col, artistNames }) {
  const artistName = artistNames[deal.artist_slug] || deal.artist_slug;
  const date = fmtDate(deal.event_date, deal.notes);
  const location = deal.market || deal.city || '—';
  const fee = deal.fee_offered || deal.fee || '—';
  const buyer = deal.buyer_company || deal.buyer || deal.promoter || '—';

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-600 transition-colors">
      {/* Artist name */}
      <Link
        to={`/artists/${deal.artist_slug}`}
        className="text-white font-bold text-sm hover:text-indigo-300 transition-colors block mb-2"
      >
        {artistName}
      </Link>

      {/* Stage sub-label (shows the actual stage within the column) */}
      {deal.stage || deal.deal_type ? (
        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded border mb-3 inline-block ${col.headerBg} ${col.headerText} border-current/30`}>
          {deal.stage || deal.deal_type}
        </span>
      ) : null}

      {/* Details */}
      <div className="space-y-1.5 text-xs">
        <div className="flex items-start gap-2">
          <span className="text-gray-600 w-12 flex-shrink-0">Date</span>
          <span className="text-gray-300">{date}</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-gray-600 w-12 flex-shrink-0">City</span>
          <span className="text-gray-300">{location}</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-gray-600 w-12 flex-shrink-0">Venue</span>
          <span className="text-gray-300 truncate">{deal.venue || '—'}</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-gray-600 w-12 flex-shrink-0">Buyer</span>
          <span className="text-gray-300">{buyer}</span>
        </div>
      </div>

      {/* Fee footer */}
      {fee && fee !== '—' && (
        <div className={`mt-3 pt-3 border-t border-gray-800 font-bold text-sm ${col.headerText}`}>
          {fee}
        </div>
      )}
    </div>
  );
}

// ── KANBAN COLUMN ─────────────────────────────────────────────────────────────
function KanbanColumn({ col, deals, artistNames }) {
  return (
    <div className={`flex-1 min-w-[220px] max-w-xs flex flex-col rounded-xl border-t-2 ${col.accent} bg-gray-900/50`}>
      {/* Column header */}
      <div className={`px-4 py-3 rounded-t-xl flex items-center justify-between ${col.headerBg}`}>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${col.dot}`} />
          <span className={`text-sm font-bold uppercase tracking-wider ${col.headerText}`}>
            {col.label}
          </span>
        </div>
        <span className="text-gray-500 text-xs font-semibold bg-gray-800 px-2 py-0.5 rounded-full">
          {deals.length}
        </span>
      </div>

      {/* Cards */}
      <div className="p-3 flex flex-col gap-3 flex-1">
        {deals.length === 0 ? (
          <div className="text-gray-700 text-xs text-center py-6 border border-dashed border-gray-800 rounded-lg">
            No deals
          </div>
        ) : (
          deals.map((deal) => (
            <DealCard key={deal.id} deal={deal} col={col} artistNames={artistNames} />
          ))
        )}
      </div>
    </div>
  );
}

// ── PAGE ──────────────────────────────────────────────────────────────────────
export default function Pipeline() {
  const [pipelineDeals, setPipelineDeals] = useState([]);
  const [shows, setShows] = useState([]);
  const [artists, setArtists] = useState([]);
  const [filterSlug, setFilterSlug] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const [pRes, sRes, aRes] = await Promise.all([
          supabase.from('pipeline').select('*').order('event_date'),
          supabase.from('shows').select('*').order('event_date'),
          supabase.from('artists').select('id, name, slug').order('name'),
        ]);
        if (pRes.error) throw pRes.error;
        if (sRes.error) throw sRes.error;
        if (aRes.error) throw aRes.error;

        setPipelineDeals(pRes.data);
        setShows(sRes.data);
        setArtists(aRes.data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Slug → display name map
  const artistNames = useMemo(
    () => Object.fromEntries(artists.map((a) => [a.slug, a.name])),
    [artists]
  );

  // Apply artist filter
  const filteredPipeline = filterSlug
    ? pipelineDeals.filter((d) => d.artist_slug === filterSlug)
    : pipelineDeals;
  const filteredShows = filterSlug
    ? shows.filter((s) => s.artist_slug === filterSlug)
    : shows;

  // Assign each deal to its kanban column
  const columnDeals = useMemo(() => {
    return COLUMNS.map((col) => {
      let deals = [];
      if (col.source === 'pipeline') {
        deals = filteredPipeline.filter((d) => col.stages.includes(d.stage));
      } else {
        deals = filteredShows.filter((s) => col.stages.includes(s.deal_type));
      }
      return { ...col, deals };
    });
  }, [filteredPipeline, filteredShows]);

  const totalDeals = pipelineDeals.length + shows.length;

  return (
    <div className="min-h-screen text-white" style={{ backgroundColor: '#111827' }}>
      <Nav />

      {/* ── BREADCRUMB ── */}
      <div className="max-w-full px-6 pt-6">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Link to="/" className="hover:text-white transition-colors">Dashboard</Link>
          <span>/</span>
          <span className="text-gray-300">Pipeline</span>
        </div>
      </div>

      <main className="px-6 py-6">

        {/* ── HEADER + FILTER ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white">Pipeline Board</h2>
            <p className="text-gray-500 text-sm mt-1">
              {loading ? 'Loading…' : `${totalDeals} total deals across ${COLUMNS.length} stages`}
            </p>
          </div>

          {/* Artist filter */}
          <select
            value={filterSlug}
            onChange={(e) => setFilterSlug(e.target.value)}
            className="bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 min-w-[180px]"
          >
            <option value="">All Artists</option>
            {artists.map((a) => (
              <option key={a.slug} value={a.slug}>{a.name}</option>
            ))}
          </select>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-xl px-5 py-4 mb-6 text-sm">
            Failed to load pipeline: {error}
          </div>
        )}

        {/* ── KANBAN BOARD ── */}
        {loading ? (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {COLUMNS.map((col) => (
              <div key={col.id} className={`flex-1 min-w-[220px] max-w-xs rounded-xl border-t-2 ${col.accent} bg-gray-900/50 animate-pulse`}>
                <div className={`px-4 py-3 rounded-t-xl h-12 ${col.headerBg}`} />
                <div className="p-3 space-y-3">
                  {[1, 2].map((i) => (
                    <div key={i} className="bg-gray-800 rounded-xl h-28" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-6" style={{ minHeight: '60vh' }}>
            {columnDeals.map((col) => (
              <KanbanColumn
                key={col.id}
                col={col}
                deals={col.deals}
                artistNames={artistNames}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
