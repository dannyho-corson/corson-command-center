import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

// Today's Focus — compact strip between Campaigns and the kanban.
// Derives action items from live Supabase state every time the page loads.
// Dismissals are per-day via localStorage (auto-reset at midnight — a new
// day uses a new key and the old one goes unread).

const MAX_VISIBLE = 5;

function todayKey() {
  return 'corson_focus_dismissed_' + new Date().toISOString().slice(0, 10);
}

function loadDismissed() {
  try { return new Set(JSON.parse(localStorage.getItem(todayKey()) || '[]')); }
  catch { return new Set(); }
}

function saveDismissed(set) {
  try { localStorage.setItem(todayKey(), JSON.stringify([...set])); } catch {}
}

function daysSince(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

function daysUntilDate(iso) {
  if (!iso || typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const t = new Date(iso + 'T00:00:00').getTime();
  if (isNaN(t)) return null;
  return Math.round((t - new Date().setHours(0, 0, 0, 0)) / 86400000);
}

function displayArtist(slug, artistNames) {
  if (!slug) return '—';
  return (artistNames?.[slug] || slug).toUpperCase();
}

export default function TodaysFocus({ artistNames }) {
  const [pipeline, setPipeline] = useState([]);
  const [shows, setShows] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissedState] = useState(() => loadDismissed());
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [pRes, sRes, cRes] = await Promise.all([
        supabase.from('pipeline').select('id, artist_slug, stage, buyer, buyer_company, venue, market, fee_offered, event_date, created_at, updated_at').limit(500),
        supabase.from('shows').select('id, artist_slug, deal_type, city, venue, event_date').in('deal_type', ['Confirmed', 'Advancing']).limit(500),
        supabase.from('campaigns').select('id, artist_slug, name, replies, status').gt('replies', 0).eq('status', 'Active').limit(100),
      ]);
      if (cancelled) return;
      setPipeline(pRes.data || []);
      setShows(sRes.data || []);
      setCampaigns(cRes.data || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  function dismiss(id) {
    const next = new Set(dismissed); next.add(id);
    setDismissedState(next); saveDismissed(next);
  }

  const items = useMemo(() => {
    const out = [];
    const nameOf = (slug) => displayArtist(slug, artistNames);

    // Stale inquiries: Inquiry/Request with 7+ days since last activity
    for (const p of pipeline) {
      const activityAge = daysSince(p.updated_at || p.created_at);
      const buyer = p.buyer_company || p.buyer || 'buyer';
      if (p.stage === 'Inquiry / Request' && activityAge !== null && activityAge >= 7) {
        out.push({
          id: `stale-inq-${p.id}`,
          sort: 10,
          tone: 'red',
          text: `Follow up with ${buyer} re: ${nameOf(p.artist_slug)}`,
          meta: `${activityAge}d stale`,
        });
      }
      if (p.stage === 'Offer In + Negotiating') {
        if (activityAge !== null && activityAge >= 7) {
          out.push({
            id: `stale-off-${p.id}`,
            sort: 5,
            tone: 'red',
            text: `Chase ${buyer} on ${nameOf(p.artist_slug)} offer`,
            meta: `${activityAge}d no response`,
          });
        }
        const newAge = daysSince(p.created_at);
        if (newAge !== null && newAge <= 1) {
          const loc = p.market || p.venue || '';
          const fee = p.fee_offered || '';
          out.push({
            id: `new-off-${p.id}`,
            sort: 1,
            tone: 'green',
            text: `New offer in: ${nameOf(p.artist_slug)}${loc ? ` — ${loc}` : ''}${fee ? ` — ${fee}` : ''}`,
            meta: 'today',
          });
        }
      }
    }

    // Upcoming shows within 14 days
    for (const s of shows) {
      const du = daysUntilDate(s.event_date);
      if (du === null || du < 0 || du > 14) continue;
      out.push({
        id: `show-${s.id}`,
        sort: du, // sooner = lower sort = higher priority
        tone: du <= 3 ? 'red' : du <= 7 ? 'yellow' : 'blue',
        text: `Show in ${du}${du === 1 ? ' day' : ' days'}: ${nameOf(s.artist_slug)}${s.city ? ` — ${s.city}` : ''} ${s.event_date}`,
        meta: s.deal_type,
      });
    }

    // Campaign replies not yet actioned
    for (const c of campaigns) {
      out.push({
        id: `camp-${c.id}`,
        sort: 3,
        tone: 'yellow',
        text: `Reply received: ${c.name} (${c.replies} ${c.replies === 1 ? 'reply' : 'replies'})`,
        meta: nameOf(c.artist_slug),
      });
    }

    out.sort((a, b) => a.sort - b.sort);
    return out.filter(it => !dismissed.has(it.id));
  }, [pipeline, shows, campaigns, dismissed, artistNames]);

  if (loading) {
    return (
      <section className="mb-6">
        <div className="bg-gray-900/60 rounded-xl border border-gray-800 animate-pulse h-14" />
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className="mb-6">
        <div className="bg-gray-900/60 rounded-xl border border-gray-800 px-5 py-4 flex items-center gap-3">
          <span className="text-gray-400 text-xs font-bold uppercase tracking-widest">Today's Focus</span>
          <span className="text-emerald-400 text-sm font-semibold">All clear — nothing urgent today 🤙</span>
        </div>
      </section>
    );
  }

  const visible = showAll ? items : items.slice(0, MAX_VISIBLE);
  const hidden = items.length - visible.length;

  return (
    <section className="mb-6">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-gray-400 text-xs font-bold uppercase tracking-widest">Today's Focus</span>
        <span className="bg-indigo-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{items.length}</span>
      </div>
      <div className="bg-gray-900/60 rounded-xl border border-gray-800 overflow-hidden divide-y divide-gray-800/60">
        {visible.map(it => (
          <FocusRow key={it.id} item={it} onDismiss={() => dismiss(it.id)} />
        ))}
      </div>
      {hidden > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-2 text-indigo-300 hover:text-indigo-200 text-xs font-semibold"
        >
          See all {items.length} →
        </button>
      )}
    </section>
  );
}

function FocusRow({ item, onDismiss }) {
  const toneStyle = {
    red:    'border-l-red-500 bg-red-950/20',
    yellow: 'border-l-yellow-500 bg-yellow-950/15',
    green:  'border-l-emerald-500 bg-emerald-950/15',
    blue:   'border-l-blue-500 bg-blue-950/15',
  }[item.tone] || 'border-l-gray-600 bg-gray-900/30';

  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 border-l-4 ${toneStyle}`}>
      <input
        type="checkbox"
        onChange={onDismiss}
        className="accent-emerald-500 h-4 w-4 cursor-pointer flex-shrink-0"
        title="Mark done for today"
      />
      <div className="flex-1 min-w-0">
        <p className="text-gray-200 text-sm truncate">{item.text}</p>
      </div>
      {item.meta && <span className="text-gray-500 text-[11px] flex-shrink-0">{item.meta}</span>}
    </div>
  );
}
