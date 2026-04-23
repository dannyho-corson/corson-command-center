import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { supabase } from '../lib/supabase';
import { logActivity } from '../lib/activityLog';
import Nav from '../components/Nav';
import ConfirmationEmailModal from '../components/ConfirmationEmailModal';
import OfferForwardEmailModal from '../components/OfferForwardEmailModal';
import CampaignsSection from '../components/CampaignsSection';
import TodaysFocus from '../components/TodaysFocus';
import OfferBin from '../components/OfferBin';

// ── ADD DEAL MODAL ────────────────────────────────────────────────────────────
// Corson 5-stage pipeline:
//   Stage 01 — Inquiry / Request          (pipeline table)
//   Stage 02 — Offer In + Negotiating     (pipeline table)
//   Stage 03 — Confirmed                  (shows table)
//   Stage 04 — Advancing                  (shows table)
//   Stage 05 — Settled                    (shows table)
const PIPELINE_STAGES = ['Inquiry / Request', 'Offer In + Negotiating'];
// Confirmed + Advancing are merged into one kanban column. Dragging a card
// into that column stamps deal_type='Confirmed'; an artist's manager moves
// it to "Advancing" via the detail panel when logistics start.
const SHOW_STAGES     = ['Confirmed', 'Advancing', 'Settled'];
const ALL_STAGES      = [...PIPELINE_STAGES, ...SHOW_STAGES];
const DEAL_TYPES      = ['Club', 'Festival'];

// Offer-structure values for the pipeline.deal_type column (semantic clash
// with shows.deal_type — shows uses it as the stage name)
const OFFER_TYPES = ['TBD', 'Landed', 'All In', 'Fee+Flights'];
const EVENT_TYPES = ['Headline', 'Direct Support', 'Festival Stage', 'B2B', 'Club Night'];

