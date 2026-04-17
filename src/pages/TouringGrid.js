import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import Nav from '../components/Nav';

// ── HELPERS ───────────────────────────────────────────────────────────────────
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

function dayOfWeek(isoDate) {
  if (!isoDate) return '';
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });
}

function monthLabel(isoDate) {
  if (!isoDate) return 'Unknown';
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function sortKey(isoDate) {
  return isoDate || '9999-12-31';
}

// ── STATUS / BADGE CONFIG ─────────────────────────────────────────────────────
const STAGE_STYLE = {
  'Inquiry / Request':      { row: 'bg-indigo-950/10 hover:bg-indigo-950/20', badge: 'bg-indigo-900 text-indigo-300 border-indigo-700', dot: 'bg-indigo-500' },
  'Offer In + Negotiating': { row: 'bg-yellow-950/10 hover:bg-yellow-950/20', badge: 'bg-yellow-900 text-yellow-300 border-yellow-700', dot: 'bg-yellow-500' },
  Confirmed:                { row: 'bg-emerald-950/20 hover:bg-emerald-950/30', badge: 'bg-emerald-900 text-emerald-300 border-emerald-700', dot: 'bg-emerald-500' },
  Advancing:                { row: 'bg-blue-950/20 hover:bg-blue-950/30',    badge: 'bg-blue-900 text-blue-300 border-blue-700',       dot: 'bg-blue-500' },
  Settled:                  { row: 'hover:bg-gray-800/30',                    badge: 'bg-gray-800 text-gray-400 border-gray-600',       dot: 'bg-gray-500' },
};

function getStyle(stage) {
  return STAGE_STYLE[stage] || { row: 'hover:bg-gray-800/30', badge: 'bg-gray-800 text-gray-400 border-gray-600', dot: 'bg-gray-500' };
}

function StageBadge({ stage }) {
  const { badge } = getStyle(stage);
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${badge}`}>
      {stage}
    </span>
  );
}

// ── PAGE ──────────────────────────────────────────────────────────────────────
export default function TouringGrid() {
  const { slug } = useParams();
  const [artist, setArtist] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const [aRes, sRes, pRes] = await Promise.all([
          supabase.from('artists').select('id, name, slug, genre, base').eq('slug', slug).single(),
          supabase.from('shows').select('*').eq('artist_slug', slug).order('event_date'),
          supabase.from('pipeline').select('*').eq('artist_slug', slug).order('event_date'),
        ]);
        if (aRes.error) throw aRes.error;
        if (sRes.error) throw sRes.error;
        if (pRes.error) throw pRes.error;

        setArtist(aRes.data);

        // Merge shows + pipeline into a single sorted list
        const showRows = (sRes.data || []).map(s => ({
          ...s,
          _stage: s.deal_type,
          _location: s.city,
          _buyer: s.promoter,
          _sortKey: sortKey(s.event_date),
          _source: 'show',
        }));
        const pipeRows = (pRes.data || []).map(p => ({
          ...p,
          _stage: p.stage,
          _location: p.market,
          _buyer: p.buyer_company || p.buyer,
          _fee: p.fee_offered,
          _sortKey: sortKey(p.event_date),
          _source: 'pipeline',
        }));

        const merged = [...showRows, ...pipeRows].sort((a, b) =>
          a._sortKey.localeCompare(b._sortKey)
        );
        setRows(merged);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [slug]);

  // Group rows by month label
  const grouped = rows.reduce((acc, row) => {
    const label = monthLabel(row.event_date);
    if (!acc[label]) acc[label] = [];
    acc[label].push(row);
    return acc;
  }, {});

  const months = Object.keys(grouped);

  return (
    <div className="min-h-screen text-white" style={{ backgroundColor: '#111827' }}>
      <Nav />

      {/* Breadcrumb */}
      <div className="max-w-7xl mx-auto px-6 pt-6">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Link to="/" className="hover:text-white transition-colors">Dashboard</Link>
          <span>/</span>
          <Link to="/artists" className="hover:text-white transition-colors">Artists</Link>
          <span>/</span>
          <Link to={`/artists/${slug}`} className="hover:text-white transition-colors">{artist?.name ?? slug}</Link>
          <span>/</span>
          <span className="text-gray-300">Touring Grid</span>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-6">

        {error && (
          <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-xl px-5 py-4 mb-6 text-sm">
            {error}
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white">
              {loading ? '…' : `${artist?.name} — Touring Grid`}
            </h2>
            <p className="text-gray-500 text-sm mt-1">
              {loading ? '' : `${rows.length} dates · ${artist?.genre}`}
            </p>
          </div>

          {/* Legend */}
          {!loading && (
            <div className="flex flex-wrap items-center gap-3 text-xs">
              {[
                { label: 'Confirmed', dot: 'bg-emerald-500' },
                { label: 'Advancing', dot: 'bg-blue-500' },
                { label: 'In Negotiation', dot: 'bg-yellow-500' },
                { label: 'Settled', dot: 'bg-gray-500' },
              ].map(({ label, dot }) => (
                <div key={label} className="flex items-center gap-1.5 text-gray-400">
                  <div className={`w-2 h-2 rounded-full ${dot}`} />
                  {label}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div className="space-y-6">
            {[1, 2].map(i => (
              <div key={i} className="animate-pulse">
                <div className="h-5 bg-gray-800 rounded w-32 mb-3" />
                <div className="bg-gray-900 rounded-xl border border-gray-800 h-40" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="bg-gray-900 rounded-xl border border-gray-800 px-5 py-12 text-center">
            <p className="text-gray-500 text-sm">No shows or deals on record yet.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {months.map(month => (
              <div key={month}>
                {/* Month header */}
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="text-sm font-bold text-gray-300 uppercase tracking-widest">{month}</h3>
                  <div className="flex-1 h-px bg-gray-800" />
                  <span className="text-xs text-gray-600 font-semibold">{grouped[month].length} date{grouped[month].length !== 1 ? 's' : ''}</span>
                </div>

                <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800">
                        {['Date', 'Day', 'City', 'Venue', 'Buyer', 'Fee', 'Stage'].map(h => (
                          <th key={h} className="text-left text-gray-500 text-xs font-semibold uppercase tracking-wider px-5 py-3">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {grouped[month].map(row => {
                        const style = getStyle(row._stage);
                        const fee = row.fee || row._fee || '—';
                        return (
                          <tr key={row.id} className={`border-b border-gray-800 last:border-0 transition-colors ${style.row}`}>
                            <td className="px-5 py-3.5 text-gray-300 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${style.dot}`} />
                                {fmtDate(row)}
                              </div>
                            </td>
                            <td className="px-5 py-3.5 text-gray-500">{dayOfWeek(row.event_date)}</td>
                            <td className="px-5 py-3.5 text-gray-300">{row._location || '—'}</td>
                            <td className="px-5 py-3.5 text-white font-medium">{row.venue || '—'}</td>
                            <td className="px-5 py-3.5 text-gray-400">{row._buyer || '—'}</td>
                            <td className="px-5 py-3.5 text-emerald-400 font-semibold">{fee}</td>
                            <td className="px-5 py-3.5"><StageBadge stage={row._stage} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Back button */}
        <div className="mt-6">
          <Link to={`/artists/${slug}`} className="text-gray-400 hover:text-white text-sm transition-colors">
            ← Back to {artist?.name ?? slug}
          </Link>
        </div>
      </main>
    </div>
  );
}
