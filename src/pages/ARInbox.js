import { useState, useEffect, useMemo, Fragment } from 'react';
import { supabase } from '../lib/supabase';
import Nav from '../components/Nav';

// ── STATUS CONFIG ─────────────────────────────────────────────────────────────
const STATUS_OPTIONS = ['New', 'Reviewing', 'Hip Pocket', 'Sign', 'Pass'];
// Sort order: New → Reviewing → Hip Pocket → Sign → Pass
const STATUS_ORDER = { New: 0, Reviewing: 1, 'Hip Pocket': 2, Sign: 3, Pass: 4 };

const STATUS_STYLE = {
  New:          { badge: 'bg-indigo-900 text-indigo-300 border-indigo-700',   dot: 'bg-indigo-500' },
  Reviewing:    { badge: 'bg-yellow-900 text-yellow-300 border-yellow-700',   dot: 'bg-yellow-500' },
  'Hip Pocket': { badge: 'bg-purple-900 text-purple-300 border-purple-700',   dot: 'bg-purple-500' },
  Sign:         { badge: 'bg-emerald-900 text-emerald-300 border-emerald-700', dot: 'bg-emerald-500' },
  Pass:         { badge: 'bg-gray-800 text-gray-500 border-gray-700',         dot: 'bg-gray-600' },
};

const TYPE_OPTIONS = ['artist', 'coordinator', 'buyer', 'other'];
const SOURCE_OPTIONS = ['email', 'IG', 'referral', 'show', 'other'];

// ── ADD PROSPECT MODAL ────────────────────────────────────────────────────────
const EMPTY = {
  prospect_type: 'artist', name: '', contact_email: '', contact_phone: '',
  source: 'email', source_detail: '', status: 'New', notes: '',
  spotify_listeners: '', instagram_handle: '', decision_target_date: '',
};

