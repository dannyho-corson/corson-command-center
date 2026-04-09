import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { logActivity } from '../lib/activityLog';
import Nav from '../components/Nav';

// ── ADD DEAL MODAL ────────────────────────────────────────────────────────────
const PIPELINE_STAGES = ['Offer In', 'Negotiating'];
const SHOW_STAGES     = ['Confirmed', 'Contracted', 'Advanced', 'Settled'];
const ALL_STAGES      = [...PIPELINE_STAGES, ...SHOW_STAGES];
const DEAL_TYPES      = ['Club', 'Festival'];

const EMPTY_DEAL = {
  artist_slug: '',
  stage: 'Offer In',
  event_date: '',
  market: '',
  venue: '',
  buyer: '',
  buyer_company: '',
  fee_offered: '',
  fee_target: '',
  deal_type: 'Club',
  hold_number: '',
  next_action: '',
  notes: '',
};

function AddDealModal({ artists, onClose, onAdded }) {
  const [form, setForm] = useState(EMPTY_DEAL);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.artist_slug) { setErr('Artist is required.'); return; }
    setSaving(true); setErr(null);

    // Decide which table based on stage
    const isShowStage = SHOW_STAGES.includes(form.stage);
    let data, error;

    if (isShowStage) {
      const payload = {
        artist_id: artists.find(a => a.slug === form.artist_slug)?.id || null,
        artist_slug: form.artist_slug,
        event_date: form.event_date || null,
        city: form.market || null,
        venue: form.venue || null,
        promoter: form.buyer_company || form.buyer || null,
        fee: form.fee_offered || null,
        deal_type: form.stage,
        status: 'Active',
        notes: form.notes || null,
      };
      ({ data, error } = await supabase.from('shows').insert(payload).select().single());
    } else {
      const payload = {
        artist_slug: form.artist_slug,
        stage: form.stage,
        event_date: form.event_date || null,
        market: form.market || null,
        venue: form.venue || null,
        buyer: form.buyer || null,
        buyer_company: form.buyer_company || null,
        fee_offered: form.fee_offered || null,
        fee_target: form.fee_target || null,
        deal_type: form.deal_type,
        hold_number: form.hold_number ? parseInt(form.hold_number, 10) : null,
        next_action: form.next_action || null,
        notes: form.notes || null,
      };
      ({ data, error } = await supabase.from('pipeline').insert(payload).select().single());
    }

    if (error) { setErr(error.message); setSaving(false); return; }
    onAdded(data, isShowStage ? 'show' : 'pipeline');
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 overflow-y-auto"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-xl shadow-2xl my-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h3 className="text-white font-bold text-lg">Add Deal to Pipeline</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

          {/* Artist + Stage */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">
                Artist <span className="text-red-400">*</span>
              </label>
              <select value={form.artist_slug} onChange={e => set('artist_slug', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500" required>
                <option value="">Select artist…</option>
                {artists.map(a => <option key={a.slug} value={a.slug}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Stage</label>
              <select value={form.stage} onChange={e => set('stage', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500">
                {ALL_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Date + Market */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Event Date</label>
              <input type="date" value={form.event_date} onChange={e => set('event_date', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Market / City</label>
              <input type="text" value={form.market} onChange={e => set('market', e.target.value)}
                placeholder="e.g. Miami, FL"
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
            </div>
          </div>

          {/* Venue */}
          <div>
            <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Venue</label>
            <input type="text" value={form.venue} onChange={e => set('venue', e.target.value)}
              placeholder="e.g. Ground Zero Miami"
              className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
          </div>

          {/* Buyer + Company */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Buyer Contact</label>
              <input type="text" value={form.buyer} onChange={e => set('buyer', e.target.value)}
                placeholder="Name / email"
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
            </div>
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Buyer Company</label>
              <input type="text" value={form.buyer_company} onChange={e => set('buyer_company', e.target.value)}
                placeholder="e.g. Domicile Miami"
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
            </div>
          </div>

          {/* Fee Offered + Fee Target */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Fee Offered</label>
              <input type="text" value={form.fee_offered} onChange={e => set('fee_offered', e.target.value)}
                placeholder="e.g. $2,500"
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
            </div>
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Fee Target</label>
              <input type="text" value={form.fee_target} onChange={e => set('fee_target', e.target.value)}
                placeholder="e.g. $3,000"
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
            </div>
          </div>

          {/* Deal Type + Hold # */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Deal Type</label>
              <select value={form.deal_type} onChange={e => set('deal_type', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500">
                {DEAL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Hold #</label>
              <input type="number" value={form.hold_number} onChange={e => set('hold_number', e.target.value)}
                placeholder="1"
                min="1" max="5"
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
            </div>
          </div>

          {/* Next Action */}
          <div>
            <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Next Action</label>
            <input type="text" value={form.next_action} onChange={e => set('next_action', e.target.value)}
              placeholder="e.g. Follow up with buyer by Thursday"
              className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              placeholder="Any context or deal notes…"
              rows={2}
              className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600 resize-none" />
          </div>

          {err && <p className="text-red-400 text-xs">{err}</p>}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="text-gray-400 hover:text-white text-sm px-4 py-2 rounded-lg border border-gray-700 hover:border-gray-500 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="text-white text-sm font-semibold px-5 py-2 rounded-lg disabled:opacity-60 transition-colors"
              style={{ backgroundColor: '#6366F1' }}>
              {saving ? 'Saving…' : 'Add Deal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

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

// ── PIPELINE STAGES for editing ───────────────────────────────────────────────
const EDIT_STAGES = ['Inquiry', 'Request', 'Offer In', 'Negotiating', 'Confirmed', 'Contracted', 'Advanced', 'Settled'];

// ── SET REMINDER MODAL ────────────────────────────────────────────────────────
function SetReminderModal({ deal, artistName, onClose, onSaved }) {
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(today);
  const [note, setNote] = useState(deal.next_action || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!date) { setErr('Date is required.'); return; }
    setSaving(true); setErr(null);
    const { data, error } = await supabase.from('reminders').insert({
      artist_slug: deal.artist_slug,
      deal_note: note || null,
      reminder_date: date,
      completed: false,
    }).select().single();
    if (error) { setErr(error.message); setSaving(false); return; }
    onSaved(data);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h3 className="text-white font-bold text-base">Set Reminder</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          <p className="text-gray-500 text-xs">{artistName} · {deal.market || deal.city || deal.venue || 'Deal'}</p>
          <div>
            <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Remind me on</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500" required />
          </div>
          <div>
            <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Note</label>
            <textarea value={note} onChange={e => setNote(e.target.value)}
              rows={2} placeholder="What needs to happen…"
              className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600 resize-none" />
          </div>
          {err && <p className="text-red-400 text-xs">{err}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="text-gray-400 text-sm px-4 py-2 rounded-lg border border-gray-700 hover:border-gray-500 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-60"
              style={{ backgroundColor: '#6366F1' }}>
              {saving ? 'Saving…' : 'Save Reminder'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── DEAL DETAIL PANEL ─────────────────────────────────────────────────────────
const PANEL_STAGES = ['Inquiry', 'Request', 'Offer In', 'Negotiating', 'Confirmed', 'Contracted', 'Advanced', 'Settled'];

function DealDetailPanel({ deal, artistNames, onClose, onUpdated }) {
  const artistName = artistNames[deal.artist_slug] || deal.artist_slug;
  const isPipeline = !!deal.stage; // pipeline deals have stage, shows have deal_type

  const [form, setForm] = useState({
    stage:       deal.stage || deal.deal_type || '',
    fee_offered: deal.fee_offered || deal.fee || '',
    next_action: deal.next_action || '',
    notes:       deal.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState(null);
  const [showReminder, setShowReminder] = useState(false);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); setSaved(false); }

  async function handleSave() {
    setSaving(true); setErr(null);
    let error;
    if (isPipeline) {
      ({ error } = await supabase.from('pipeline').update({
        stage:       form.stage,
        fee_offered: form.fee_offered || null,
        next_action: form.next_action || null,
        notes:       form.notes || null,
      }).eq('id', deal.id));
    } else {
      ({ error } = await supabase.from('shows').update({
        deal_type: form.stage,
        fee:       form.fee_offered || null,
        notes:     form.notes || null,
      }).eq('id', deal.id));
    }
    setSaving(false);
    if (error) { setErr(error.message); return; }
    const oldStage = deal.stage || deal.deal_type;
    if (form.stage !== oldStage) {
      const label = deal.venue || deal.market || deal.city || 'Deal';
      logActivity(deal.artist_slug, 'stage_changed', `${label}: ${oldStage} → ${form.stage}`);
    }
    setSaved(true);
    onUpdated({ ...deal, ...form });
  }

  const date = fmtDate(deal.event_date, deal.notes);
  const location = deal.market || deal.city || '—';
  const buyer = deal.buyer_company || deal.buyer || deal.promoter || '—';

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md z-50 bg-gray-900 border-l border-gray-700 shadow-2xl flex flex-col overflow-y-auto"
        style={{ animation: 'slideInRight 0.2s ease-out' }}>
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-800">
          <div>
            <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">{artistName}</p>
            <h3 className="text-white font-bold text-lg leading-tight">
              {deal.venue || location || 'Deal Details'}
            </h3>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-2xl leading-none mt-0.5">×</button>
        </div>

        {/* Read-only details */}
        <div className="px-6 py-4 border-b border-gray-800 grid grid-cols-2 gap-3 text-xs">
          {[
            ['Date', date],
            ['Market', location],
            ['Buyer', buyer],
            ['Hold #', deal.hold_number || '—'],
            ['Deal Type', deal.deal_type || '—'],
          ].map(([label, val]) => (
            <div key={label}>
              <p className="text-gray-600 uppercase tracking-wider mb-0.5">{label}</p>
              <p className="text-gray-300">{val}</p>
            </div>
          ))}
        </div>

        {/* Editable fields */}
        <div className="px-6 py-5 space-y-4 flex-1">
          <div>
            <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Stage</label>
            <select value={form.stage} onChange={e => set('stage', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500">
              {PANEL_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">
              {isPipeline ? 'Fee Offered' : 'Fee'}
            </label>
            <input type="text" value={form.fee_offered} onChange={e => set('fee_offered', e.target.value)}
              placeholder="e.g. $2,500"
              className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
          </div>
          {isPipeline && (
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Next Action</label>
              <input type="text" value={form.next_action} onChange={e => set('next_action', e.target.value)}
                placeholder="e.g. Follow up by Thursday"
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
            </div>
          )}
          <div>
            <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              rows={3}
              className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600 resize-none" />
          </div>

          {err && <p className="text-red-400 text-xs">{err}</p>}
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-gray-800 flex items-center justify-between gap-3">
          <button onClick={() => setShowReminder(true)}
            className="text-indigo-400 text-sm font-semibold px-4 py-2 rounded-lg border border-indigo-700 hover:bg-indigo-900/30 transition-colors">
            Set Reminder
          </button>
          <div className="flex items-center gap-2">
            {saved && <span className="text-emerald-400 text-xs">Saved</span>}
            <button onClick={handleSave} disabled={saving}
              className="text-white text-sm font-semibold px-5 py-2 rounded-lg disabled:opacity-60 transition-colors"
              style={{ backgroundColor: '#6366F1' }}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>

      {/* Reminder sub-modal */}
      {showReminder && (
        <SetReminderModal
          deal={deal}
          artistName={artistName}
          onClose={() => setShowReminder(false)}
          onSaved={() => setShowReminder(false)}
        />
      )}

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </>
  );
}

// ── DEAL CARD ─────────────────────────────────────────────────────────────────
function DealCard({ deal, col, artistNames, onCardClick }) {
  const artistName = artistNames[deal.artist_slug] || deal.artist_slug;
  const date = fmtDate(deal.event_date, deal.notes);
  const location = deal.market || deal.city || '—';
  const fee = deal.fee_offered || deal.fee || '—';
  const buyer = deal.buyer_company || deal.buyer || deal.promoter || '—';

  return (
    <div
      onClick={() => onCardClick(deal)}
      className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-indigo-500/50 hover:bg-gray-800/40 transition-colors cursor-pointer"
    >
      {/* Artist name */}
      <Link
        to={`/artists/${deal.artist_slug}`}
        onClick={e => e.stopPropagation()}
        className="text-white font-bold text-sm hover:text-indigo-300 transition-colors block mb-2"
      >
        {artistName}
      </Link>

      {/* Stage sub-label */}
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

      {/* Click hint */}
      <div className="mt-2 text-gray-700 text-xs">Click to edit →</div>
    </div>
  );
}

// ── KANBAN COLUMN ─────────────────────────────────────────────────────────────
function KanbanColumn({ col, deals, artistNames, onCardClick }) {
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
            <DealCard key={deal.id} deal={deal} col={col} artistNames={artistNames} onCardClick={onCardClick} />
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
  const [showAddDeal, setShowAddDeal] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState(null);

  function handleCardClick(deal) { setSelectedDeal(deal); }

  function handleDealUpdated(updated) {
    if (pipelineDeals.find(d => d.id === updated.id)) {
      setPipelineDeals(prev => prev.map(d => d.id === updated.id ? { ...d, ...updated } : d));
    } else {
      setShows(prev => prev.map(s => s.id === updated.id ? { ...s, ...updated } : s));
    }
    setSelectedDeal(prev => prev && prev.id === updated.id ? { ...prev, ...updated } : prev);
  }

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

          <div className="flex items-center gap-3">
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
            <button
              onClick={() => setShowAddDeal(true)}
              className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg text-white whitespace-nowrap"
              style={{ backgroundColor: '#6366F1' }}
            >
              + Add Deal
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-xl px-5 py-4 mb-6 text-sm">
            Failed to load pipeline: {error}
          </div>
        )}

        {/* ── KANBAN BOARD ── */}
        {showAddDeal && (
          <AddDealModal
            artists={artists}
            onClose={() => setShowAddDeal(false)}
            onAdded={(data, source) => {
              if (source === 'pipeline') {
                setPipelineDeals(prev => [...prev, data].sort((a, b) => (a.event_date || '').localeCompare(b.event_date || '')));
              } else {
                setShows(prev => [...prev, data].sort((a, b) => (a.event_date || '').localeCompare(b.event_date || '')));
              }
            }}
          />
        )}

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
                onCardClick={handleCardClick}
              />
            ))}
          </div>
        )}
      </main>

      {selectedDeal && (
        <DealDetailPanel
          deal={selectedDeal}
          artistNames={artistNames}
          onClose={() => setSelectedDeal(null)}
          onUpdated={handleDealUpdated}
        />
      )}
    </div>
  );
}
