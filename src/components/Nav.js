import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const NAV_LINKS = [
  { to: '/',           label: 'Dashboard' },
  { to: '/artists',    label: 'Artists' },
  { to: '/pipeline',   label: 'Deal Pipeline' },
  { to: '/rolodex',    label: 'Rolodex' },
  { to: '/financials', label: 'Financials' },
];

// ── GLOBAL SEARCH ─────────────────────────────────────────────────────────────
function GlobalSearch({ onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ artists: [], buyers: [], deals: [] });
  const [searching, setSearching] = useState(false);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => { inputRef.current?.focus(); }, []);

  // ESC to close
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults({ artists: [], buyers: [], deals: [] });
      return;
    }
    const q = query.trim();
    const t = setTimeout(async () => {
      setSearching(true);
      const pat = `%${q}%`;
      const [aRes, bRes, pRes] = await Promise.all([
        supabase.from('artists').select('name, slug, genre, base').or(`name.ilike.${pat},genre.ilike.${pat}`).limit(6),
        supabase.from('buyers').select('id, name, company, market, email').or(`name.ilike.${pat},company.ilike.${pat},market.ilike.${pat},email.ilike.${pat}`).limit(6),
        supabase.from('pipeline').select('id, artist_slug, venue, market, stage, buyer_company').or(`venue.ilike.${pat},market.ilike.${pat},buyer_company.ilike.${pat},buyer.ilike.${pat}`).limit(6),
      ]);
      setResults({
        artists: aRes.data || [],
        buyers:  bRes.data || [],
        deals:   pRes.data || [],
      });
      setSearching(false);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  function go(path) { navigate(path); onClose(); }

  const hasResults = results.artists.length > 0 || results.buyers.length > 0 || results.deals.length > 0;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-16 sm:pt-24 px-4 bg-black/80"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden">

        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
          <svg className="w-4 h-4 text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search artists, buyers, deals…"
            className="flex-1 bg-transparent text-white text-sm placeholder-gray-600 focus:outline-none"
          />
          {searching && (
            <span className="text-gray-600 text-xs animate-pulse">Searching…</span>
          )}
          <button
            onClick={onClose}
            className="text-gray-600 text-xs font-semibold px-2 py-1 rounded border border-gray-700 hover:text-gray-400 transition-colors"
          >
            ESC
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {!query.trim() && (
            <p className="px-5 py-10 text-center text-gray-600 text-sm">
              Type to search across artists, buyers, and deals…
            </p>
          )}

          {query.trim() && !searching && !hasResults && (
            <p className="px-5 py-10 text-center text-gray-600 text-sm">
              No results for "<span className="text-gray-500">{query}</span>"
            </p>
          )}

          {/* Artists */}
          {results.artists.length > 0 && (
            <div>
              <p className="px-4 pt-3 pb-1 text-[11px] font-bold text-gray-600 uppercase tracking-widest">Artists</p>
              {results.artists.map(a => (
                <button
                  key={a.slug}
                  onClick={() => go(`/artists/${a.slug}`)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-800 transition-colors text-left"
                >
                  <div className="w-7 h-7 rounded-lg bg-indigo-900/60 border border-indigo-700/40 flex items-center justify-center flex-shrink-0">
                    <span className="text-indigo-300 text-xs font-bold">{a.name[0]}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-semibold truncate">{a.name}</p>
                    <p className="text-gray-500 text-xs truncate">{[a.genre, a.base].filter(Boolean).join(' · ')}</p>
                  </div>
                  <svg className="w-3.5 h-3.5 text-gray-700 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          )}

          {/* Buyers */}
          {results.buyers.length > 0 && (
            <div className={results.artists.length > 0 ? 'border-t border-gray-800/60' : ''}>
              <p className="px-4 pt-3 pb-1 text-[11px] font-bold text-gray-600 uppercase tracking-widest">Buyers</p>
              {results.buyers.map(b => (
                <button
                  key={b.id}
                  onClick={() => go('/rolodex')}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-800 transition-colors text-left"
                >
                  <div className="w-7 h-7 rounded-lg bg-emerald-900/60 border border-emerald-700/40 flex items-center justify-center flex-shrink-0">
                    <span className="text-emerald-300 text-xs font-bold">{b.name[0]}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-semibold truncate">{b.name}</p>
                    <p className="text-gray-500 text-xs truncate">{[b.company, b.market].filter(Boolean).join(' · ')}</p>
                  </div>
                  <svg className="w-3.5 h-3.5 text-gray-700 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          )}

          {/* Deals */}
          {results.deals.length > 0 && (
            <div className={(results.artists.length > 0 || results.buyers.length > 0) ? 'border-t border-gray-800/60' : ''}>
              <p className="px-4 pt-3 pb-1 text-[11px] font-bold text-gray-600 uppercase tracking-widest">Pipeline Deals</p>
              {results.deals.map(d => (
                <button
                  key={d.id}
                  onClick={() => go(d.artist_slug ? `/artists/${d.artist_slug}` : '/pipeline')}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-800 transition-colors text-left"
                >
                  <div className="w-7 h-7 rounded-lg bg-yellow-900/60 border border-yellow-700/40 flex items-center justify-center flex-shrink-0">
                    <span className="text-yellow-300 text-xs font-bold">D</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-semibold truncate">{d.venue || d.market || 'Deal'}</p>
                    <p className="text-gray-500 text-xs truncate">{[d.stage, d.buyer_company, d.market].filter(Boolean).join(' · ')}</p>
                  </div>
                  <svg className="w-3.5 h-3.5 text-gray-700 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          )}

          {/* Bottom padding */}
          {hasResults && <div className="h-2" />}
        </div>
      </div>
    </div>
  );
}

// ── NAV ───────────────────────────────────────────────────────────────────────
export default function Nav() {
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { pathname } = useLocation();
  const [reminderCount, setReminderCount] = useState(0);

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    supabase
      .from('reminders')
      .select('id', { count: 'exact', head: true })
      .lte('reminder_date', today)
      .eq('completed', false)
      .then(({ count }) => { if (count) setReminderCount(count); });
  }, []);

  // Cmd/Ctrl+K to open search
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleClose = useCallback(() => setSearchOpen(false), []);

  function isActive(to) {
    if (to === '/') return pathname === '/';
    return pathname.startsWith(to);
  }

  return (
    <>
      <nav className="bg-gray-900 border-b border-gray-800 px-4 sm:px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">

          {/* Logo + desktop links */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: '#6366F1' }}
              >
                <span className="text-white font-bold text-sm">CC</span>
              </div>
              <div>
                <Link to="/" onClick={() => setOpen(false)}>
                  <h1 className="text-white font-bold text-base sm:text-lg tracking-widest uppercase hover:text-indigo-300 transition-colors leading-tight">
                    Corson Command Center
                  </h1>
                </Link>
                <p className="text-gray-500 text-xs tracking-wide hidden sm:block">
                  Corson Agency · Hard Techno Division
                </p>
              </div>
            </div>

            {/* Desktop nav links */}
            <div className="hidden md:flex items-center gap-1 ml-4">
              {NAV_LINKS.map(({ to, label }) => (
                <Link
                  key={to}
                  to={to}
                  className={`relative text-sm px-3 py-1.5 rounded-lg transition-colors ${
                    isActive(to)
                      ? 'bg-gray-800 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  {label}
                  {to === '/pipeline' && reminderCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center leading-none">
                      {reminderCount > 9 ? '9+' : reminderCount}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>

          {/* Right side: search + avatar + hamburger */}
          <div className="flex items-center gap-3">

            {/* Search button */}
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2 bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600 rounded-lg px-3 py-1.5 text-xs transition-colors"
              title="Search (⌘K)"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span className="hidden sm:inline">Search</span>
              <span className="hidden sm:inline text-gray-600">⌘K</span>
            </button>

            <div className="text-right hidden sm:block">
              <p className="text-white text-sm font-semibold">Danny Ho</p>
              <p className="text-gray-500 text-xs">dho@corsonagency.com</p>
            </div>
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm text-white flex-shrink-0"
              style={{ backgroundColor: '#6366F1' }}
            >
              DH
            </div>

            {/* Hamburger — mobile only */}
            <button
              onClick={() => setOpen(o => !o)}
              className="md:hidden flex flex-col justify-center items-center w-8 h-8 gap-1.5 rounded-lg hover:bg-gray-800 transition-colors"
              aria-label="Toggle menu"
            >
              <span className={`block w-5 h-0.5 bg-gray-400 transition-transform duration-200 ${open ? 'rotate-45 translate-y-2' : ''}`} />
              <span className={`block w-5 h-0.5 bg-gray-400 transition-opacity duration-200 ${open ? 'opacity-0' : ''}`} />
              <span className={`block w-5 h-0.5 bg-gray-400 transition-transform duration-200 ${open ? '-rotate-45 -translate-y-2' : ''}`} />
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {open && (
          <div className="md:hidden mt-3 pb-2 border-t border-gray-800 pt-3 space-y-1">
            {NAV_LINKS.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                onClick={() => setOpen(false)}
                className={`block px-4 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive(to)
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                {label}
              </Link>
            ))}
            <button
              onClick={() => { setOpen(false); setSearchOpen(true); }}
              className="w-full text-left block px-4 py-2.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            >
              Search…
            </button>
            <div className="px-4 pt-2 border-t border-gray-800 mt-2">
              <p className="text-white text-sm font-semibold">Danny Ho</p>
              <p className="text-gray-500 text-xs">dho@corsonagency.com</p>
            </div>
          </div>
        )}
      </nav>

      {/* Global Search Overlay */}
      {searchOpen && <GlobalSearch onClose={handleClose} />}
    </>
  );
}