function AddProspectModal({ onClose, onAdded }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setErr('Name is required.'); return; }
    setSaving(true); setErr(null);
    const payload = {
      prospect_type: form.prospect_type,
      name: form.name.trim(),
      contact_email: form.contact_email || null,
      contact_phone: form.contact_phone || null,
      source: form.source || null,
      source_detail: form.source_detail || null,
      status: form.status,
      notes: form.notes || null,
      spotify_listeners: form.spotify_listeners ? parseInt(form.spotify_listeners, 10) : null,
      instagram_handle: form.instagram_handle || null,
      decision_target_date: form.decision_target_date || null,
    };
    const { data, error } = await supabase.from('prospects').insert(payload).select().single();
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
          <h3 className="text-white font-bold text-lg">Add Prospect</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Type</label>
              <select value={form.prospect_type} onChange={e => set('prospect_type', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500">
                {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500">
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Name *</label>
            <input type="text" value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="Artist name, person, or 'Submission (TBD)'"
              className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Source</label>
              <select value={form.source} onChange={e => set('source', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500">
                {SOURCE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Decision by</label>
              <input type="date" value={form.decision_target_date} onChange={e => set('decision_target_date', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500" />
            </div>
          </div>
          <div>
            <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Source detail</label>
            <input type="text" value={form.source_detail} onChange={e => set('source_detail', e.target.value)}
              placeholder="e.g. Renault @ Swarm France emailed May 4"
              className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Email</label>
              <input type="email" value={form.contact_email} onChange={e => set('contact_email', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
            </div>
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Phone</label>
              <input type="tel" value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Instagram</label>
              <input type="text" value={form.instagram_handle} onChange={e => set('instagram_handle', e.target.value)}
                placeholder="@handle"
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
            </div>
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Spotify listeners</label>
              <input type="number" value={form.spotify_listeners} onChange={e => set('spotify_listeners', e.target.value)}
                placeholder="monthly"
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
            </div>
          </div>
          <div>
            <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              rows={3}
              className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600 resize-y" />
          </div>
          {err && <p className="text-red-400 text-sm">{err}</p>}
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-800">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg font-semibold transition-colors">
              {saving ? 'Saving…' : 'Add Prospect'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── EXPANDED ROW (edit-in-place) ──────────────────────────────────────────────
function ExpandedRow({ prospect, onUpdated, onDeleted, onClose }) {
  const [form, setForm] = useState({
    notes: prospect.notes || '',
    source_detail: prospect.source_detail || '',
    contact_email: prospect.contact_email || '',
    contact_phone: prospect.contact_phone || '',
    instagram_handle: prospect.instagram_handle || '',
    spotify_listeners: prospect.spotify_listeners ?? '',
    decision_target_date: prospect.decision_target_date || '',
  });
  const [saving, setSaving] = useState(false);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function save() {
    setSaving(true);
    const patch = {
      notes: form.notes || null,
      source_detail: form.source_detail || null,
      contact_email: form.contact_email || null,
      contact_phone: form.contact_phone || null,
      instagram_handle: form.instagram_handle || null,
      spotify_listeners: form.spotify_listeners === '' ? null : parseInt(form.spotify_listeners, 10),
      decision_target_date: form.decision_target_date || null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('prospects').update(patch).eq('id', prospect.id).select().single();
    setSaving(false);
    if (error) { alert(`Save failed: ${error.message}`); return; }
    onUpdated(data);
    onClose();
  }

  async function remove() {
    if (!window.confirm(`Delete prospect "${prospect.name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from('prospects').delete().eq('id', prospect.id);
    if (error) { alert(`Delete failed: ${error.message}`); return; }
    onDeleted(prospect.id);
  }

  return (
    <tr className="bg-gray-900/50">
      <td colSpan={6} className="px-4 py-4 border-b border-gray-800">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label className="block text-gray-500 text-[11px] uppercase tracking-wider mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
              className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded px-3 py-2 focus:outline-none focus:border-indigo-500 resize-y" />
          </div>
          <div>
            <label className="block text-gray-500 text-[11px] uppercase tracking-wider mb-1">Source detail</label>
            <input type="text" value={form.source_detail} onChange={e => set('source_detail', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded px-3 py-2 focus:outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label className="block text-gray-500 text-[11px] uppercase tracking-wider mb-1">Decision by</label>
            <input type="date" value={form.decision_target_date} onChange={e => set('decision_target_date', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded px-3 py-2 focus:outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label className="block text-gray-500 text-[11px] uppercase tracking-wider mb-1">Email</label>
            <input type="email" value={form.contact_email} onChange={e => set('contact_email', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded px-3 py-2 focus:outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label className="block text-gray-500 text-[11px] uppercase tracking-wider mb-1">Phone</label>
            <input type="tel" value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded px-3 py-2 focus:outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label className="block text-gray-500 text-[11px] uppercase tracking-wider mb-1">Instagram</label>
            <input type="text" value={form.instagram_handle} onChange={e => set('instagram_handle', e.target.value)}
              placeholder="@handle"
              className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
          </div>
          <div>
            <label className="block text-gray-500 text-[11px] uppercase tracking-wider mb-1">Spotify listeners</label>
            <input type="number" value={form.spotify_listeners} onChange={e => set('spotify_listeners', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded px-3 py-2 focus:outline-none focus:border-indigo-500" />
          </div>
        </div>
        <div className="flex items-center justify-between pt-3 mt-3 border-t border-gray-800">
          <button onClick={remove}
            className="text-red-400 hover:text-red-300 text-xs uppercase tracking-wider transition-colors">
            Delete
          </button>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-3 py-1.5 text-xs text-gray-400 hover:text-white transition-colors">
              Cancel
            </button>
            <button onClick={save} disabled={saving}
              className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 text-white rounded font-semibold transition-colors">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────
export default function ARInbox() {
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [expandedId, setExpandedId] = useState(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from('prospects').select('*').order('created_at', { ascending: false });
    if (!error) setProspects(data || []);
    setLoading(false);
  }

  async function changeStatus(id, newStatus) {
    const { data, error } = await supabase.from('prospects')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', id).select().single();
    if (error) { alert(`Status update failed: ${error.message}`); return; }
    setProspects(ps => ps.map(p => p.id === id ? data : p));
  }

  function onAdded(p) { setProspects(ps => [p, ...ps]); }
  function onUpdated(p) { setProspects(ps => ps.map(x => x.id === p.id ? p : x)); }
  function onDeleted(id) { setProspects(ps => ps.filter(p => p.id !== id)); setExpandedId(null); }

  const filtered = useMemo(() => {
    const list = filter === 'All' ? prospects : prospects.filter(p => p.status === filter);
    return [...list].sort((a, b) => {
      const oa = STATUS_ORDER[a.status] ?? 99;
      const ob = STATUS_ORDER[b.status] ?? 99;
      if (oa !== ob) return oa - ob;
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }, [prospects, filter]);

  const counts = useMemo(() => {
    const c = { All: prospects.length };
    for (const s of STATUS_OPTIONS) c[s] = prospects.filter(p => p.status === s).length;
    return c;
  }, [prospects]);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Nav />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-display font-bold">A&R Inbox</h1>
            <p className="text-gray-500 text-sm mt-1">Track unsolicited touches so they don't die in email.</p>
          </div>
          <button onClick={() => setAdding(true)}
            className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold transition-colors">
            + Add Prospect
          </button>
        </div>

        {/* Filter pills */}
        <div className="flex flex-wrap gap-2 mb-4">
          {['All', ...STATUS_OPTIONS].map(s => {
            const active = filter === s;
            const style = STATUS_STYLE[s];
            return (
              <button key={s} onClick={() => setFilter(s)}
                className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                  active
                    ? (style ? `${style.badge} font-semibold` : 'bg-white text-gray-900 border-white font-semibold')
                    : 'bg-gray-900 text-gray-500 border-gray-800 hover:text-gray-300 hover:border-gray-700'
                }`}>
                {s} <span className="ml-1 opacity-60">{counts[s] || 0}</span>
              </button>
            );
          })}
        </div>

        {/* Table */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          {loading ? (
            <p className="px-4 py-12 text-center text-gray-500 text-sm">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-12 text-center text-gray-500 text-sm">No prospects {filter !== 'All' ? `with status "${filter}"` : 'yet'}.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-800">
                  <th className="px-4 py-2.5 font-semibold">Name</th>
                  <th className="px-4 py-2.5 font-semibold">Type</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 font-semibold">Source</th>
                  <th className="px-4 py-2.5 font-semibold">Decide by</th>
                  <th className="px-4 py-2.5 font-semibold">Notes</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const style = STATUS_STYLE[p.status] || STATUS_STYLE.New;
                  const expanded = expandedId === p.id;
                  return (
                    <Fragment key={p.id}>
                      <tr
                        className={`border-b border-gray-800/60 hover:bg-gray-800/40 cursor-pointer transition-colors ${expanded ? 'bg-gray-800/40' : ''}`}
                        onClick={() => setExpandedId(expanded ? null : p.id)}
                      >
                        <td className="px-4 py-3 font-semibold text-white">{p.name}</td>
                        <td className="px-4 py-3 text-gray-400 capitalize">{p.prospect_type}</td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <select value={p.status} onChange={e => changeStatus(p.id, e.target.value)}
                            className={`text-[11px] rounded-full border px-2 py-1 focus:outline-none ${style.badge}`}>
                            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-3 text-gray-400">
                          {p.source ? <span className="capitalize">{p.source}</span> : <span className="text-gray-600">—</span>}
                          {p.source_detail && <p className="text-gray-600 text-[11px] truncate max-w-[260px]">{p.source_detail}</p>}
                        </td>
                        <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                          {p.decision_target_date || <span className="text-gray-600">—</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-400 max-w-md">
                          <p className="line-clamp-2">{p.notes || <span className="text-gray-600">—</span>}</p>
                        </td>
                      </tr>
                      {expanded && (
                        <ExpandedRow
                          prospect={p}
                          onUpdated={onUpdated}
                          onDeleted={onDeleted}
                          onClose={() => setExpandedId(null)}
                        />
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {adding && <AddProspectModal onClose={() => setAdding(false)} onAdded={onAdded} />}
    </div>
  );
}
