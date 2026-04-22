import { useEffect, useState, useMemo } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { supabase } from '../lib/supabase';

// Campaigns section — sits at the top of the Pipeline page above the kanban.
// Collapsed row of compact status cards by default; clicking a card expands
// it inline to a full editable detail panel. All edits save on blur.
//
// Row rules derived from the daily briefing:
// - emails_sent / bounces / replies / offers are counters — the briefing
//   increments replies/offers when Claude detects a known campaign reply.
// - status: Not Started · Active · Stalled · Complete
//   "Stalled" is computed client-side (Active + no replies, window past
//   halfway, or no recent activity for 30+ days).

const STATUS_OPTIONS = ['Not Started', 'Active', 'Stalled', 'Complete'];

const STATUS_STYLE = {
  'Not Started': { badge: 'bg-gray-800 text-gray-400 border-gray-700',       dot: 'bg-gray-500' },
  Active:        { badge: 'bg-emerald-900 text-emerald-300 border-emerald-700', dot: 'bg-emerald-500' },
  Stalled:       { badge: 'bg-yellow-900 text-yellow-300 border-yellow-700', dot: 'bg-yellow-500' },
  Complete:      { badge: 'bg-blue-900 text-blue-300 border-blue-700',       dot: 'bg-blue-500' },
};

function fmtWindow(c) {
  if (!c.window_start && !c.window_end) return null;
  const fmt = (s) => {
    if (!s) return null;
    const d = new Date(s + 'T00:00:00');
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };
  const a = fmt(c.window_start);
  const b = fmt(c.window_end);
  if (a && b) return a === b ? a : `${a} → ${b}`;
  return a || b;
}

function isStalled(c) {
  if (c.status !== 'Active') return false;
  if ((c.replies || 0) > 0) return false;
  if ((c.emails_sent || 0) === 0) return false;
  // No replies 30+ days since the campaign was last touched
  const ref = new Date(c.updated_at || c.created_at || 0);
  const days = (Date.now() - ref.getTime()) / 86400000;
  return days >= 30;
}

function effectiveStatus(c) { return isStalled(c) ? 'Stalled' : (c.status || 'Not Started'); }

