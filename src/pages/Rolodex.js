import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import Nav from '../components/Nav';

// ── STATUS CONFIG ─────────────────────────────────────────────────────────────
const STATUS_OPTIONS = ['Active', 'Warm', 'Cold', 'Graveyard', 'Red Flag'];

const STATUS_STYLE = {
  Active:     { badge: 'bg-emerald-900 text-emerald-300 border-emerald-700', dot: 'bg-emerald-500' },
  Warm:       { badge: 'bg-yellow-900 text-yellow-300 border-yellow-700',   dot: 'bg-yellow-500' },
  Cold:       { badge: 'bg-gray-800 text-gray-400 border-gray-600',         dot: 'bg-gray-500' },
  Graveyard:  { badge: 'bg-gray-900 text-gray-600 border-gray-800',         dot: 'bg-gray-700' },
  'Red Flag': { badge: 'bg-red-900 text-red-300 border-red-700',            dot: 'bg-red-500' },
};

function StatusBadge({ status }) {
  const style = STATUS_STYLE[status] || STATUS_STYLE['Cold'];
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${style.badge}`}>
      {status === 'Red Flag' ? '🔴 Red Flag' : status}
    </span>
  );
}

// ── ADD BUYER MODAL ───────────────────────────────────────────────────────────
const EMPTY_BUYER = {
  name: '', company: '', market: '', email: '', instagram: '',
  region: '', status: 'Cold', notes: '', artists_worked: '',
};

function AddBuyerModal({ onClose, onAdded }) {
  const [form, setForm] = useState(EMPTY_BUYER);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name) { setErr('Name is required.'); return; }
    setSaving(true); setErr(null);
    const payload = {
      name: form.name,
      company: form.company || null,
      market: form.market || null,
      email: form.email || null,
      instagram: form.instagram || null,
      region: form.region || null,
      status: form.status,
      notes: form.notes || null,
      artists_worked: form.artists_worked || null,
    };
    const { data, error } = await supabase.from('buyers').insert(payload).select().single();
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
          <h3 className="text-white font-bold text-lg">Add Buyer</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">
                Name <span className="text-red-400">*</span>
              </label>
              <input type="text" value={form.name} onChange={e => set('name', e.target.value)}
                placeholder="First Last"
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" required />
            </div>
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Company</label>
              <input type="text" value={form.company} onChange={e => set('company', e.target.value)}
                placeholder="e.g. Domicile Miami"
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Market</label>
              <input type="text" value={form.market} onChange={e => set('market', e.target.value)}
                placeholder="e.g. Miami, FL"
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
            </div>
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Region</label>
              <input type="text" value={form.region} onChange={e => set('region', e.target.value)}
                placeholder="e.g. Southeast"
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                placeholder="buyer@venue.com"
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
            </div>
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Instagram</label>
              <input type="text" value={form.instagram} onChange={e => set('instagram', e.target.value)}
                placeholder="@handle"
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500">
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Artists Worked</label>
              <input type="text" value={form.artists_worked} onChange={e => set('artists_worked', e.target.value)}
                placeholder="SHOGUN, CLAWZ..."
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
            </div>
          </div>
          <div>
            <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              placeholder="Context, history, red flags..."
              rows={3}
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
              {saving ? 'Saving…' : 'Add Buyer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── INLINE STATUS SELECT ──────────────────────────────────────────────────────
const STATUS_SELECT_STYLE = {
  Active:     'bg-emerald-900 text-emerald-300 border-emerald-700',
  Warm:       'bg-yellow-900 text-yellow-300 border-yellow-700',
  Cold:       'bg-gray-800 text-gray-400 border-gray-600',
  Graveyard:  'bg-gray-900 text-gray-600 border-gray-800',
  'Red Flag': 'bg-red-900 text-red-300 border-red-700',
};

function StatusSelect({ buyerId, status, onChange }) {
  const [saving, setSaving] = useState(false);
  const cls = STATUS_SELECT_STYLE[status] || STATUS_SELECT_STYLE['Cold'];

  async function handleChange(e) {
    e.stopPropagation();
    const newStatus = e.target.value;
    setSaving(true);
    await supabase.from('buyers').update({ status: newStatus }).eq('id', buyerId);
    setSaving(false);
    onChange(buyerId, newStatus);
  }

  return (
    <select
      value={status}
      onChange={handleChange}
      onClick={e => e.stopPropagation()}
      disabled={saving}
      className={`text-xs font-semibold px-2 py-0.5 rounded border cursor-pointer focus:outline-none disabled:opacity-60 ${cls}`}
      style={{ backgroundColor: 'inherit' }}
    >
      {STATUS_OPTIONS.map(s => (
        <option key={s} value={s} className="bg-gray-900 text-white">{s === 'Red Flag' ? '🔴 Red Flag' : s}</option>
      ))}
    </select>
  );
}

// ── BUYER ROW (expandable) ────────────────────────────────────────────────────
function BuyerRow({ buyer, onStatusChange }) {
  const [expanded, setExpanded] = useState(false);
  const style = STATUS_STYLE[buyer.status] || STATUS_STYLE['Cold'];

  return (
    <>
      <tr
        onClick={() => setExpanded(e => !e)}
        className={`border-b border-gray-800 transition-colors cursor-pointer ${
          buyer.status === 'Red Flag' ? 'bg-red-950/10 hover:bg-red-950/20' :
          buyer.status === 'Active'   ? 'bg-emerald-950/5 hover:bg-emerald-950/15' :
          buyer.status === 'Warm'     ? 'bg-yellow-950/5 hover:bg-yellow-950/15' :
          buyer.status === 'Graveyard'? 'opacity-50 hover:opacity-70' :
          'hover:bg-gray-800/40'
        }`}
      >
        <td className="px-5 py-3.5">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${style.dot}`} />
            <span className="text-white font-semibold text-sm">{buyer.name}</span>
          </div>
        </td>
        <td className="px-5 py-3.5 text-gray-300 text-sm">{buyer.company || '—'}</td>
        <td className="px-5 py-3.5 text-gray-400 text-sm">{buyer.market || '—'}</td>
        <td className="px-5 py-3.5 text-sm">
          {buyer.email
            ? <a href={`mailto:${buyer.email}`} onClick={e => e.stopPropagation()} className="text-indigo-400 hover:underline">{buyer.email}</a>
            : <span className="text-gray-600">—</span>
          }
        </td>
        <td className="px-5 py-3.5" onClick={e => e.stopPropagation()}>
          <StatusSelect buyerId={buyer.id} status={buyer.status} onChange={onStatusChange} />
        </td>
        <td className="px-5 py-3.5 text-gray-500 text-xs max-w-[160px] truncate">{buyer.artists_worked || '—'}</td>
        <td className="px-5 py-3.5 text-gray-500 text-xs max-w-[200px] truncate">{buyer.notes || '—'}</td>
        <td className="px-5 py-3.5 text-gray-600 text-xs">{expanded ? '▲' : '▼'}</td>
      </tr>
      {expanded && (
        <tr className="border-b border-gray-800 bg-gray-800/20">
          <td colSpan={8} className="px-6 py-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs mb-3">
              {buyer.instagram && (
                <div>
                  <p className="text-gray-500 uppercase tracking-wider mb-1">Instagram</p>
                  <p className="text-indigo-400">{buyer.instagram}</p>
                </div>
              )}
              {buyer.region && (
                <div>
                  <p className="text-gray-500 uppercase tracking-wider mb-1">Region</p>
                  <p className="text-gray-300">{buyer.region}</p>
                </div>
              )}
              {buyer.artists_worked && (
                <div className="col-span-2">
                  <p className="text-gray-500 uppercase tracking-wider mb-1">Artists Worked</p>
                  <p className="text-gray-300">{buyer.artists_worked}</p>
                </div>
              )}
            </div>
            {buyer.notes && (
              <div>
                <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Notes</p>
                <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{buyer.notes}</p>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ── PAGE ──────────────────────────────────────────────────────────────────────
export default function Rolodex() {
  const [buyers, setBuyers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const { data, error } = await supabase
          .from('buyers')
          .select('*')
          .order('name');
        if (error) throw error;
        setBuyers(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filtered = useMemo(() => {
    let rows = buyers;
    if (filterStatus) rows = rows.filter(b => b.status === filterStatus);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(b =>
        (b.name || '').toLowerCase().includes(q) ||
        (b.company || '').toLowerCase().includes(q) ||
        (b.market || '').toLowerCase().includes(q) ||
        (b.email || '').toLowerCase().includes(q)
      );
    }
    return rows;
  }, [buyers, filterStatus, search]);

  function handleStatusChange(id, newStatus) {
    setBuyers(prev => prev.map(b => b.id === id ? { ...b, status: newStatus } : b));
  }

  const counts = STATUS_OPTIONS.reduce((acc, s) => {
    acc[s] = buyers.filter(b => b.status === s).length;
    return acc;
  }, {});

  return (
    <div className="min-h-screen text-white" style={{ backgroundColor: '#111827' }}>
      <Nav />

      {/* Breadcrumb */}
      <div className="max-w-7xl mx-auto px-6 pt-6">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Link to="/" className="hover:text-white transition-colors">Dashboard</Link>
          <span>/</span>
          <span className="text-gray-300">Buyer Rolodex</span>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-6">

        {error && (
          <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-xl px-5 py-4 mb-6 text-sm">
            {error}
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white">Buyer Rolodex</h2>
            <p className="text-gray-500 text-sm mt-1">
              {loading ? 'Loading…' : `${buyers.length} buyers · ${counts['Active'] || 0} active · ${counts['Red Flag'] || 0} red flags`}
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg text-white self-start sm:self-auto"
            style={{ backgroundColor: '#6366F1' }}
          >
            + Add Buyer
          </button>
        </div>

        {/* Search + Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, company, market, or email…"
            className="flex-1 bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-4 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600"
          />
        </div>

        {/* Status filter pills */}
        <div className="flex flex-wrap gap-2 mb-5">
          <button
            onClick={() => setFilterStatus('')}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              filterStatus === '' ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-gray-700 text-gray-400 hover:border-gray-500'
            }`}
          >
            All ({buyers.length})
          </button>
          {STATUS_OPTIONS.filter(s => (counts[s] || 0) > 0).map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s === filterStatus ? '' : s)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                filterStatus === s ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-gray-700 text-gray-400 hover:border-gray-500'
              }`}
            >
              {s === 'Red Flag' ? '🔴 Red Flag' : s} ({counts[s] || 0})
            </button>
          ))}
        </div>

        {/* Table */}
        {loading ? (
          <div className="bg-gray-900 rounded-xl border border-gray-800 animate-pulse h-64" />
        ) : filtered.length === 0 ? (
          <div className="bg-gray-900 rounded-xl border border-gray-800 px-5 py-12 text-center">
            <p className="text-gray-500 text-sm">
              {buyers.length === 0
                ? 'No buyers in the rolodex yet — add your first contact or run the seed script.'
                : 'No buyers match your search or filter.'}
            </p>
          </div>
        ) : (
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Name', 'Company', 'Market', 'Email', 'Status', 'Artists', 'Notes', ''].map(h => (
                    <th key={h} className="text-left text-gray-500 text-xs font-semibold uppercase tracking-wider px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(buyer => (
                  <BuyerRow key={buyer.id} buyer={buyer} onStatusChange={handleStatusChange} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filtered.length > 0 && (
          <p className="text-gray-600 text-xs mt-3 text-right">
            Showing {filtered.length} of {buyers.length} buyers · Click any row to expand
          </p>
        )}
      </main>

      {showAddModal && (
        <AddBuyerModal
          onClose={() => setShowAddModal(false)}
          onAdded={buyer => setBuyers(prev => [buyer, ...prev].sort((a, b) => a.name.localeCompare(b.name)))}
        />
      )}
    </div>
  );
}
