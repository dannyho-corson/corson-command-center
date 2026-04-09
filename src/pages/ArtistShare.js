import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

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
  if (!isoDate) return 'Upcoming';
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function fmtCount(n) {
  if (!n) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

function simplifyTargetStatus(s) {
  if (s === 'Confirmed') return 'Confirmed';
  if (s === 'Active' || s === 'Warm') return 'Active';
  return 'Pitching';
}

const TARGET_STATUS_STYLE = {
  Confirmed: 'bg-emerald-900/60 text-emerald-300 border-emerald-700',
  Active:    'bg-yellow-900/60 text-yellow-300 border-yellow-700',
  Pitching:  'bg-gray-800 text-gray-400 border-gray-700',
};

// ── SECTION HEADER ────────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <section className="mb-10">
      <div className="flex items-center gap-4 mb-4">
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest whitespace-nowrap">{title}</h2>
        <div className="flex-1 h-px bg-gray-800" />
      </div>
      {children}
    </section>
  );
}

// ── TABLE WRAPPER ─────────────────────────────────────────────────────────────
function Table({ headers, children, empty }) {
  return (
    <div className="bg-gray-900/60 rounded-xl border border-gray-800 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800">
            {headers.map(h => (
              <th key={h} className="text-left text-gray-600 text-xs font-semibold uppercase tracking-wider px-5 py-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {children || (
            <tr>
              <td colSpan={headers.length} className="px-5 py-8 text-center text-gray-600 text-sm">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── PAGE ──────────────────────────────────────────────────────────────────────
export default function ArtistShare() {
  const { slug } = useParams();
  const [artist, setArtist] = useState(null);
  const [shows, setShows] = useState([]);
  const [pipeline, setPipeline] = useState([]);
  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function load() {
      const [aRes, sRes, pRes, tRes] = await Promise.all([
        supabase.from('artists').select('name, slug, genre, base, spotify, instagram, instagram_followers').eq('slug', slug).single(),
        supabase.from('shows').select('id, event_date, city, venue, promoter, deal_type, notes').eq('artist_slug', slug).order('event_date'),
        supabase.from('pipeline').select('id, event_date, market, venue, notes').eq('artist_slug', slug).order('event_date'),
        supabase.from('targets').select('id, promoter, market, status').eq('artist_slug', slug).order('promoter'),
      ]);
      if (aRes.error || !aRes.data) { setNotFound(true); setLoading(false); return; }
      setArtist(aRes.data);
      setShows(sRes.data || []);
      setPipeline(pRes.data || []);
      setTargets(tRes.data || []);
      setLoading(false);
    }
    load();
  }, [slug]);

  // Group shows by month for touring grid
  const grouped = shows.reduce((acc, row) => {
    const label = monthLabel(row.event_date);
    if (!acc[label]) acc[label] = [];
    acc[label].push(row);
    return acc;
  }, {});
  const months = Object.keys(grouped);

  // ── LOADING ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0f1117' }}>
        <div className="text-gray-600 text-sm tracking-widest uppercase animate-pulse">Loading…</div>
      </div>
    );
  }

  // ── NOT FOUND ─────────────────────────────────────────────────────────────────
  if (notFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ backgroundColor: '#0f1117' }}>
        <p className="text-gray-400 text-lg">Artist not found.</p>
        <p className="text-gray-600 text-sm">Contact dho@corsonagency.com</p>
      </div>
    );
  }

  const igFollowers = fmtCount(artist.instagram_followers);

  return (
    <div className="min-h-screen text-white" style={{ backgroundColor: '#0f1117' }}>

      {/* ── HEADER ── */}
      <header className="border-b border-gray-800/60 px-6 py-5">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: '#6366F1' }}
            >
              <span className="text-white font-bold text-xs">CA</span>
            </div>
            <span className="text-white font-bold text-sm tracking-widest uppercase">Corson Agency</span>
          </div>
          <span className="text-gray-600 text-xs tracking-wider hidden sm:block">Artist Overview</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">

        {/* ── ARTIST IDENTITY ── */}
        <div className="mb-10">
          <h1 className="text-4xl font-bold text-white tracking-tight mb-1">{artist.name}</h1>
          {artist.genre && (
            <p className="text-indigo-400 font-medium text-base mb-4">{artist.genre}</p>
          )}

          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {artist.base && (
              <div className="flex items-center gap-2">
                <span className="text-gray-600 text-xs uppercase tracking-wider">Base</span>
                <span className="text-gray-300">{artist.base}</span>
              </div>
            )}
            {artist.spotify && (
              <div className="flex items-center gap-2">
                <span className="text-gray-600 text-xs uppercase tracking-wider">Spotify</span>
                <span className="text-gray-300">{artist.spotify} monthly listeners</span>
              </div>
            )}
            {artist.instagram && (
              <div className="flex items-center gap-2">
                <span className="text-gray-600 text-xs uppercase tracking-wider">Instagram</span>
                <span className="text-gray-300">
                  {artist.instagram}{igFollowers ? ` · ${igFollowers} followers` : ''}
                </span>
              </div>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-gray-800/60">
            <span className="text-gray-600 text-xs uppercase tracking-wider">Booking</span>
            <span className="text-gray-400 text-sm ml-3">Corson Agency · dho@corsonagency.com</span>
          </div>
        </div>

        {/* ── CONFIRMED SHOWS ── */}
        <Section title="Confirmed Shows">
          {shows.length === 0 ? (
            <p className="text-gray-600 text-sm">No confirmed shows on record.</p>
          ) : (
            <Table headers={['Date', 'City', 'Venue', 'Promoter']}>
              {shows.map(show => (
                <tr key={show.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/20 transition-colors">
                  <td className="px-5 py-3.5 text-gray-300 whitespace-nowrap">{fmtDate(show)}</td>
                  <td className="px-5 py-3.5 text-gray-300">{show.city || '—'}</td>
                  <td className="px-5 py-3.5 text-white font-medium">{show.venue || '—'}</td>
                  <td className="px-5 py-3.5 text-gray-400">{show.promoter || '—'}</td>
                </tr>
              ))}
            </Table>
          )}
        </Section>

        {/* ── IN THE WORKS ── */}
        {pipeline.length > 0 && (
          <Section title="In The Works">
            <Table headers={['Date', 'Market', 'Venue', 'Status']}>
              {pipeline.map(deal => (
                <tr key={deal.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/20 transition-colors">
                  <td className="px-5 py-3.5 text-gray-400 whitespace-nowrap">{fmtDate(deal)}</td>
                  <td className="px-5 py-3.5 text-gray-300">{deal.market || '—'}</td>
                  <td className="px-5 py-3.5 text-gray-300">{deal.venue || '—'}</td>
                  <td className="px-5 py-3.5">
                    <span className="px-2 py-0.5 rounded text-xs font-semibold border bg-gray-800 text-gray-400 border-gray-700">
                      In Progress
                    </span>
                  </td>
                </tr>
              ))}
            </Table>
          </Section>
        )}

        {/* ── TARGET MARKETS ── */}
        {targets.length > 0 && (
          <Section title="Target Markets">
            <Table headers={['Promoter / Venue', 'Market', 'Status']}>
              {targets.map(t => {
                const s = simplifyTargetStatus(t.status);
                return (
                  <tr key={t.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/20 transition-colors">
                    <td className="px-5 py-3.5 text-gray-300">{t.promoter}</td>
                    <td className="px-5 py-3.5 text-gray-400">{t.market || '—'}</td>
                    <td className="px-5 py-3.5">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${TARGET_STATUS_STYLE[s]}`}>
                        {s}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </Table>
          </Section>
        )}

        {/* ── TOURING GRID ── */}
        {shows.length > 0 && (
          <Section title="Touring Grid">
            <div className="space-y-6">
              {months.map(month => (
                <div key={month}>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">{month}</p>
                  <Table headers={['Date', 'Day', 'City', 'Venue']}>
                    {grouped[month].map(show => (
                      <tr key={show.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/20 transition-colors">
                        <td className="px-5 py-3 text-gray-300 whitespace-nowrap">{fmtDate(show)}</td>
                        <td className="px-5 py-3 text-gray-600">{dayOfWeek(show.event_date)}</td>
                        <td className="px-5 py-3 text-gray-300">{show.city || '—'}</td>
                        <td className="px-5 py-3 text-white font-medium">{show.venue || '—'}</td>
                      </tr>
                    ))}
                  </Table>
                </div>
              ))}
            </div>
          </Section>
        )}

      </main>

      {/* ── FOOTER ── */}
      <footer className="border-t border-gray-800/60 px-6 py-6 mt-4">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <p className="text-gray-600 text-xs">
            Managed by <span className="text-gray-500">Corson Agency</span> · dho@corsonagency.com
          </p>
          <p className="text-gray-700 text-xs">
            Corson Agency · Hard Techno Division · {new Date().getFullYear()}
          </p>
        </div>
      </footer>

    </div>
  );
}
