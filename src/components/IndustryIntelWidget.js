import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Small dashboard widget showing industry intel:
// — Festivals: IN (Corson booked) vs urgent targets (nobody in yet)
// — Key buyers / agencies / trend headlines
// Populated from the `industry_intel` Supabase table. Run
// sql/briefing_intelligence.sql then scripts/seed-industry-intel.js to fill it.
export default function IndustryIntelWidget() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('industry_intel')
        .select('*')
        .order('priority', { ascending: true });
      if (cancel) return;
      if (error) setError(error.message);
      else setRows(data || []);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, []);

  if (loading) {
    return <div className="bg-gray-900/80 backdrop-blur-sm rounded-2xl shadow-card p-6 border border-gray-800/80 animate-pulse h-48" />;
  }

  if (error) {
    return (
      <div className="bg-gray-900/80 backdrop-blur-sm rounded-2xl shadow-card p-6 border border-gray-800/80 text-sm text-gray-400">
        <div className="font-bold text-white mb-1">Industry Intel</div>
        <div>Run <code className="text-emerald-400">sql/briefing_intelligence.sql</code> in Supabase to enable this widget.</div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="bg-gray-900/80 backdrop-blur-sm rounded-2xl shadow-card p-6 border border-gray-800/80 text-sm text-gray-400">
        <div className="font-bold text-white mb-1">Industry Intel</div>
        <div>No data yet. Run <code className="text-emerald-400">node scripts/seed-industry-intel.js</code> to seed.</div>
      </div>
    );
  }

  const festivalsIn     = rows.filter(r => r.category === 'festival' && r.corson_status === 'in');
  const festivalsTarget = rows.filter(r => r.category === 'festival' && ['target', 'dream'].includes(r.corson_status)).sort((a,b) => (a.priority === 'urgent' ? -1 : 1));
  const buyers          = rows.filter(r => r.category === 'buyer').slice(0, 6);
  const trends          = rows.filter(r => r.category === 'trend').slice(0, 4);

  return (
    <div className="bg-gray-900/80 backdrop-blur-sm rounded-2xl shadow-card border border-gray-800/80 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
        <div>
          <h3 className="text-white font-display font-semibold text-base tracking-tight">Industry Intel</h3>
          <p className="text-gray-500 text-xs mt-0.5">Festival coverage · key buyers · scene pulse</p>
        </div>
        <span className="text-gray-500 text-xs">{rows.length} items</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-gray-800">
        {/* Festivals */}
        <div className="p-5">
          <div className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">Festivals — Corson IN</div>
          <ul className="space-y-1.5 mb-5">
            {festivalsIn.length === 0 && <li className="text-gray-600 text-sm italic">none yet</li>}
            {festivalsIn.map(f => (
              <li key={f.id} className="flex items-start gap-2 text-sm">
                <span className="text-emerald-400 mt-0.5">✓</span>
                <div className="flex-1 min-w-0">
                  <div className="text-white font-medium">{f.name}</div>
                  {(f.event_date || (f.corson_artists?.length)) && (
                    <div className="text-gray-500 text-xs">
                      {f.event_date}
                      {f.corson_artists?.length ? ` · ${f.corson_artists.join(', ')}` : ''}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <div className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">Urgent Targets — No Corson</div>
          <ul className="space-y-1.5">
            {festivalsTarget.length === 0 && <li className="text-gray-600 text-sm italic">none flagged</li>}
            {festivalsTarget.map(f => (
              <li key={f.id} className="flex items-start gap-2 text-sm">
                <span className={f.priority === 'urgent' ? 'text-red-400 mt-0.5' : 'text-yellow-400 mt-0.5'}>
                  {f.priority === 'urgent' ? '⚠' : '◆'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-white font-medium">{f.name}</div>
                  {f.notes && <div className="text-gray-500 text-xs line-clamp-1">{f.notes}</div>}
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Buyers + Trends */}
        <div className="p-5">
          <div className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">Key Buyers — NA</div>
          <ul className="space-y-1.5 mb-5">
            {buyers.length === 0 && <li className="text-gray-600 text-sm italic">none</li>}
            {buyers.map(b => (
              <li key={b.id} className="text-sm">
                <div className="text-white font-medium">{b.name}</div>
                {b.notes && <div className="text-gray-500 text-xs">{b.notes}</div>}
              </li>
            ))}
          </ul>

          <div className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">Scene Pulse</div>
          <ul className="space-y-1.5">
            {trends.length === 0 && <li className="text-gray-600 text-sm italic">none</li>}
            {trends.map(t => (
              <li key={t.id} className="flex items-start gap-2 text-sm">
                <span className="text-blue-400 mt-0.5">→</span>
                <div className="flex-1 min-w-0 text-gray-300">{t.name}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
