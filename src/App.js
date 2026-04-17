import { useState, useEffect, useMemo } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import './App.css';
import ArtistList from './pages/ArtistList';
import ArtistDetail from './pages/ArtistDetail';
import Pipeline from './pages/Pipeline';
import TargetList from './pages/TargetList';
import TouringGrid from './pages/TouringGrid';
import Rolodex from './pages/Rolodex';
import Financials from './pages/Financials';
import ArtistShare from './pages/ArtistShare';
import Nav from './components/Nav';
import IndustryIntelWidget from './components/IndustryIntelWidget';
import { supabase } from './lib/supabase';

// Map a Supabase urgent_issues row → the shape the dashboard card expects.
// Priority → severity + badge label. Artist name comes from the artists map
// (falls back to the slug uppercased if the artist hasn't loaded yet).
function shapeUrgentIssue(row, artistNameBySlug) {
  const severity = row.priority === 'High' ? 'red' : 'yellow';
  const label = row.priority === 'High' ? 'URGENT'
              : row.priority === 'Medium' ? 'FOLLOW UP'
              : 'NOTE';
  const artist = (artistNameBySlug?.[row.artist_slug] || row.artist_slug || '').toUpperCase();
  return {
    id: row.id,
    artistSlug: row.artist_slug,
    artist,
    severity,
    label,
    issue: row.issue,
  };
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
// ── AVAILABILITY WIDGET ──────────────────────────────────────────────────────
// Given all roster artists + all shows, return three buckets for a chosen date.
// CONFIRMED/ADVANCING = show on that date with deal_type Confirmed/Contracted/Advanced/Settled
// HOLD/PENDING       = pipeline entry on that date, or show with deal_type Hold/Pending
// AVAILABLE          = everyone else
function bucketArtistsForDate(artists, shows, pipeline, dateStr) {
  const confirmedStatuses = new Set(['Confirmed', 'Contracted', 'Advanced', 'Settled', 'Advancing']);
  const holdStatuses = new Set(['Hold', 'Pending']);

  const confirmedBy = new Map(); // slug -> [show, ...]
  const holdBy = new Map();

  for (const s of shows) {
    if (s.event_date !== dateStr) continue;
    if (confirmedStatuses.has(s.deal_type)) {
      if (!confirmedBy.has(s.artist_slug)) confirmedBy.set(s.artist_slug, []);
      confirmedBy.get(s.artist_slug).push(s);
    } else if (holdStatuses.has(s.deal_type)) {
      if (!holdBy.has(s.artist_slug)) holdBy.set(s.artist_slug, []);
      holdBy.get(s.artist_slug).push(s);
    }
  }
  for (const p of pipeline) {
    if (p.event_date !== dateStr) continue;
    if (confirmedBy.has(p.artist_slug)) continue; // confirmed trumps hold
    if (!holdBy.has(p.artist_slug)) holdBy.set(p.artist_slug, []);
    holdBy.get(p.artist_slug).push({ venue: p.venue, city: p.market, promoter: p.buyer_company || p.buyer, stage: p.stage });
  }

  const confirmed = [];
  const hold = [];
  const available = [];

  for (const a of artists) {
    if (confirmedBy.has(a.slug)) {
      confirmed.push({ artist: a, entries: confirmedBy.get(a.slug) });
    } else if (holdBy.has(a.slug)) {
      hold.push({ artist: a, entries: holdBy.get(a.slug) });
    } else {
      available.push({ artist: a });
    }
  }

  return { confirmed, hold, available };
}

// Find next N open Fri/Sat weekends (no show) for an artist slug.
function findOpenWeekends(slug, shows, pipeline, count = 10) {
  const blocked = new Set();
  for (const s of shows) if (s.artist_slug === slug && s.event_date) blocked.add(s.event_date);
  for (const p of pipeline) if (p.artist_slug === slug && p.event_date) blocked.add(p.event_date);

  const results = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cursor = new Date(today);
  // advance to next Friday
  while (cursor.getDay() !== 5) cursor.setDate(cursor.getDate() + 1);

  const fmtISO = d => d.toISOString().split('T')[0];
  const fmtDisplay = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // Iterate up to 2 years out to be safe
  for (let i = 0; i < 104 && results.length < count; i++) {
    const fri = new Date(cursor);
    const sat = new Date(cursor);
    sat.setDate(sat.getDate() + 1);
    const friISO = fmtISO(fri);
    const satISO = fmtISO(sat);
    if (!blocked.has(friISO) && !blocked.has(satISO)) {
      results.push({ friISO, satISO, label: `${fmtDisplay(fri)} – ${fmtDisplay(sat)}` });
    }
    cursor.setDate(cursor.getDate() + 7);
  }
  return results;
}

function AvailabilityWidget({ artists, shows, pipeline, loading }) {
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [artistQuery, setArtistQuery] = useState('');
  const [selectedSlug, setSelectedSlug] = useState(null);

  const buckets = useMemo(
    () => bucketArtistsForDate(artists, shows, pipeline, date),
    [artists, shows, pipeline, date]
  );

  const artistMatches = useMemo(() => {
    const q = artistQuery.trim().toLowerCase();
    if (!q) return [];
    return artists
      .filter(a => a.name.toLowerCase().includes(q) || a.slug.toLowerCase().includes(q))
      .slice(0, 8);
  }, [artistQuery, artists]);

  const openWeekends = useMemo(() => {
    if (!selectedSlug) return null;
    return findOpenWeekends(selectedSlug, shows, pipeline, 10);
  }, [selectedSlug, shows, pipeline]);

  const selectedArtist = selectedSlug ? artists.find(a => a.slug === selectedSlug) : null;

  const fmtSelectedDate = d => {
    if (!d) return '';
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-white">Availability Check</h3>
        <Link to="/artists" className="text-indigo-400 text-sm hover:underline">
          View all artists →
        </Link>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-5">
        {/* Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1.5">
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
            />
            {date && (
              <p className="text-gray-500 text-xs mt-1.5">{fmtSelectedDate(date)}</p>
            )}
          </div>
          <div className="relative">
            <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1.5">
              Next open weekends
            </label>
            <input
              type="text"
              value={artistQuery}
              onChange={e => { setArtistQuery(e.target.value); setSelectedSlug(null); }}
              placeholder="Search artist — e.g. Junkie Kid"
              className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600"
            />
            {artistQuery.trim() && !selectedSlug && artistMatches.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden">
                {artistMatches.map(a => (
                  <button
                    key={a.slug}
                    type="button"
                    onClick={() => { setSelectedSlug(a.slug); setArtistQuery(a.name); }}
                    className="w-full text-left px-3 py-2 text-sm text-white hover:bg-indigo-600 transition-colors"
                  >
                    {a.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="animate-pulse space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-4 bg-gray-800 rounded w-full" />
            ))}
          </div>
        ) : (
          <>
            {/* Buckets */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <AvailabilityBucket
                tone="red"
                title="Confirmed / Advancing"
                subtitle="Not available"
                rows={buckets.confirmed}
              />
              <AvailabilityBucket
                tone="yellow"
                title="Hold / Pending"
                subtitle="Tentatively unavailable"
                rows={buckets.hold}
              />
              <AvailabilityBucket
                tone="green"
                title="Available"
                subtitle="All other roster"
                rows={buckets.available}
                compact
              />
            </div>

            {/* Open weekends */}
            {selectedArtist && openWeekends && (
              <div className="border-t border-gray-800 pt-4">
                <p className="text-gray-400 text-sm mb-3">
                  Next {openWeekends.length} open weekends for{' '}
                  <Link to={`/artists/${selectedArtist.slug}`} className="text-white font-bold hover:text-indigo-300">
                    {selectedArtist.name}
                  </Link>
                  <span className="text-gray-600"> · Fri/Sat with no shows</span>
                </p>
                {openWeekends.length === 0 ? (
                  <p className="text-gray-500 text-sm">Fully booked — no open weekends in the next 2 years.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                    {openWeekends.map(w => (
                      <button
                        key={w.friISO}
                        onClick={() => setDate(w.friISO)}
                        className="text-left bg-emerald-950/40 border border-emerald-800/60 hover:border-emerald-500 rounded-lg px-3 py-2 text-xs text-emerald-300 transition-colors"
                      >
                        {w.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function AvailabilityBucket({ tone, title, subtitle, rows, compact }) {
  const toneStyles = {
    red:    { header: 'text-red-300',     border: 'border-red-800/60',     bg: 'bg-red-950/20',     dot: 'bg-red-500' },
    yellow: { header: 'text-yellow-300',  border: 'border-yellow-800/60',  bg: 'bg-yellow-950/20',  dot: 'bg-yellow-500' },
    green:  { header: 'text-emerald-300', border: 'border-emerald-800/60', bg: 'bg-emerald-950/20', dot: 'bg-emerald-500' },
  };
  const s = toneStyles[tone];

  return (
    <div className={`${s.bg} border ${s.border} rounded-lg p-4`}>
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-2 h-2 rounded-full ${s.dot}`} />
        <h4 className={`text-sm font-bold uppercase tracking-wider ${s.header}`}>{title}</h4>
        <span className="ml-auto text-gray-500 text-xs">{rows.length}</span>
      </div>
      <p className="text-gray-600 text-xs mb-3">{subtitle}</p>
      {rows.length === 0 ? (
        <p className="text-gray-600 text-xs italic">—</p>
      ) : compact ? (
        <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
          {rows.map(r => (
            <Link
              key={r.artist.slug}
              to={`/artists/${r.artist.slug}`}
              className="text-xs px-2 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-300 hover:border-emerald-500 hover:text-white transition-colors"
            >
              {r.artist.name}
            </Link>
          ))}
        </div>
      ) : (
        <ul className="space-y-2 max-h-48 overflow-y-auto">
          {rows.map(r => (
            <li key={r.artist.slug}>
              <Link
                to={`/artists/${r.artist.slug}`}
                className="block hover:bg-gray-800/40 rounded px-2 py-1 -mx-2 transition-colors"
              >
                <div className="text-white text-sm font-semibold">{r.artist.name}</div>
                {r.entries && r.entries.length > 0 && (
                  <div className="text-gray-500 text-xs truncate">
                    {r.entries.map(e => [e.venue, e.city].filter(Boolean).join(' · ')).filter(Boolean).join(' / ') || '—'}
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Dashboard() {
  const [kpis, setKpis] = useState([]);
  const [rosterArtists, setRosterArtists] = useState([]);
  const [allShows, setAllShows] = useState([]);
  const [allPipeline, setAllPipeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Urgent issues — loaded from Supabase where resolved=false. Source of truth.
  const [urgentRows, setUrgentRows] = useState([]);
  const [resolving, setResolving] = useState(null); // id currently being resolved

  // Due Today reminders
  const [dueReminders, setDueReminders] = useState([]);
  const [dismissedReminders, setDismissedReminders] = useState(new Set());

  // Quick Notes — localStorage only
  const [notes, setNotes] = useState(() => {
    try { return localStorage.getItem('ccc_quick_notes') || ''; } catch { return ''; }
  });
  const [notesSaved, setNotesSaved] = useState(false);
  function handleNotesChange(val) {
    setNotes(val);
    setNotesSaved(false);
    try { localStorage.setItem('ccc_quick_notes', val); } catch {}
    setNotesSaved(true);
  }

  const artistNameBySlug = useMemo(() => {
    const m = {};
    rosterArtists.forEach(a => { if (a.slug) m[a.slug] = a.name; });
    return m;
  }, [rosterArtists]);
  const urgentIssues = useMemo(
    () => urgentRows.map(r => shapeUrgentIssue(r, artistNameBySlug)),
    [urgentRows, artistNameBySlug]
  );

  useEffect(() => {
    async function load() {
      try {
        const today = new Date().toISOString().split('T')[0];
        const [artistRes, showsRes, pipelineRes, remindersRes, urgentRes] = await Promise.all([
          supabase.from('artists').select('id, name, slug, category'),
          supabase.from('shows').select('artist_slug, fee, deal_type, venue, city, promoter, event_date, notes'),
          supabase.from('pipeline').select('artist_slug, stage, fee_offered, venue, market, buyer, buyer_company, event_date, notes'),
          supabase.from('reminders').select('*').lte('reminder_date', today).eq('completed', false),
          supabase.from('urgent_issues').select('id, artist_slug, issue, priority, resolved, created_at').eq('resolved', false).order('created_at', { ascending: false }),
        ]);

        if (artistRes.error) throw artistRes.error;
        if (showsRes.error) throw showsRes.error;
        if (pipelineRes.error) throw pipelineRes.error;
        if (!remindersRes.error) setDueReminders(remindersRes.data || []);
        if (!urgentRes.error) setUrgentRows(urgentRes.data || []);

        const artists = artistRes.data;
        const shows = showsRes.data;
        const deals = pipelineRes.data;

        // ── KPIs ──────────────────────────────────────────────────────────────
        const totalArtists = artists.length;
        const priorityCount = artists.filter((a) => a.category === 'priority').length;
        const rosterCount = artists.filter((a) => a.category !== 'priority').length;
        const activeDeals = shows.length + deals.length;

        // Commission: sum fees from Confirmed/Contracted/Advancing shows × 15%
        const COMMISSIONABLE_STATUSES = new Set(['Confirmed', 'Contracted', 'Advancing', 'Active', 'Advanced']);
        const commissionableFees = shows.reduce((sum, s) => {
          if (!COMMISSIONABLE_STATUSES.has(s.status)) return sum;
          const n = parseFloat((s.fee || '').replace(/[^0-9.]/g, ''));
          return sum + (isNaN(n) ? 0 : n);
        }, 0);
        const commission = Math.round(commissionableFees * 0.15);

        setKpis([
          { label: 'Roster Artists', value: String(totalArtists), sub: `${priorityCount} priority · ${rosterCount} full roster`, icon: '🎧', color: 'indigo' },
          { label: 'Active Deals', value: String(activeDeals), sub: 'Across all pipeline stages', icon: '📋', color: 'blue' },
          { label: 'Urgent Issues', value: String(urgentIssues.length), sub: 'Require action today', icon: '🚨', color: 'red' },
          { label: 'YTD Commission', value: `$${commission.toLocaleString()}`, sub: `15% of $${commissionableFees.toLocaleString()} confirmed`, icon: '💰', color: 'green' },
        ]);

        // ── AVAILABILITY WIDGET DATA ─────────────────────────────────────────
        setRosterArtists(artists.slice().sort((a, b) => a.name.localeCompare(b.name)));
        setAllShows(shows);
        setAllPipeline(deals);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleResolve(issue) {
    setResolving(issue.id);
    // Optimistic remove — the row disappears from the card immediately
    const before = urgentRows;
    setUrgentRows(prev => prev.filter(r => r.id !== issue.id));
    const { error } = await supabase
      .from('urgent_issues')
      .update({ resolved: true })
      .eq('id', issue.id);
    if (error) {
      // Revert on failure so Danny sees it's not gone
      setUrgentRows(before);
      setError(`Could not resolve issue: ${error.message}`);
    }
    setResolving(null);
  }

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

        {/* ── MASTER TOURING GRID ── */}
        <section className="mb-8">
          <div className="bg-gray-900 rounded-xl border border-gray-800 px-6 py-5 flex items-center justify-between">
            <div>
              <h3 className="text-white font-bold text-base">Master Touring Grid</h3>
              <p className="text-gray-500 text-xs mt-0.5">Full roster schedule — all artists, all dates</p>
            </div>
            <a
              href="https://docs.google.com/spreadsheets/d/1VqKRFNzfQh_bktqZIah6OgV7djWh85LU/edit?usp=sharing"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg border border-emerald-700 text-emerald-400 hover:bg-emerald-700 hover:text-white transition-colors flex-shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m0 0l-6.75-6.75M20.25 12l-6.75 6.75" />
              </svg>
              Open Master Grid
            </a>
          </div>
        </section>

        {/* ── DUE TODAY ── */}
        {dueReminders.filter(r => !dismissedReminders.has(r.id)).length > 0 && (
          <section className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-lg font-bold text-white">Due Today</h3>
              <span className="bg-indigo-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {dueReminders.filter(r => !dismissedReminders.has(r.id)).length}
              </span>
            </div>
            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
              {dueReminders.filter(r => !dismissedReminders.has(r.id)).map((r, i, arr) => (
                <div
                  key={r.id}
                  className={`flex items-start gap-4 px-5 py-4 bg-indigo-950/20 ${i < arr.length - 1 ? 'border-b border-gray-800' : ''}`}
                >
                  <div className="w-1 self-stretch rounded-full flex-shrink-0 bg-indigo-500" />
                  <div className="flex flex-col gap-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-indigo-300 text-xs font-bold uppercase tracking-wider">Reminder</span>
                      <span className="text-white font-bold text-sm">{r.artist_slug}</span>
                    </div>
                    {r.deal_note && <p className="text-gray-400 text-sm leading-relaxed">{r.deal_note}</p>}
                    <p className="text-gray-600 text-xs">Due: {r.reminder_date}</p>
                  </div>
                  <button
                    onClick={async () => {
                      setDismissedReminders(prev => new Set([...prev, r.id]));
                      await supabase.from('reminders').update({ completed: true }).eq('id', r.id);
                    }}
                    className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg border border-indigo-700 text-indigo-400 hover:bg-indigo-700 hover:text-white transition-colors"
                  >
                    Done
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── URGENT ISSUES ── */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-lg font-bold text-white">Urgent Issues</h3>
            {urgentIssues.length > 0 && (
              <span className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {urgentIssues.length}
              </span>
            )}
          </div>

          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            {urgentIssues.length === 0 && (
              <div className="px-5 py-8 text-center">
                <p className="text-emerald-400 text-sm font-semibold">All clear — no urgent issues.</p>
              </div>
            )}
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
                  onClick={() => handleResolve(item)}
                  disabled={resolving === item.id}
                  className={`flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    item.severity === 'red'
                      ? 'border-red-600 text-red-400 hover:bg-red-600 hover:text-white'
                      : 'border-yellow-600 text-yellow-400 hover:bg-yellow-600 hover:text-white'
                  }`}
                >
                  {resolving === item.id ? '…' : 'Resolve'}
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* ── QUICK NOTES ── */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-white">Quick Notes</h3>
            {notesSaved && <span className="text-gray-600 text-xs">Saved</span>}
          </div>
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <textarea
              value={notes}
              onChange={e => handleNotesChange(e.target.value)}
              placeholder="Scratch pad — jot reminders, follow-ups, anything. Saves automatically to this browser."
              rows={5}
              className="w-full bg-transparent text-gray-300 text-sm px-5 py-4 focus:outline-none placeholder-gray-700 resize-none leading-relaxed"
            />
          </div>
        </section>

        {/* ── AVAILABILITY CHECK ── */}
        <AvailabilityWidget
          artists={rosterArtists}
          shows={allShows}
          pipeline={allPipeline}
          loading={loading}
        />

        {/* ── INDUSTRY INTEL (bottom of dashboard) ── */}
        <section className="mt-8">
          <IndustryIntelWidget />
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
        <Route path="/artists/:slug/targets" element={<TargetList />} />
        <Route path="/artists/:slug/grid" element={<TouringGrid />} />
        <Route path="/pipeline" element={<Pipeline />} />
        <Route path="/rolodex" element={<Rolodex />} />
        <Route path="/financials" element={<Financials />} />
        <Route path="/share/:slug" element={<ArtistShare />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