const EMPTY_DEAL = {
  artist_slug: '',
  stage: 'Inquiry / Request',
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
// Column widths reflect where the real work happens: ~30 / ~30 / ~25 / ~15
const COLUMNS = [
  {
    id: 'inquiry',
    label: 'Inquiry / Request',
    stages: ['Inquiry / Request'],
    defaultStageOnDrop: 'Inquiry / Request',
    source: 'pipeline',
    accent: 'border-indigo-600',
    headerBg: 'bg-indigo-900/30',
    headerText: 'text-indigo-300',
    dot: 'bg-indigo-500',
    flex: 6, // ~30%
  },
  {
    id: 'offer',
    label: 'Offer In + Negotiating',
    stages: ['Offer In + Negotiating'],
    defaultStageOnDrop: 'Offer In + Negotiating',
    source: 'pipeline',
    accent: 'border-yellow-600',
    headerBg: 'bg-yellow-900/30',
    headerText: 'text-yellow-300',
    dot: 'bg-yellow-500',
    flex: 6, // ~30%
  },
  {
    id: 'confirmed',
    label: 'Confirmed + Advancing',
    stages: ['Confirmed', 'Advancing'], // merged column
    defaultStageOnDrop: 'Confirmed',     // drops land as Confirmed; detail panel escalates to Advancing
    source: 'shows',
    accent: 'border-teal-500',
    headerBg: 'bg-teal-900/30',
    headerText: 'text-teal-300',
    dot: 'bg-teal-500',
    flex: 5, // ~25%
  },
  {
    id: 'settled',
    label: 'Settled',
    stages: ['Settled'],
    defaultStageOnDrop: 'Settled',
    source: 'shows',
    accent: 'border-gray-500',
    headerBg: 'bg-gray-800/50',
    headerText: 'text-gray-400',
    dot: 'bg-gray-500',
    flex: 3, // ~15%
  },
];

// ── HELPERS ───────────────────────────────────────────────────────────────────
// ── CARD DISPLAY HELPERS ──────────────────────────────────────────────────────
// Auto-imported briefing rows stamp notes as "Auto-extracted YYYY-MM-DD: <subject>".
// That's noise on the card face — detect and strip/replace.
function isAutoExtractedNotes(notes) {
  return typeof notes === 'string' && /^Auto-extracted \d{4}-\d{2}-\d{2}:/i.test(notes);
}
function cleanNotes(notes) {
  if (!notes) return '';
  if (isAutoExtractedNotes(notes)) return ''; // hide the auto-extracted prefix — user types real notes here
  return notes;
}

function fmtDealDate(eventDate) {
  if (!eventDate) return 'Date TBD';
  // Reject values that aren't YYYY-MM-DD; don't try to second-guess free-text dates
  if (typeof eventDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return 'Date TBD';
  const d = new Date(eventDate + 'T00:00:00');
  if (isNaN(d.getTime())) return 'Date TBD';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function daysUntil(eventDate) {
  if (!eventDate || typeof eventDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return null;
  const d = new Date(eventDate + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  const diffMs = d.getTime() - new Date().setHours(0, 0, 0, 0);
  const days = Math.round(diffMs / 86400000);
  return days;
}

function countdownLabel(days) {
  if (days === null || days === undefined) return null;
  if (days < 0) return `${Math.abs(days)}d ago`;
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 14) return `in ${days} days`;
  if (days < 60) return `in ${Math.round(days / 7)} weeks`;
  return `in ${Math.round(days / 30)} months`;
}

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
const PANEL_STAGES = ['Inquiry / Request', 'Offer In + Negotiating', 'Confirmed', 'Advancing', 'Settled'];

function DealDetailPanel({ deal, artistNames, onClose, onUpdated }) {
  const artistName = artistNames[deal.artist_slug] || deal.artist_slug;
  const isPipeline = !!deal.stage; // pipeline deals have stage, shows have deal_type

  const [form, setForm] = useState({
    stage:           deal.stage || deal.deal_type || '',
    fee_offered:     deal.fee_offered || deal.fee || '',
    next_action:     deal.next_action || '',
    notes:           deal.notes || '',
    // HGR + deal-structure (pipeline only — columns don't exist on shows)
    deal_type:       !!deal.stage ? (deal.deal_type || '') : '',
    event_type:      deal.event_type || '',
    capacity:        deal.capacity || '',
    hotel_included:  !!deal.hotel_included,
    ground_included: !!deal.ground_included,
    rider_included:  !!deal.rider_included,
    bonus_structure: deal.bonus_structure || '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState(null);
  const [showReminder, setShowReminder] = useState(false);
  const [showConfirmEmail, setShowConfirmEmail] = useState(false);
  const [showForwardEmail, setShowForwardEmail] = useState(false);

  const isConfirmedOrLater = SHOW_STAGES.includes(form.stage);
  const isOfferIn = form.stage === 'Offer In + Negotiating';

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); setSaved(false); }

  async function handleSave() {
    setSaving(true); setErr(null);
    let error;
    if (isPipeline) {
      ({ error } = await supabase.from('pipeline').update({
        stage:           form.stage,
        fee_offered:     form.fee_offered || null,
        next_action:     form.next_action || null,
        notes:           form.notes || null,
        deal_type:       form.deal_type || null,
        event_type:      form.event_type || null,
        capacity:        form.capacity === '' ? null : parseInt(form.capacity, 10) || null,
        hotel_included:  !!form.hotel_included,
        ground_included: !!form.ground_included,
        rider_included:  !!form.rider_included,
        bonus_structure: form.bonus_structure || null,
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

  const date = fmtDealDate(deal.event_date);
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
            <>
              <div>
                <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Next Action</label>
                <input type="text" value={form.next_action} onChange={e => set('next_action', e.target.value)}
                  placeholder="e.g. Follow up by Thursday"
                  className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Offer Structure</label>
                  <select value={form.deal_type} onChange={e => set('deal_type', e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500">
                    <option value="">—</option>
                    {OFFER_TYPES.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Event Type</label>
                  <select value={form.event_type} onChange={e => set('event_type', e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500">
                    <option value="">—</option>
                    {EVENT_TYPES.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Capacity</label>
                  <input type="number" value={form.capacity} onChange={e => set('capacity', e.target.value)}
                    placeholder="e.g. 800"
                    className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
                </div>
                <div>
                  <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Bonus Structure</label>
                  <input type="text" value={form.bonus_structure} onChange={e => set('bonus_structure', e.target.value)}
                    placeholder="e.g. +$500 at 400 tix"
                    className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
                </div>
              </div>

              <div>
                <span className="block text-gray-500 text-xs uppercase tracking-wider mb-2">HGR Included</span>
                <div className="flex items-center gap-4 text-sm text-gray-300">
                  {[
                    ['hotel_included',  'Hotel'],
                    ['ground_included', 'Ground'],
                    ['rider_included',  'Rider'],
                  ].map(([k, label]) => (
                    <label key={k} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={!!form[k]} onChange={e => set(k, e.target.checked)}
                        className="accent-emerald-500 h-4 w-4" />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </>
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
        <div className="px-6 py-4 border-t border-gray-800 flex flex-col gap-2">
          {isConfirmedOrLater && (
            <button onClick={() => setShowConfirmEmail(true)}
              className="w-full text-emerald-300 text-sm font-semibold px-4 py-2 rounded-lg border border-emerald-700 bg-emerald-900/20 hover:bg-emerald-900/40 transition-colors">
              ✉ Draft Confirmation Email
            </button>
          )}
          {isOfferIn && (
            <button onClick={() => setShowForwardEmail(true)}
              className="w-full text-emerald-300 text-sm font-semibold px-4 py-2 rounded-lg border border-emerald-700 bg-emerald-900/20 hover:bg-emerald-900/40 transition-colors">
              ✉ Draft Forward Email
            </button>
          )}
          <div className="flex items-center justify-between gap-3">
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

      {/* Confirmation email modal */}
      {showConfirmEmail && (
        <ConfirmationEmailModal
          deal={deal}
          artistDisplayName={artistName}
          onClose={() => setShowConfirmEmail(false)}
        />
      )}

      {/* Offer forward email modal */}
      {showForwardEmail && (
        <OfferForwardEmailModal
          deal={deal}
          artistDisplayName={artistName}
          onClose={() => setShowForwardEmail(false)}
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
// Stage-specific body content dispatched from a shared wrapper (Draggable
// shell, drag handle, artist link, Quick Notes for active stages).
function daysSince(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function HGRSummary({ deal }) {
  const bits = [
    { label: 'Hotel',  v: deal.hotel_included },
    { label: 'Ground', v: deal.ground_included },
    { label: 'Rider',  v: deal.rider_included },
  ];
  const anySet = bits.some(b => b.v !== null && b.v !== undefined);
  if (!anySet) return null;
  return (
    <div className="text-[11px] text-gray-400 mt-2">
      {bits.map(b => (
        <span key={b.label} className="mr-2">
          {b.label} <span className={b.v ? 'text-emerald-400' : 'text-gray-600'}>{b.v ? '✅' : '❌'}</span>
        </span>
      ))}
    </div>
  );
}

function DealCard({ deal, col, artistNames, onCardClick, dragProvided, dragSnapshot }) {
  const artistName = artistNames[deal.artist_slug] || deal.artist_slug;
  const tableName = deal._source || (deal.stage ? 'pipeline' : 'shows');
  const stage = deal.stage || deal.deal_type;

  const [notes, setNotes] = useState(cleanNotes(deal.notes));
  const [saveStatus, setSaveStatus] = useState(null);
  useEffect(() => { setNotes(cleanNotes(deal.notes)); }, [deal.notes, deal.id]);

  async function persistNotes() {
    const current = notes || null;
    const prior = isAutoExtractedNotes(deal.notes) ? null : (deal.notes || null);
    if (current === prior) return;
    setSaveStatus('saving');
    const { error } = await supabase.from(tableName).update({ notes: current }).eq('id', deal.id);
    if (error) { setSaveStatus('error'); return; }
    deal.notes = current;
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus(null), 1500);
  }

  // Stale indicator: pipeline row with no activity in 7+ days → red border
  const daysSinceActivity = daysSince(deal.updated_at || deal.created_at);
  const isWorkingStage = col.id === 'inquiry' || col.id === 'offer';
  const isStale = isWorkingStage && daysSinceActivity !== null && daysSinceActivity >= 7;

  const dragStyle = dragSnapshot?.isDragging
    ? 'scale-[1.02] shadow-2xl shadow-black/60 ring-1 ring-indigo-500/60'
    : '';
  const borderClass = isStale
    ? 'border-red-600/70 ring-1 ring-red-600/40'
    : 'border-gray-800';

  return (
    <div
      ref={dragProvided?.innerRef}
      {...(dragProvided?.draggableProps || {})}
      style={dragProvided?.draggableProps?.style}
      onClick={() => onCardClick(deal)}
      className={`bg-gray-900 border ${borderClass} rounded-xl p-4 hover:border-indigo-500/50 hover:bg-gray-800/40 transition-transform transition-colors cursor-pointer ${dragStyle}`}
    >
      <div className="flex items-start gap-2 mb-2">
        <span
          {...(dragProvided?.dragHandleProps || {})}
          onClick={e => e.stopPropagation()}
          className="text-gray-600 hover:text-gray-400 cursor-grab active:cursor-grabbing text-base select-none"
          title="Drag to reorder or change stage"
        >⠿</span>
        <Link
          to={`/artists/${deal.artist_slug}`}
          onClick={e => e.stopPropagation()}
          className="text-white font-bold text-base hover:text-indigo-300 transition-colors flex-1 min-w-0 truncate"
        >
          {artistName}
        </Link>
      </div>

      {stage && (
        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded border inline-block mb-3 ${col.headerBg} ${col.headerText} border-current/30`}>
          {stage}
        </span>
      )}

      {/* Stage-specific body */}
      {col.id === 'inquiry'   && <InquiryBody   deal={deal} daysSinceActivity={daysSinceActivity} />}
      {col.id === 'offer'     && <OfferBody     deal={deal} daysSinceActivity={daysSinceActivity} />}
      {col.id === 'confirmed' && <ConfirmedBody deal={deal} />}
      {col.id === 'settled'   && <SettledBody   deal={deal} />}

      {/* Quick Notes — on all cards */}
      <div className="mt-3 pt-3 border-t border-gray-800" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-gray-600 text-[10px] uppercase tracking-wider font-semibold">Quick Notes</span>
          {saveStatus === 'saving' && <span className="text-gray-500 text-[10px]">saving…</span>}
          {saveStatus === 'saved' && <span className="text-emerald-400 text-[10px]">✓ saved</span>}
          {saveStatus === 'error' && <span className="text-red-400 text-[10px]">save failed</span>}
        </div>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          onBlur={persistNotes}
          onMouseDown={e => e.stopPropagation()}
          placeholder="Jot a quick thought…"
          rows={2}
          className="w-full bg-gray-950 border border-gray-800 hover:border-gray-700 focus:border-indigo-600 text-gray-300 text-xs rounded-md px-2 py-1.5 resize-none focus:outline-none placeholder-gray-700"
        />
      </div>
    </div>
  );
}

function InquiryBody({ deal, daysSinceActivity }) {
  const city = deal.market || deal.city || '';
  const date = fmtDealDate(deal.event_date);
  const buyer = deal.buyer_company || deal.buyer || deal.promoter || '';
  return (
    <div className="space-y-1.5 text-xs">
      {city && <div><span className="text-gray-600 mr-2">City</span><span className="text-gray-300">{city}</span></div>}
      <div><span className="text-gray-600 mr-2">Req</span>
        <span className={date === 'Date TBD' ? 'text-gray-600 italic' : 'text-gray-300'}>{date}</span>
      </div>
      {deal.event_type && <div><span className="text-gray-600 mr-2">Type</span><span className="text-gray-300">{deal.event_type}</span></div>}
      {buyer && <div><span className="text-gray-600 mr-2">Buyer</span><span className="text-gray-300">{buyer}</span></div>}
      {daysSinceActivity !== null && (
        <div className="text-[11px] text-gray-500 pt-1">{daysSinceActivity}d since inquiry</div>
      )}
    </div>
  );
}

function OfferBody({ deal, daysSinceActivity }) {
  const city = deal.market || deal.city || '';
  const venue = deal.venue || '';
  const date = fmtDealDate(deal.event_date);
  const countdown = countdownLabel(daysUntil(deal.event_date));
  const buyer = deal.buyer_company || deal.buyer || deal.promoter || '';
  const fee = deal.fee_offered || deal.fee || '';
  const walkout = deal.walkout_potential;
  const age = deal.age_restriction;
  const radius = deal.radius_clause;
  const email = deal.buyer_email;

  return (
    <div className="space-y-1.5 text-xs">
      <div>
        <span className="text-gray-600 mr-2">Date</span>
        <span className={date === 'Date TBD' ? 'text-gray-600 italic' : 'text-gray-300'}>{date}</span>
        {countdown && <span className="ml-2 text-gray-500">· {countdown}</span>}
      </div>
      {(city || venue) && (
        <div>
          <span className="text-gray-600 mr-2">Where</span>
          <span className="text-gray-300 truncate">{[city, venue].filter(Boolean).join(' · ')}</span>
        </div>
      )}
      {buyer && <div><span className="text-gray-600 mr-2">Buyer</span><span className="text-gray-300">{buyer}</span></div>}
      {email && (
        <div><span className="text-gray-600 mr-2">Email</span>
          <a href={`mailto:${email}`} onClick={e => e.stopPropagation()}
            className="text-indigo-300 hover:text-indigo-200 underline underline-offset-2 truncate">{email}</a>
        </div>
      )}
      {(deal.capacity || age) && (
        <div className="flex items-center gap-3">
          {deal.capacity && <span><span className="text-gray-600 mr-1">Cap</span><span className="text-gray-300">{deal.capacity}</span></span>}
          {age && (
            <span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded border border-gray-700 text-gray-300">
              {age}
            </span>
          )}
        </div>
      )}

      {fee && (
        <div className="pt-2 flex items-center gap-2 flex-wrap">
          <span className="text-emerald-400 font-bold text-lg">{fee}</span>
          {Number.isFinite(Number(walkout)) && Number(walkout) > 0 && (
            <span className="text-[11px] text-emerald-300/80">/ walkout ~{walkout}</span>
          )}
          {deal.deal_type && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-gray-700 text-gray-300">
              {deal.deal_type}
            </span>
          )}
        </div>
      )}
      <HGRSummary deal={deal} />

      {radius && (
        <div className="mt-2 text-[11px] text-red-300 bg-red-950/30 border border-red-900/60 rounded px-2 py-1 line-clamp-2">
          ⚠ Radius: {radius}
        </div>
      )}

      {daysSinceActivity !== null && (
        <div className="text-[11px] text-gray-500 pt-1">{daysSinceActivity}d since last activity</div>
      )}
    </div>
  );
}

function ConfirmedBody({ deal }) {
  const city = deal.market || deal.city || '';
  const venue = deal.venue || '';
  const date = fmtDealDate(deal.event_date);
  const days = daysUntil(deal.event_date);
  const countdown = countdownLabel(days);
  const promoter = deal.promoter || deal.buyer_company || deal.buyer || '';
  const fee = deal.fee || deal.fee_offered || '';
  const showWeek = days !== null && days >= 0 && days <= 7;
  const statusLabel = showWeek ? 'Show Week' : (deal.deal_type === 'Advancing' ? 'Advancing' : 'Confirmed');
  return (
    <div className="space-y-1.5 text-xs">
      <div>
        <span className="text-gray-600 mr-2">Date</span>
        <span className={date === 'Date TBD' ? 'text-gray-600 italic' : 'text-gray-300'}>{date}</span>
        {countdown && <span className={`ml-2 ${showWeek ? 'text-red-400 font-semibold' : 'text-gray-500'}`}>· {countdown}</span>}
      </div>
      {(city || venue) && (
        <div>
          <span className="text-gray-600 mr-2">Where</span>
          <span className="text-gray-300 truncate">{[city, venue].filter(Boolean).join(' · ')}</span>
        </div>
      )}
      {promoter && <div><span className="text-gray-600 mr-2">Promo</span><span className="text-gray-300 truncate">{promoter}</span></div>}
      {fee && <div className="text-emerald-400 font-bold pt-1">{fee}</div>}
      <div className="text-[10px] font-semibold uppercase tracking-wider mt-1">
        <span className={showWeek ? 'text-red-400' : 'text-teal-300'}>{statusLabel}</span>
      </div>
    </div>
  );
}

function SettledBody({ deal }) {
  const city = deal.market || deal.city || '';
  const venue = deal.venue || '';
  const date = fmtDealDate(deal.event_date);
  const fee = deal.fee || deal.fee_offered || '';
  return (
    <div className="space-y-1.5 text-xs">
      <div><span className="text-gray-600 mr-2">Date</span><span className="text-gray-400">{date}</span></div>
      {(city || venue) && (
        <div><span className="text-gray-600 mr-2">Where</span><span className="text-gray-400 truncate">{[city, venue].filter(Boolean).join(' · ')}</span></div>
      )}
      {fee && <div className="text-gray-300">{fee}</div>}
      <span className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-800 text-gray-500 mt-1">SETTLED</span>
    </div>
  );
}

// ── KANBAN COLUMN ─────────────────────────────────────────────────────────────
function KanbanColumn({ col, deals, artistNames, onCardClick }) {
  return (
    <Droppable droppableId={col.id}>
      {(droppableProvided, dropSnapshot) => (
        <div
          ref={droppableProvided.innerRef}
          {...droppableProvided.droppableProps}
          style={{ flex: col.flex || 1 }}
          className={`min-w-[240px] flex flex-col rounded-xl border-t-2 ${col.accent} bg-gray-900/50 transition-colors ${
            dropSnapshot.isDraggingOver ? 'ring-2 ring-indigo-500/50 bg-gray-900/80' : ''
          }`}
        >
          <div className={`px-4 py-3 rounded-t-xl flex items-center justify-between ${col.headerBg}`}>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${col.dot}`} />
              <span className={`text-sm font-bold uppercase tracking-wider ${col.headerText}`}>{col.label}</span>
            </div>
            <span className="text-gray-500 text-xs font-semibold bg-gray-800 px-2 py-0.5 rounded-full">
              {deals.length}
            </span>
          </div>

          <div className="p-3 flex flex-col gap-3 flex-1">
            {deals.length === 0 && !dropSnapshot.isDraggingOver ? (
              <div className="text-gray-700 text-xs text-center py-6 border border-dashed border-gray-800 rounded-lg">
                No deals
              </div>
            ) : (
              deals.map((deal, idx) => (
                <Draggable key={deal.id} draggableId={String(deal.id)} index={idx}>
                  {(dragProvided, dragSnapshot) => (
                    <DealCard
                      deal={deal}
                      col={col}
                      artistNames={artistNames}
                      onCardClick={onCardClick}
                      dragProvided={dragProvided}
                      dragSnapshot={dragSnapshot}
                    />
                  )}
                </Draggable>
              ))
            )}
            {droppableProvided.placeholder}
          </div>
        </div>
      )}
    </Droppable>
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

  // ── DRAG AND DROP ────────────────────────────────────────────────────────
  async function handleDragEnd(result) {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const srcCol = COLUMNS.find(c => c.id === source.droppableId);
    const dstCol = COLUMNS.find(c => c.id === destination.droppableId);
    if (!srcCol || !dstCol) return;

    const srcTable = srcCol.source;   // 'pipeline' | 'shows'
    const dstTable = dstCol.source;
    const newStage = dstCol.defaultStageOnDrop || dstCol.stages[0];

    // Find the moving deal
    const srcList = srcTable === 'pipeline' ? pipelineDeals : shows;
    const moving  = srcList.find(d => String(d.id) === draggableId);
    if (!moving) return;

    // Snapshot for rollback
    const beforeP = pipelineDeals;
    const beforeS = shows;

    // Build updated destination list (optimistically)
    const destListAll = dstTable === 'pipeline' ? pipelineDeals : shows;
    const destColDeals = destListAll
      .filter(d => dstCol.stages.includes(d.stage) || dstCol.stages.includes(d.deal_type))
      .filter(d => String(d.id) !== draggableId);
    const movedShaped = dstTable === 'pipeline'
      ? { ...moving, stage: newStage, deal_type: null, _source: 'pipeline' }
      : { ...moving, stage: null, deal_type: newStage, _source: 'shows' };
    destColDeals.splice(destination.index, 0, movedShaped);

    // Optimistic local update
    if (srcTable === dstTable) {
      const otherDeals = destListAll.filter(d =>
        !dstCol.stages.includes(d.stage) &&
        !dstCol.stages.includes(d.deal_type) &&
        String(d.id) !== draggableId
      );
      const nextAll = [...otherDeals, ...destColDeals.map((d, i) => ({ ...d, sort_order: i }))];
      if (srcTable === 'pipeline') setPipelineDeals(nextAll); else setShows(nextAll);
    } else {
      // Cross-table: remove from source list, add to dest list
      const srcOther = srcList.filter(d => String(d.id) !== draggableId);
      const dstOther = destListAll.filter(d =>
        !dstCol.stages.includes(d.stage) &&
        !dstCol.stages.includes(d.deal_type)
      );
      const dstNext = [...dstOther, ...destColDeals.map((d, i) => ({ ...d, sort_order: i }))];
      if (srcTable === 'pipeline') { setPipelineDeals(srcOther); setShows(dstNext); }
      else                         { setShows(srcOther); setPipelineDeals(dstNext); }
    }

    // Persist
    try {
      if (srcTable === dstTable) {
        // Same-table — UPDATE the moved row (stage if cross-column, always sort_order)
        // Plus reindex sort_order for all cards in the destination column.
        const updates = destColDeals.map((d, i) => ({
          id: d.id,
          sort_order: i,
          ...(srcTable === 'pipeline' ? { stage: newStage } : { deal_type: newStage }),
        }));
        // Supabase upsert by primary key (id is PK)
        const { error } = await supabase.from(srcTable).upsert(updates, { onConflict: 'id' });
        if (error) throw error;
      } else {
        // Cross-table — DELETE from source, INSERT into destination table.
        // The new row gets a new id.
        const payload = { ...moving };
        delete payload.id;
        delete payload.created_at;
        delete payload._source;
        if (dstTable === 'pipeline') {
          payload.stage = newStage;
          delete payload.deal_type;
          delete payload.status; // shows.status isn't on pipeline schema
          delete payload.hold_number;
        } else {
          payload.deal_type = newStage;
          payload.status = newStage;
          delete payload.stage;
          delete payload.fee_offered; delete payload.fee_target;
          if (moving.fee_offered && !moving.fee) payload.fee = moving.fee_offered;
          delete payload.next_action; delete payload.manager_cc;
          delete payload.buyer_company; delete payload.buyer;
          if (!payload.promoter) payload.promoter = moving.buyer_company || moving.buyer || null;
          delete payload.market;
          if (!payload.city) payload.city = moving.market || null;
        }
        payload.sort_order = destination.index;

        const { data: inserted, error: insErr } = await supabase.from(dstTable).insert(payload).select().single();
        if (insErr) throw insErr;
        const { error: delErr } = await supabase.from(srcTable).delete().eq('id', moving.id);
        if (delErr) { /* best-effort — log but don't rollback the successful insert */ console.error('dst insert ok, src delete failed:', delErr.message); }

        // Patch local state: swap the temporary shaped row for the real inserted row
        const swap = (list) => list.map(d => d.id === moving.id ? { ...inserted, _source: dstTable } : d);
        if (dstTable === 'pipeline') setPipelineDeals(prev => swap(prev));
        else setShows(prev => swap(prev));

        // Reindex the destination column (bulk)
        const destColFinal = destColDeals.map((d, i) => ({
          id: d.id === moving.id ? inserted.id : d.id,
          sort_order: i,
        }));
        await supabase.from(dstTable).upsert(destColFinal, { onConflict: 'id' });
      }
    } catch (err) {
      // Roll back — restore previous local state so the user sees the failure
      setPipelineDeals(beforeP);
      setShows(beforeS);
      setError(`Drag save failed: ${err.message || err}`);
    }
  }

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
        // Client-side sort in columnDeals() uses sort_order if present, falling
        // back to created_at — so we just load raw rows here. (Server-side
        // .order('sort_order') would throw before the migration is applied.)
        const [pRes, sRes, aRes] = await Promise.all([
          supabase.from('pipeline').select('*').order('created_at', { ascending: false }),
          supabase.from('shows').select('*').order('created_at', { ascending: false }),
          supabase.from('artists').select('id, name, slug').order('name'),
        ]);
        if (pRes.error) throw pRes.error;
        if (sRes.error) throw sRes.error;
        if (aRes.error) throw aRes.error;

        setPipelineDeals((pRes.data || []).map(d => ({ ...d, _source: 'pipeline' })));
        setShows((sRes.data || []).map(d => ({ ...d, _source: 'shows' })));
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

  // Assign each deal to its kanban column, sorted by sort_order ASC
  // (ties break newest-first so briefing inserts with sort_order=0 land on top)
  const columnDeals = useMemo(() => {
    const byOrder = (a, b) => {
      const ao = a.sort_order ?? 0, bo = b.sort_order ?? 0;
      if (ao !== bo) return ao - bo;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    };
    return COLUMNS.map((col) => {
      let deals = [];
      if (col.source === 'pipeline') {
        deals = filteredPipeline.filter((d) => col.stages.includes(d.stage)).slice().sort(byOrder);
      } else {
        deals = filteredShows.filter((s) => col.stages.includes(s.deal_type)).slice().sort(byOrder);
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
          <span className="text-gray-300">Deal Pipeline</span>
        </div>
      </div>

      <main className="px-6 py-6">

        {/* ── HEADER + FILTER ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white">Deal Pipeline Board</h2>
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

        {/* ── CAMPAIGNS (above the kanban) ── */}
        <CampaignsSection artistNames={artistNames} />

        {/* ── TODAY'S FOCUS ── */}
        <TodaysFocus artistNames={artistNames} />

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
          <DragDropContext onDragEnd={handleDragEnd}>
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
          </DragDropContext>
        )}

        {/* ── OFFER BIN — PDF/DOCX offer ingest ── */}
        <OfferBin />
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