export default function CampaignsSection({ artistNames }) {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [sendModal, setSendModal] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Client-side sort handles missing sort_order gracefully (fallback to
      // created_at). We don't .order() server-side so the page still works
      // before the ALTER TABLE is applied.
      const { data, error } = await supabase.from('campaigns').select('*').order('created_at', { ascending: false });
      if (cancelled) return;
      if (!error) setCampaigns(data || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Campaigns in display order — honors sort_order when set, else newest-first.
  const orderedCampaigns = useMemo(() => {
    return campaigns.slice().sort((a, b) => {
      const ao = a.sort_order ?? Number.POSITIVE_INFINITY;
      const bo = b.sort_order ?? Number.POSITIVE_INFINITY;
      if (ao !== bo) return ao - bo;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
  }, [campaigns]);

  async function handleDragEnd(result) {
    const { source, destination } = result;
    if (!destination) return;
    if (source.index === destination.index) return;

    // Reorder optimistically
    const prev = campaigns;
    const next = orderedCampaigns.slice();
    const [moved] = next.splice(source.index, 1);
    next.splice(destination.index, 0, moved);
    const withNewOrder = next.map((c, i) => ({ ...c, sort_order: i }));
    setCampaigns(withNewOrder);

    // Persist sort_order for each row (bulk upsert on id primary key)
    const updates = withNewOrder.map(c => ({ id: c.id, sort_order: c.sort_order }));
    const { error } = await supabase.from('campaigns').upsert(updates, { onConflict: 'id' });
    if (error) {
      console.error('campaign drag save failed:', error.message);
      setCampaigns(prev); // revert on failure
    }
  }

  const activeCount = useMemo(
    () => orderedCampaigns.filter(c => effectiveStatus(c) === 'Active' || effectiveStatus(c) === 'Stalled').length,
    [orderedCampaigns]
  );

  async function patchCampaign(id, patch) {
    setCampaigns(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
    const { error } = await supabase
      .from('campaigns')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) console.error('campaign update failed:', error.message);
  }

  if (loading) {
    return (
      <section className="mb-6">
        <div className="bg-gray-900 rounded-xl border border-gray-800 animate-pulse h-24" />
      </section>
    );
  }

  if (campaigns.length === 0) {
    return (
      <section className="mb-6 bg-gray-900 rounded-xl border border-gray-800 px-5 py-4 text-sm text-gray-400">
        <div className="font-bold text-white text-xs uppercase tracking-widest mb-1">Active Campaigns</div>
        No campaigns yet. Seed them with <code className="text-emerald-400">node scripts/seed-campaigns.js</code>.
      </section>
    );
  }

  return (
    <section className="mb-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <button
          onClick={() => setCollapsed(v => !v)}
          className="flex items-center gap-2 text-white text-xs font-bold uppercase tracking-widest hover:text-indigo-300 transition-colors"
        >
          <span>{collapsed ? '▸' : '▾'}</span>
          <span>Active Campaigns</span>
          <span className="bg-indigo-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{activeCount}</span>
        </button>
        <span className="text-gray-600 text-xs">· {campaigns.length} total</span>
      </div>

      {/* Collapsed: compact row of cards — draggable horizontally to set priority */}
      {collapsed && (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="campaigns-row" direction="horizontal">
            {(droppableProvided, dropSnapshot) => (
              <div
                ref={droppableProvided.innerRef}
                {...droppableProvided.droppableProps}
                className={`flex gap-3 overflow-x-auto pb-2 rounded-lg transition-colors ${
                  dropSnapshot.isDraggingOver ? 'bg-indigo-950/20' : ''
                }`}
              >
                {orderedCampaigns.map((c, idx) => {
                  const st = effectiveStatus(c);
                  const style = STATUS_STYLE[st] || STATUS_STYLE['Not Started'];
                  const win = fmtWindow(c);
                  const statLine = (c.emails_sent || 0) === 0
                    ? 'Not started'
                    : `${c.emails_sent} sent · ${c.replies || 0} replies${c.offers ? ` · ${c.offers} offers` : ''}`;
                  return (
                    <Draggable key={c.id} draggableId={String(c.id)} index={idx}>
                      {(dragProvided, dragSnapshot) => (
                        <div
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          {...dragProvided.dragHandleProps}
                          style={dragProvided.draggableProps.style}
                          onClick={(e) => {
                            // Suppress the click if a drag just ended
                            if (dragSnapshot.isDragging) return;
                            setCollapsed(false);
                            setExpandedId(c.id);
                          }}
                          className={`flex-shrink-0 min-w-[200px] max-w-[240px] bg-gray-900 border rounded-xl px-4 py-3 text-left transition-all cursor-grab active:cursor-grabbing select-none ${
                            dragSnapshot.isDragging
                              ? 'border-indigo-500 scale-[1.04] shadow-2xl shadow-black/60 ring-1 ring-indigo-500/50'
                              : 'border-gray-800 hover:border-indigo-500/60'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-gray-600 text-[11px] leading-none select-none" title="Drag to reorder">⠿</span>
                            <div className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                            <span className="text-white text-sm font-bold truncate">
                              {(artistNames?.[c.artist_slug] || c.artist_slug).toUpperCase()}
                            </span>
                          </div>
                          <div className="text-gray-300 text-xs truncate">{c.name}</div>
                          <div className="flex items-center gap-2 mt-2">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${style.badge}`}>{st.toUpperCase()}</span>
                            {win && <span className="text-gray-500 text-[10px]">{win}</span>}
                          </div>
                          <div className="text-gray-500 text-[11px] mt-1.5 truncate">{statLine}</div>
                        </div>
                      )}
                    </Draggable>
                  );
                })}
                {droppableProvided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}

      {/* Expanded: vertical list of detail panels — order matches sort_order */}
      {!collapsed && (
        <div className="space-y-3">
          {orderedCampaigns.map(c => (
            <CampaignPanel
              key={c.id}
              campaign={c}
              artistName={artistNames?.[c.artist_slug] || c.artist_slug}
              isOpen={expandedId === c.id}
              onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
              onPatch={(patch) => patchCampaign(c.id, patch)}
              onSendCampaign={() => setSendModal(c)}
            />
          ))}
        </div>
      )}

      {sendModal && (
        <SendCampaignModal campaign={sendModal} artistName={artistNames?.[sendModal.artist_slug] || sendModal.artist_slug} onClose={() => setSendModal(null)} />
      )}
    </section>
  );
}

function CampaignPanel({ campaign: c, artistName, isOpen, onToggle, onPatch, onSendCampaign }) {
  const st = effectiveStatus(c);
  const style = STATUS_STYLE[st] || STATUS_STYLE['Not Started'];
  const replyRate = c.emails_sent > 0 ? Math.round((c.replies / c.emails_sent) * 100) : null;
  const offerRate = c.emails_sent > 0 ? Math.round((c.offers / c.emails_sent) * 100) : null;
  const progressPct = c.target_shows > 0 ? Math.min(100, Math.round((c.offers / c.target_shows) * 100)) : null;

  const [notes, setNotes] = useState(c.notes || '');
  useEffect(() => { setNotes(c.notes || ''); }, [c.notes]);

  return (
    <div className={`bg-gray-900 rounded-xl border overflow-hidden ${isOpen ? 'border-indigo-600/70' : 'border-gray-800'}`}>
      {/* Collapsed header row inside the expanded list view */}
      <button onClick={onToggle} className="w-full px-5 py-3 flex items-center justify-between hover:bg-gray-800/40 transition-colors text-left">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-2 h-2 rounded-full ${style.dot} flex-shrink-0`} />
          <div className="min-w-0">
            <div className="text-white text-base font-bold truncate">
              {artistName.toUpperCase()} <span className="text-gray-500 font-normal">·</span> <span className="font-semibold">{c.name}</span>
            </div>
            <div className="text-gray-500 text-xs mt-0.5">
              {fmtWindow(c) || '(no window set)'}
              {c.market ? ` · ${c.market}` : ''}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${style.badge}`}>{st.toUpperCase()}</span>
          <span className="text-gray-600 text-xs">{isOpen ? '▾' : '▸'}</span>
        </div>
      </button>

      {isOpen && (
        <div className="px-5 pb-5 pt-1 border-t border-gray-800/80">
          {/* Row 1: status + window + market */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4 mb-4">
            <div>
              <label className="block text-gray-500 text-[10px] uppercase tracking-widest mb-1">Status</label>
              <select
                value={c.status || 'Not Started'}
                onChange={e => onPatch({ status: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
              >
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-gray-500 text-[10px] uppercase tracking-widest mb-1">Market</label>
              <input
                defaultValue={c.market || ''}
                onBlur={e => e.target.value !== (c.market || '') && onPatch({ market: e.target.value || null })}
                placeholder="e.g. United States"
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600"
              />
            </div>
            <div>
              <label className="block text-gray-500 text-[10px] uppercase tracking-widest mb-1">Window Start</label>
              <input
                type="date"
                defaultValue={c.window_start || ''}
                onBlur={e => e.target.value !== (c.window_start || '') && onPatch({ window_start: e.target.value || null })}
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-gray-500 text-[10px] uppercase tracking-widest mb-1">Window End</label>
              <input
                type="date"
                defaultValue={c.window_end || ''}
                onBlur={e => e.target.value !== (c.window_end || '') && onPatch({ window_end: e.target.value || null })}
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Row 2: anchor show + target shows */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="md:col-span-2">
              <label className="block text-gray-500 text-[10px] uppercase tracking-widest mb-1">Anchor Show</label>
              <input
                defaultValue={c.anchor_show || ''}
                onBlur={e => e.target.value !== (c.anchor_show || '') && onPatch({ anchor_show: e.target.value || null })}
                placeholder="e.g. Wasteland Sept 5, San Bernardino CA"
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600"
              />
            </div>
            <div>
              <label className="block text-gray-500 text-[10px] uppercase tracking-widest mb-1">Target Shows</label>
              <div className="flex items-center gap-2">
                <StatStepper
                  value={c.target_shows || 0}
                  onChange={(v) => onPatch({ target_shows: Math.max(0, v) })}
                />
              </div>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <StatCard label="Emails Sent" value={c.emails_sent}
              onInc={() => onPatch({ emails_sent: (c.emails_sent || 0) + 1 })}
              onDec={() => onPatch({ emails_sent: Math.max(0, (c.emails_sent || 0) - 1) })} />
            <StatCard label="Bounces" value={c.bounces}
              onInc={() => onPatch({ bounces: (c.bounces || 0) + 1 })}
              onDec={() => onPatch({ bounces: Math.max(0, (c.bounces || 0) - 1) })}
              accent="text-red-300" />
            <StatCard label="Replies" value={c.replies}
              onInc={() => onPatch({ replies: (c.replies || 0) + 1 })}
              onDec={() => onPatch({ replies: Math.max(0, (c.replies || 0) - 1) })}
              accent="text-yellow-300" />
            <StatCard label="Offers" value={c.offers}
              onInc={() => onPatch({ offers: (c.offers || 0) + 1 })}
              onDec={() => onPatch({ offers: Math.max(0, (c.offers || 0) - 1) })}
              accent="text-emerald-300" />
          </div>

          {/* Rates */}
          {replyRate !== null && (
            <div className="flex gap-5 text-xs text-gray-400 mb-4">
              <span>{replyRate}% reply rate</span>
              <span>{offerRate}% offer rate</span>
            </div>
          )}

          {/* Progress bar */}
          {progressPct !== null && (
            <div className="mb-4">
              <div className="flex items-center justify-between text-[11px] text-gray-500 mb-1">
                <span>Offers vs. target</span>
                <span>{c.offers || 0} / {c.target_shows} ({progressPct}%)</span>
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progressPct}%` }} />
              </div>
            </div>
          )}

          {/* Notes */}
          <label className="block text-gray-500 text-[10px] uppercase tracking-widest mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            onBlur={() => { if (notes !== (c.notes || '')) onPatch({ notes: notes || null }); }}
            rows={3}
            placeholder="Outreach strategy, key dates, buyer shortlist…"
            className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600 resize-y leading-relaxed mb-4"
          />

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 pt-1">
            <BuildTargetListLink artistSlug={c.artist_slug} />
            <button
              onClick={onSendCampaign}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white"
              style={{ backgroundColor: '#6366F1' }}
            >
              Send Campaign
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatStepper({ value, onChange }) {
  return (
    <>
      <button onClick={() => onChange(Math.max(0, (value || 0) - 1))}
        className="bg-gray-800 border border-gray-700 text-gray-300 rounded-lg w-8 h-8 hover:border-indigo-500 flex-shrink-0">−</button>
      <input type="number" value={value || 0}
        onChange={e => onChange(parseInt(e.target.value || '0', 10))}
        className="flex-1 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 text-center" />
      <button onClick={() => onChange((value || 0) + 1)}
        className="bg-gray-800 border border-gray-700 text-gray-300 rounded-lg w-8 h-8 hover:border-indigo-500 flex-shrink-0">+</button>
    </>
  );
}

function StatCard({ label, value, onInc, onDec, accent }) {
  return (
    <div className="bg-gray-800/50 border border-gray-800 rounded-lg p-3">
      <div className="text-gray-500 text-[10px] uppercase tracking-wider mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <button onClick={onDec} className="bg-gray-900 text-gray-400 hover:text-white hover:bg-gray-700 rounded w-6 h-6 flex items-center justify-center text-sm leading-none">−</button>
        <span className={`font-bold text-xl tabular-nums flex-1 text-center ${accent || 'text-white'}`}>{value || 0}</span>
        <button onClick={onInc} className="bg-gray-900 text-gray-400 hover:text-white hover:bg-gray-700 rounded w-6 h-6 flex items-center justify-center text-sm leading-none">+</button>
      </div>
    </div>
  );
}

function BuildTargetListLink({ artistSlug }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('artists').select('target_list_url').eq('slug', artistSlug).limit(1);
      if (cancelled) return;
      const tlu = data?.[0]?.target_list_url || null;
      setUrl(tlu);
    })();
    return () => { cancelled = true; };
  }, [artistSlug]);
  if (!url) {
    return <span className="text-xs text-gray-600 italic px-3 py-1.5">No Target List set for this artist</span>;
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-emerald-700 text-emerald-400 hover:bg-emerald-700 hover:text-white transition-colors">
      Build Target List ↗
    </a>
  );
}

function SendCampaignModal({ campaign, artistName, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h3 className="text-white font-bold text-lg">Send Campaign</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
        </div>
        <div className="px-6 py-6 text-gray-300 text-sm space-y-3">
          <p><span className="text-white font-bold">{artistName.toUpperCase()}</span> — <span className="text-gray-400">{campaign.name}</span></p>
          <p className="text-gray-500">Coming soon — the sender will:</p>
          <ul className="list-disc list-inside text-gray-400 text-xs space-y-1 pl-2">
            <li>Pull the artist's Target List from Google Sheets</li>
            <li>Filter contacts by campaign market + status</li>
            <li>Render a personalized HTML body per recipient</li>
            <li>Drive Outlook desktop via AppleScript at 45s intervals (same pattern as scripts/clawz-eu-campaign.sh)</li>
            <li>Increment <code>emails_sent</code> per send</li>
          </ul>
        </div>
        <div className="flex justify-end px-6 pb-5">
          <button onClick={onClose}
            className="text-gray-400 text-sm px-4 py-2 rounded-lg border border-gray-700 hover:border-gray-500 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
