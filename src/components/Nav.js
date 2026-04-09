import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const NAV_LINKS = [
  { to: '/',           label: 'Dashboard' },
  { to: '/artists',    label: 'Artists' },
  { to: '/pipeline',   label: 'Pipeline' },
  { to: '/rolodex',    label: 'Rolodex' },
  { to: '/financials', label: 'Financials' },
];

export default function Nav() {
  const [open, setOpen] = useState(false);
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

  function isActive(to) {
    if (to === '/') return pathname === '/';
    return pathname.startsWith(to);
  }

  return (
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

        {/* Right side: avatar + hamburger */}
        <div className="flex items-center gap-3">
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
          <div className="px-4 pt-2 border-t border-gray-800 mt-2">
            <p className="text-white text-sm font-semibold">Danny Ho</p>
            <p className="text-gray-500 text-xs">dho@corsonagency.com</p>
          </div>
        </div>
      )}
    </nav>
  );
}
