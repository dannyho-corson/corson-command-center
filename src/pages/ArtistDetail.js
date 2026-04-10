import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { logActivity } from '../lib/activityLog';
import Nav from '../components/Nav';

// ── RELATIVE TIME ─────────────────────────────────────────────────────────────
function relativeTime(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const ACTION_ICON = {
  show_added:    { icon: '🎤', color: 'text-emerald-400' },
  deal_added:    { icon: '📋', color: 'text-yellow-400' },
  stage_changed: { icon: '🔄', color: 'text-indigo-400' },
};

function ActivityEntry({ entry }) {
  const { icon, color } = ACTION_ICON[entry.action] || { icon: '•', color: 'text-gray-400' };
  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-800 last:border-0">
      <span className={`text-base flex-shrink-0 ${color}`}>{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-gray-300 text-sm leading-snug">{entry.description}</p>
      </div>
      <span className="text-gray-600 text-xs flex-shrink-0 whitespace-nowrap">{relativeTime(entry.created_at)}</span>
    </div>
  );
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function parseFee(feeStr) {
  if (!feeStr) return 0;
  const nums = feeStr.replace(/[^0-9,]/g, ' ').trim().split(/\s+/);
  const n = parseFloat((nums[0] || '').replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

function formatUSD(n) {
  if (!n) return '—';
  return '$' + n.toLocaleString();
}

// Format stored ISO date "2026-07-04" or notes field for display
function fmtDate(row) {
  // The seed stores original display string in notes like "Jul 4, 2026"
  // Fall back to formatting the ISO date
  if (row.notes && /^[A-Z][a-z]/.test(row.notes)) {
    const display = row.notes.split(' — ')[0];
    if (display) return display;
  }
  if (!row.event_date) return '—';
  const d = new Date(row.event_date + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtCount(n) {
  if (!n) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

// ── KPI CARD ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, accent }) {
  const borders = { indigo: 'border-indigo-500', green: 'border-emerald-500', yellow: 'border-yellow-500' };
  const values = { indigo: 'text-indigo-400', green: 'text-emerald-400', yellow: 'text-yellow-400' };
  return (
    <div className={`bg-gray-900 rounded-xl p-5 border-l-4 ${borders[accent]}`}>
      <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">{label}</p>
      <p className={`text-3xl font-bold ${values[accent]}`}>{value}</p>
      {sub && <p className="text-gray-500 text-xs mt-1">{sub}</p>}
    </div>
  );
}

// ── DEAL BADGE ────────────────────────────────────────────────────────────────
function DealBadge({ type }) {
  const map = {
    Contracted: 'bg-emerald-900 text-emerald-300 border-emerald-700',
    Confirmed: 'bg-emerald-900 text-emerald-300 border-emerald-700',
    Advanced: 'bg-blue-900 text-blue-300 border-blue-700',
    Settled: 'bg-gray-800 text-gray-400 border-gray-600',
    Negotiating: 'bg-yellow-900 text-yellow-300 border-yellow-700',
    'Offer In': 'bg-yellow-900 text-yellow-300 border-yellow-700',
    Request: 'bg-gray-800 text-gray-400 border-gray-600',
    Inquiry: 'bg-gray-800 text-gray-400 border-gray-600',
  };
  const cls = map[type] || 'bg-gray-800 text-gray-400 border-gray-600';
  return <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${cls}`}>{type}</span>;
}

// ── EDIT ARTIST MODAL ─────────────────────────────────────────────────────────
function EditArtistModal({ artist, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: artist.name || '',
    genre: artist.genre || '',
    base: artist.base || '',
    spotify: artist.spotify || '',
    instagram: artist.instagram || '',
    instagram_followers: artist.instagram_followers ? String(artist.instagram_followers) : '',
    club_fee: artist.club_fee || '',
    festival_fee: artist.festival_fee || '',
    manager_name: artist.manager_name || '',
    manager_email: artist.manager_email || '',
    label: artist.label || '',
    eu_agent: artist.eu_agent || '',
    notes: artist.notes || '',
    touring_grid_url: artist.touring_grid_url || '',
    target_list_url: artist.target_list_url || '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name) { setErr('Name is required.'); return; }
    setSaving(true); setErr(null);

    const payload = {
      name: form.name,
      genre: form.genre || null,
      base: form.base || null,
      spotify: form.spotify || null,
      instagram: form.instagram || null,
      instagram_followers: form.instagram_followers ? parseInt(form.instagram_followers.replace(/[^0-9]/g, ''), 10) || null : null,
      club_fee: form.club_fee || null,
      festival_fee: form.festival_fee || null,
      manager_name: form.manager_name || null,
      manager_email: form.manager_email || null,
      label: form.label || null,
      eu_agent: form.eu_agent || null,
      notes: form.notes || null,
      touring_grid_url: form.touring_grid_url || null,
      target_list_url: form.target_list_url || null,
    };

    const { data, error } = await supabase.from('artists').update(payload).eq('id', artist.id).select().single();
    if (error) { setErr(error.message); setSaving(false); return; }
    onSaved(data);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 overflow-y-auto"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-xl shadow-2xl my-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h3 className="text-white font-bold text-lg">Edit — {artist.name}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Name + Genre */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Name <span className="text-red-400">*</span></label>
              <input type="text" value={form.name} onChange={e => set('name', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500" required />
            </div>
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Genre</label>
              <input type="text" value={form.genre} onChange={e => set('genre', e.target.value)}
                placeholder="e.g. Hard Techno"
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
            </div>
          </div>
          {/* Base */}
          <div>
            <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Base / Location</label>
            <input type="text" value={form.base} onChange={e => set('base', e.target.value)}
              placeholder="e.g. Los Angeles, CA"
              className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
          </div>
          {/* Spotify + IG */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Spotify (display)</label>
              <input type="text" value={form.spotify} onChange={e => set('spotify', e.target.value)}
                placeholder="e.g. 145.3K"
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
            </div>
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">IG Handle</label>
              <input type="text" value={form.instagram} onChange={e => set('instagram', e.target.value)}
                placeholder="@handle"
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
            </div>
          </div>
          {/* IG followers + Club Fee */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">IG Followers</label>
              <input type="text" value={form.instagram_followers} onChange={e => set('instagram_followers', e.target.value)}
                placeholder="e.g. 19000"
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
            </div>
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Club Fee</label>
              <input type="text" value={form.club_fee} onChange={e => set('club_fee', e.target.value)}
                placeholder="e.g. $1,250–$1,500"
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
            </div>
          </div>
          {/* Festival Fee + EU Agent */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Festival Fee</label>
              <input type="text" value={form.festival_fee} onChange={e => set('festival_fee', e.target.value)}
                placeholder="e.g. $3,000–$6,000"
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
            </div>
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">EU Agent</label>
              <input type="text" value={form.eu_agent} onChange={e => set('eu_agent', e.target.value)}
                placeholder="e.g. Octaine (Gearbox)"
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
            </div>
          </div>
          {/* Manager Name + Email */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Manager Name</label>
              <input type="text" value={form.manager_name} onChange={e => set('manager_name', e.target.value)}
                placeholder="e.g. JJ"
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
            </div>
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Manager Email</label>
              <input type="email" value={form.manager_email} onChange={e => set('manager_email', e.target.value)}
                placeholder="manager@agency.com"
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
            </div>
          </div>
          {/* Label */}
          <div>
            <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Label</label>
            <input type="text" value={form.label} onChange={e => set('label', e.target.value)}
              placeholder="e.g. Ill Behavior Techno (co-founder)"
              className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
          </div>
          {/* Notes */}
          <div>
            <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              placeholder="Important notes, radius clauses, context…"
              rows={3}
              className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600 resize-none" />
          </div>
          {/* Touring Grid URL */}
          <div>
            <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Touring Grid URL</label>
            <input type="text" value={form.touring_grid_url} onChange={e => set('touring_grid_url', e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/..."
              className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
          </div>
          {/* Target List URL */}
          <div>
            <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Target List URL</label>
            <input type="text" value={form.target_list_url} onChange={e => set('target_list_url', e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/..."
              className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
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
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── ADD DEAL MODAL ────────────────────────────────────────────────────────────
const PIPELINE_STAGES = ['Offer In', 'Negotiating', 'Confirmed'];
const DEAL_CATEGORIES = ['Club', 'Festival'];

const EMPTY_DEAL = {
  stage: 'Offer In', event_date: '', market: '', venue: '',
  buyer: '', buyer_company: '', fee_offered: '', fee_target: '',
  deal_type: 'Club', hold_number: '', next_action: '', notes: '',
};

function AddDealModal({ artist, onClose, onAdded }) {
  const [form, setForm] = useState(EMPTY_DEAL);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true); setErr(null);
    const payload = {
      artist_id: artist.id,
      artist_slug: artist.slug,
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
    const { data, error } = await supabase.from('pipeline').insert(payload).select().single();
    if (error) { setErr(error.message); setSaving(false); return; }
    onAdded(data);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 overflow-y-auto"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl my-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h3 className="text-white font-bold text-lg">Add Deal — {artist.name}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

          {/* Stage + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Stage</label>
              <select value={form.stage} onChange={e => set('stage', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500">
                {PIPELINE_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Event Date</label>
              <input type="date" value={form.event_date} onChange={e => set('event_date', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500" />
            </div>
          </div>

          {/* Market + Venue */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Market / City</label>
              <input type="text" value={form.market} onChange={e => set('market', e.target.value)}
                placeholder="e.g. Miami, FL"
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
            </div>
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Venue</label>
              <input type="text" value={form.venue} onChange={e => set('venue', e.target.value)}
                placeholder="e.g. Club TBD"
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
            </div>
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
                {DEAL_CATEGORIES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Hold #</label>
              <input type="number" value={form.hold_number} onChange={e => set('hold_number', e.target.value)}
                placeholder="1" min="1" max="5"
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
            </div>
          </div>

          {/* Next Action */}
          <div>
            <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Next Action</label>
            <input type="text" value={form.next_action} onChange={e => set('next_action', e.target.value)}
              placeholder="e.g. Follow up by Thursday"
              className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              rows={2} placeholder="Any context…"
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

// ── ADD / EDIT SHOW MODAL ─────────────────────────────────────────────────────
const DEAL_TYPES = ['Confirmed', 'Contracted', 'Advanced', 'Settled'];
const STATUS_OPTS = ['Active', 'Hold', 'Cancelled'];
const SHOW_STATUS_OPTS = ['Pending', 'Confirmed', 'Contracted', 'Advancing', 'Rescheduling', 'Settled'];

const EMPTY_FORM = {
  event_date: '',
  city: '',
  venue: '',
  promoter: '',
  fee: '',
  deal_type: 'Confirmed',
  status: 'Active',
  notes: '',
};

function AddShowModal({ artist, onClose, onAdded }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  function set(field, val) {
    setForm((f) => ({ ...f, [field]: val }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.event_date || !form.city || !form.venue) {
      setErr('Date, City, and Venue are required.');
      return;
    }
    setSaving(true);
    setErr(null);

    const payload = {
      artist_id: artist.id,
      artist_slug: artist.slug,
      event_date: form.event_date,
      city: form.city,
      venue: form.venue,
      promoter: form.promoter || null,
      fee: form.fee || null,
      deal_type: form.deal_type,
      status: form.status,
      notes: form.notes || null,
    };

    const { data, error } = await supabase.from('shows').insert(payload).select().single();
    if (error) {
      setErr(error.message);
      setSaving(false);
      return;
    }
    onAdded(data);
    onClose();
  }

  // Close on backdrop click
  function handleBackdrop(e) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      onClick={handleBackdrop}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h3 className="text-white font-bold text-lg">Add Show — {artist.name}</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

          {/* Date + City row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">
                Date <span className="text-red-400">*</span>
              </label>
              <input
                type="date"
                value={form.event_date}
                onChange={(e) => set('event_date', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
                required
              />
            </div>
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">
                City <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.city}
                onChange={(e) => set('city', e.target.value)}
                placeholder="e.g. Miami, FL"
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600"
                required
              />
            </div>
          </div>

          {/* Venue */}
          <div>
            <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">
              Venue <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.venue}
              onChange={(e) => set('venue', e.target.value)}
              placeholder="e.g. Ground Zero Miami"
              className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600"
              required
            />
          </div>

          {/* Promoter + Fee row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Promoter</label>
              <input
                type="text"
                value={form.promoter}
                onChange={(e) => set('promoter', e.target.value)}
                placeholder="e.g. Domicile Miami"
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600"
              />
            </div>
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Fee</label>
              <input
                type="text"
                value={form.fee}
                onChange={(e) => set('fee', e.target.value)}
                placeholder="e.g. $2,500"
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600"
              />
            </div>
          </div>

          {/* Deal Type + Status row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Deal Type</label>
              <select
                value={form.deal_type}
                onChange={(e) => set('deal_type', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
              >
                {DEAL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => set('status', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
              >
                {STATUS_OPTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Any relevant notes..."
              rows={2}
              className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600 resize-none"
            />
          </div>

          {/* Error */}
          {err && (
            <p className="text-red-400 text-xs">{err}</p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-white text-sm px-4 py-2 rounded-lg border border-gray-700 hover:border-gray-500 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors disabled:opacity-60"
              style={{ backgroundColor: '#6366F1' }}
            >
              {saving ? 'Saving…' : 'Add Show'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── EDIT SHOW MODAL ───────────────────────────────────────────────────────────
function EditShowModal({ show, onClose, onSaved }) {
  const [form, setForm] = useState({
    city:     show.city     || '',
    venue:    show.venue    || '',
    promoter: show.promoter || '',
    fee:      show.fee      || '',
    status:   show.status   || 'Confirmed',
    notes:    show.notes    || '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState(null);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true); setErr(null);
    const { data, error } = await supabase
      .from('shows')
      .update({
        city:     form.city     || null,
        venue:    form.venue    || null,
        promoter: form.promoter || null,
        fee:      form.fee      || null,
        status:   form.status,
        notes:    form.notes    || null,
      })
      .eq('id', show.id)
      .select()
      .single();
    if (error) { setErr(error.message); setSaving(false); return; }
    onSaved(data);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h3 className="text-white font-bold text-lg">Edit Show</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">City</label>
              <input type="text" value={form.city} onChange={e => set('city', e.target.value)}
                placeholder="e.g. Miami, FL"
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
            </div>
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Venue</label>
              <input type="text" value={form.venue} onChange={e => set('venue', e.target.value)}
                placeholder="e.g. Ground Zero Miami"
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Promoter</label>
              <input type="text" value={form.promoter} onChange={e => set('promoter', e.target.value)}
                placeholder="e.g. Domicile Miami"
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
            </div>
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Fee</label>
              <input type="text" value={form.fee} onChange={e => set('fee', e.target.value)}
                placeholder="e.g. $2,500"
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
            </div>
          </div>
          <div>
            <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Status</label>
            <select value={form.status} onChange={e => set('status', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500">
              {SHOW_STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              rows={2} placeholder="Any relevant notes..."
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
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── LOADING SKELETON ──────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 h-40" />
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => <div key={i} className="bg-gray-900 rounded-xl border border-gray-800 h-24" />)}
      </div>
      <div className="bg-gray-900 rounded-xl border border-gray-800 h-40" />
    </div>
  );
}

// ── PAGE ──────────────────────────────────────────────────────────────────────
export default function ArtistDetail() {
  const { slug } = useParams();
  const [artist, setArtist] = useState(null);
  const [shows, setShows] = useState([]);
  const [pipeline, setPipeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDealModal, setShowDealModal] = useState(false);
  const [editShow, setEditShow] = useState(null);
  const [activityLog, setActivityLog] = useState([]);

  useEffect(() => {
    async function load() {
      try {
        const [artistRes, showsRes, pipelineRes, activityRes] = await Promise.all([
          supabase.from('artists').select('*').eq('slug', slug).single(),
          supabase.from('shows').select('*').eq('artist_slug', slug).order('event_date'),
          supabase.from('pipeline').select('*').eq('artist_slug', slug).order('event_date'),
          supabase.from('activity_log').select('*').eq('artist_slug', slug).order('created_at', { ascending: false }).limit(50),
        ]);

        if (artistRes.error) throw artistRes.error;
        if (showsRes.error) throw showsRes.error;
        if (pipelineRes.error) throw pipelineRes.error;

        setArtist(artistRes.data);
        setShows(showsRes.data);
        setPipeline(pipelineRes.data);
        if (!activityRes.error) setActivityLog(activityRes.data || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [slug]);

  const yearTotal = shows.reduce((sum, s) => sum + parseFee(s.fee), 0);

  if (!loading && !artist && !error) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white" style={{ backgroundColor: '#111827' }}>
        <div className="text-center">
          <p className="text-gray-400 text-lg mb-4">Artist not found.</p>
          <Link to="/artists" className="text-indigo-400 hover:underline text-sm">← Back to Roster</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white" style={{ backgroundColor: '#111827' }}>
      <Nav />

      {/* ── BREADCRUMB ── */}
      <div className="max-w-7xl mx-auto px-6 pt-6">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Link to="/" className="hover:text-white transition-colors">Dashboard</Link>
          <span>/</span>
          <Link to="/artists" className="hover:text-white transition-colors">Artists</Link>
          <span>/</span>
          <span className="text-gray-300">{artist?.name ?? slug}</span>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-6">

        {/* Error */}
        {error && (
          <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-xl px-5 py-4 mb-6 text-sm">
            Failed to load artist: {error}
          </div>
        )}

        {loading && <Skeleton />}

        {!loading && artist && (
          <>
            {/* ── ARTIST HEADER ── */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 mb-6">
              <div className="relative flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">

                {/* Header buttons */}
                <div className="absolute top-4 right-4 sm:static sm:self-start flex items-center gap-2">
                  {artist.touring_grid_url ? (
                    <a
                      href={artist.touring_grid_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-600 text-gray-400 hover:border-gray-400 hover:text-white transition-colors"
                    >
                      Touring Grid
                    </a>
                  ) : (
                    <span
                      title="No sheet linked yet"
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-700 text-gray-600 cursor-not-allowed"
                    >
                      Touring Grid
                    </span>
                  )}
                  {artist.target_list_url ? (
                    <a
                      href={artist.target_list_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-600 text-gray-400 hover:border-gray-400 hover:text-white transition-colors"
                    >
                      Target List
                    </a>
                  ) : (
                    <span
                      title="No sheet linked yet"
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-700 text-gray-600 cursor-not-allowed"
                    >
                      Target List
                    </span>
                  )}
                  <button
                    onClick={() => setShowEditModal(true)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-600 text-gray-400 hover:border-gray-400 hover:text-white transition-colors"
                  >
                    Edit
                  </button>
                </div>

                {/* Left: name + meta */}
                <div>
                  {artist.category === 'priority' && (
                    <span className="text-xs font-bold bg-indigo-900 text-indigo-300 border border-indigo-700 px-2 py-0.5 rounded uppercase tracking-wider mb-2 inline-block">
                      Priority Artist
                    </span>
                  )}
                  {artist.category === 'leo' && (
                    <span className="text-xs font-bold bg-purple-900 text-purple-300 border border-purple-700 px-2 py-0.5 rounded uppercase tracking-wider mb-2 inline-block">
                      Leo's Artist
                    </span>
                  )}

                  <h2 className="text-3xl font-bold text-white mb-1">{artist.name}</h2>
                  <p className="text-indigo-400 font-medium text-sm mb-3">{artist.genre}</p>

                  <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 text-xs uppercase tracking-wider">Base</span>
                      <span className="text-gray-300">{artist.base}</span>
                    </div>
                    {artist.spotify && (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500 text-xs uppercase tracking-wider">Spotify</span>
                        <span className="text-gray-300">{artist.spotify} monthly</span>
                      </div>
                    )}
                    {artist.instagram && (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500 text-xs uppercase tracking-wider">IG</span>
                        <span className="text-gray-300">
                          {artist.instagram}
                          {artist.instagram_followers ? ` (${fmtCount(artist.instagram_followers)})` : ''}
                        </span>
                      </div>
                    )}
                    {artist.club_fee && artist.club_fee !== 'TBD' && (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500 text-xs uppercase tracking-wider">Club Fee</span>
                        <span className="text-emerald-400 font-semibold">{artist.club_fee}</span>
                      </div>
                    )}
                    {artist.festival_fee && (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500 text-xs uppercase tracking-wider">Festival Fee</span>
                        <span className="text-emerald-400 font-semibold">{artist.festival_fee}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: manager + label + EU agent */}
                <div className="flex flex-col gap-2 text-sm sm:text-right">
                  {artist.manager_name && (
                    <div>
                      <p className="text-gray-500 text-xs uppercase tracking-wider">Manager</p>
                      <p className="text-gray-300">{artist.manager_name}</p>
                      {artist.manager_email && (
                        <a href={`mailto:${artist.manager_email}`} className="text-indigo-400 text-xs hover:underline">
                          {artist.manager_email}
                        </a>
                      )}
                    </div>
                  )}
                  {artist.label && (
                    <div className="mt-1">
                      <p className="text-gray-500 text-xs uppercase tracking-wider">Label</p>
                      <p className="text-gray-300 text-xs">{artist.label}</p>
                    </div>
                  )}
                  {artist.eu_agent && (
                    <div className="mt-1">
                      <p className="text-gray-500 text-xs uppercase tracking-wider">EU Agent</p>
                      <p className="text-gray-300 text-xs">{artist.eu_agent}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Notes */}
              {artist.notes && (
                <div className="mt-4 pt-4 border-t border-gray-800">
                  <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Notes</p>
                  <p className="text-yellow-300 text-sm leading-relaxed">{artist.notes}</p>
                </div>
              )}
            </div>

            {/* ── KPI CARDS ── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <KpiCard
                label="Confirmed Shows" value={shows.length}
                sub={shows.length === 0 ? 'No confirmed shows yet' : 'This year'}
                accent="green"
              />
              <KpiCard
                label="Offers In Progress" value={pipeline.length}
                sub={pipeline.length === 0 ? 'Nothing in the works' : 'Pending + negotiating'}
                accent="yellow"
              />
              <KpiCard
                label="Year Total"
                value={yearTotal > 0 ? formatUSD(yearTotal) : '—'}
                sub={yearTotal > 0 ? 'Confirmed fees 2026' : 'No confirmed fees yet'}
                accent="indigo"
              />
            </div>

            {/* ── CURRENT SCHEDULE ── */}
            <section className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-white">Current Schedule</h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowDealModal(true)}
                    className="flex items-center gap-2 text-sm font-semibold px-4 py-1.5 rounded-lg text-white transition-colors border border-indigo-600 hover:bg-indigo-600/20"
                  >
                    + Add Deal
                  </button>
                  <button
                    onClick={() => setShowModal(true)}
                    className="flex items-center gap-2 text-sm font-semibold px-4 py-1.5 rounded-lg text-white transition-colors"
                    style={{ backgroundColor: '#6366F1' }}
                  >
                    + Add Show
                  </button>
                </div>
              </div>
              {shows.length === 0 ? (
                <div className="bg-gray-900 rounded-xl border border-gray-800 px-5 py-8 text-center">
                  <p className="text-gray-500 text-sm">No confirmed shows yet.</p>
                </div>
              ) : (
                <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800">
                        {['Date', 'City', 'Venue', 'Promoter', 'Fee', 'Deal Type'].map((h) => (
                          <th key={h} className="text-left text-gray-500 text-xs font-semibold uppercase tracking-wider px-5 py-3">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {shows.map((show) => (
                        <tr key={show.id} onClick={() => setEditShow(show)}
                          className="border-b border-gray-800 last:border-0 bg-emerald-950/10 hover:bg-emerald-950/20 transition-colors cursor-pointer">
                          <td className="px-5 py-3.5 text-gray-300 whitespace-nowrap">{fmtDate(show)}</td>
                          <td className="px-5 py-3.5 text-gray-300">{show.city}</td>
                          <td className="px-5 py-3.5 text-white font-medium">{show.venue}</td>
                          <td className="px-5 py-3.5 text-gray-400">{show.promoter}</td>
                          <td className="px-5 py-3.5 text-emerald-400 font-semibold">{show.fee}</td>
                          <td className="px-5 py-3.5"><DealBadge type={show.deal_type} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* ── IN THE WORKS ── */}
            <section className="mb-8">
              <h3 className="text-lg font-bold text-white mb-3">In The Works</h3>
              {pipeline.length === 0 ? (
                <div className="bg-gray-900 rounded-xl border border-gray-800 px-5 py-8 text-center">
                  <p className="text-gray-500 text-sm">No offers or negotiations in progress.</p>
                </div>
              ) : (
                <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800">
                        {['Date', 'Market', 'Venue', 'Buyer', 'Fee Offered', 'Stage'].map((h) => (
                          <th key={h} className="text-left text-gray-500 text-xs font-semibold uppercase tracking-wider px-5 py-3">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pipeline.map((deal) => (
                        <tr key={deal.id} className="border-b border-gray-800 last:border-0 bg-yellow-950/10 hover:bg-yellow-950/20 transition-colors">
                          <td className="px-5 py-3.5 text-gray-300 whitespace-nowrap">{fmtDate(deal)}</td>
                          <td className="px-5 py-3.5 text-gray-300">{deal.market}</td>
                          <td className="px-5 py-3.5 text-white font-medium">{deal.venue}</td>
                          <td className="px-5 py-3.5 text-gray-400">{deal.buyer_company || deal.buyer}</td>
                          <td className="px-5 py-3.5 text-yellow-400 font-semibold">{deal.fee_offered}</td>
                          <td className="px-5 py-3.5"><DealBadge type={deal.stage} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* ── ACTIVITY LOG ── */}
            <section className="mb-8">
              <h3 className="text-lg font-bold text-white mb-3">Activity</h3>
              <div className="bg-gray-900 rounded-xl border border-gray-800 px-5">
                {activityLog.length === 0 ? (
                  <p className="text-gray-600 text-sm py-8 text-center">No activity recorded yet.</p>
                ) : (
                  activityLog.map(entry => <ActivityEntry key={entry.id} entry={entry} />)
                )}
              </div>
            </section>

            {/* ── ACTION BUTTONS ── */}
            <div className="flex flex-wrap gap-3">
              <Link to="/artists" className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm border border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200 transition-colors">
                ← Back to Roster
              </Link>
            </div>

            {/* ── ADD SHOW MODAL ── */}
            {showModal && (
              <AddShowModal
                artist={artist}
                onClose={() => setShowModal(false)}
                onAdded={(newShow) => {
                  setShows((prev) =>
                    [...prev, newShow].sort((a, b) =>
                      (a.event_date || '').localeCompare(b.event_date || '')
                    )
                  );
                  const desc = `Show added: ${newShow.venue || ''}${newShow.city ? ` in ${newShow.city}` : ''}${newShow.event_date ? ` on ${newShow.event_date}` : ''}`.trim();
                  logActivity(artist.slug, 'show_added', desc);
                  setActivityLog(prev => [{
                    id: `tmp-${Date.now()}`, artist_slug: artist.slug,
                    action: 'show_added', description: desc, created_at: new Date().toISOString(),
                  }, ...prev]);
                }}
              />
            )}

            {/* ── ADD DEAL MODAL ── */}
            {showDealModal && (
              <AddDealModal
                artist={artist}
                onClose={() => setShowDealModal(false)}
                onAdded={(newDeal) => {
                  setPipeline(prev =>
                    [...prev, newDeal].sort((a, b) =>
                      (a.event_date || '').localeCompare(b.event_date || '')
                    )
                  );
                  const desc = `Deal added: ${newDeal.stage}${newDeal.venue ? ` — ${newDeal.venue}` : ''}${newDeal.market ? ` in ${newDeal.market}` : ''}${newDeal.fee_offered ? ` (${newDeal.fee_offered})` : ''}`;
                  logActivity(artist.slug, 'deal_added', desc);
                  setActivityLog(prev => [{
                    id: `tmp-${Date.now()}`, artist_slug: artist.slug,
                    action: 'deal_added', description: desc, created_at: new Date().toISOString(),
                  }, ...prev]);
                }}
              />
            )}

            {/* ── EDIT SHOW MODAL ── */}
            {editShow && (
              <EditShowModal
                show={editShow}
                onClose={() => setEditShow(null)}
                onSaved={(updated) => {
                  setShows(prev => prev.map(s => s.id === updated.id ? updated : s));
                  setEditShow(null);
                }}
              />
            )}

            {/* ── EDIT ARTIST MODAL ── */}
            {showEditModal && (
              <EditArtistModal
                artist={artist}
                onClose={() => setShowEditModal(false)}
                onSaved={(updated) => setArtist(updated)}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
