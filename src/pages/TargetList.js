import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import Nav from '../components/Nav';

// ── STATUS CONFIG ─────────────────────────────────────────────────────────────
const STATUS_OPTIONS = ['To Pitch', 'Active', 'Warm', 'Confirmed', 'Dead'];

const STATUS_STYLE = {
  Confirmed: 'bg-emerald-900 text-emerald-300 border-emerald-700',
  Active:    'bg-yellow-900 text-yellow-300 border-yellow-700',
  Warm:      'bg-yellow-900 text-yellow-300 border-yellow-700',
  'To Pitch':'bg-gray-800 text-gray-400 border-gray-700',
  Dead:      'bg-red-900 text-red-400 border-red-800',
};

function StatusBadge({ status }) {
  const cls = STATUS_STYLE[status] || STATUS_STYLE['To Pitch'];
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${cls}`}>
      {status}
    </span>
  );
}

// ── ADD TARGET MODAL ──────────────────────────────────────────────────────────
const EMPTY = { promoter: '', contact: '', market: '', outreach_date: '', status: 'To Pitch', notes: '' };

function AddTargetModal({ artistSlug, onClose, onAdded }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.promoter) { setErr('Promoter is required.'); return; }
    setSaving(true); setErr(null);
    const payload = {
      artist_slug: artistSlug,
      promoter: form.promoter,
      contact: form.contact || null,
      market: form.market || null,
      outreach_date: form.outreach_date || null,
      status: form.status,
      notes: form.notes || null,
    };
    const { data, error } = await supabase.from('targets').insert(payload).select().single();
    if (error) { setErr(error.message); setSaving(false); return; }
    onAdded(data);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h3 className="text-white font-bold text-lg">Add Target</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">
                Promoter <span className="text-red-400">*</span>
              </label>
              <input type="text" value={form.promoter} onChange={e => set('promoter', e.target.value)}
                placeholder="e.g. Domicile Miami"
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600" required />
            </div>
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Contact</label>
              <input type="text" value={form.contact} onChange={e => set('contact', e.target.value)}
                placeholder="Name or email"
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
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Outreach Date</label>
              <input type="date" value={form.outreach_date} onChange={e => set('outreach_date', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500" />
            </div>
          </div>

          <div>
            <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Status</label>
            <select value={form.status} onChange={e => set('status', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500">
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              placeholder="Any relevant notes..."
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
              {saving ? 'Saving…' : 'Add Target'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── PAGE ──────────────────────────────────────────────────────────────────────
export default function TargetList() {
  const { slug } = useParams();
  const [artist, setArtist] = useState(null);
  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [aRes, tRes] = await Promise.all([
          supabase.from('artists').select('id, name, slug, genre, base').eq('slug', slug).single(),
          supabase.from('targets').select('*').eq('artist_slug', slug).order('outreach_date', { ascending: false }),
        ]);
        if (aRes.error) throw aRes.error;
        if (tRes.error) throw tRes.error;
        setArtist(aRes.data);
        setTargets(tRes.data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [slug]);

  const filtered = filterStatus ? targets.filter(t => t.status === filterStatus) : targets;

  // Status counts for filter pills
  const counts = STATUS_OPTIONS.reduce((acc, s) => {
    acc[s] = targets.filter(t => t.status === s).length;
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
          <Link to="/artists" className="hover:text-white transition-colors">Artists</Link>
          <span>/</span>
          <Link to={`/artists/${slug}`} className="hover:text-white transition-colors">{artist?.name ?? slug}</Link>
          <span>/</span>
          <span className="text-gray-300">Target List</span>
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
            <h2 className="text-2xl font-bold text-white">
              {loading ? '…' : `${artist?.name} — Target List`}
            </h2>
            <p className="text-gray-500 text-sm mt-1">
              {loading ? '' : `${targets.length} targets · ${artist?.genre}`}
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg text-white self-start sm:self-auto"
            style={{ backgroundColor: '#6366F1' }}
          >
            + Add Target
          </button>
        </div>

        {/* Status filter pills */}
        {!loading && targets.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-5">
            <button
              onClick={() => setFilterStatus('')}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                filterStatus === ''
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'border-gray-700 text-gray-400 hover:border-gray-500'
              }`}
            >
              All ({targets.length})
            </button>
            {STATUS_OPTIONS.filter(s => counts[s] > 0).map(s => (
              <button
                key={s}
                onClick={() => setFilterStatus(s === filterStatus ? '' : s)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  filterStatus === s
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'border-gray-700 text-gray-400 hover:border-gray-500'
                }`}
              >
                {s} ({counts[s]})
              </button>
            ))}
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="bg-gray-900 rounded-xl border border-gray-800 animate-pulse h-64" />
        ) : filtered.length === 0 ? (
          <div className="bg-gray-900 rounded-xl border border-gray-800 px-5 py-12 text-center">
            <p className="text-gray-500 text-sm">
              {targets.length === 0
                ? 'No targets yet — add your first buyer to pitch.'
                : 'No targets match this filter.'}
            </p>
          </div>
        ) : (
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Promoter', 'Contact', 'Market', 'Outreach Date', 'Status', 'Notes'].map(h => (
                    <th key={h} className="text-left text-gray-500 text-xs font-semibold uppercase tracking-wider px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => {
                  const rowBg =
                    t.status === 'Confirmed' ? 'bg-emerald-950/10 hover:bg-emerald-950/20' :
                    t.status === 'Active' || t.status === 'Warm' ? 'bg-yellow-950/10 hover:bg-yellow-950/20' :
                    t.status === 'Dead' ? 'bg-red-950/10 hover:bg-red-950/20' :
                    'hover:bg-gray-800/40';
                  const fmtOutreach = t.outreach_date
                    ? new Date(t.outreach_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : '—';
                  return (
                    <tr key={t.id} className={`border-b border-gray-800 last:border-0 transition-colors ${rowBg}`}>
                      <td className="px-5 py-3.5 text-white font-semibold">{t.promoter}</td>
                      <td className="px-5 py-3.5 text-gray-400">{t.contact || '—'}</td>
                      <td className="px-5 py-3.5 text-gray-300">{t.market || '—'}</td>
                      <td className="px-5 py-3.5 text-gray-400 whitespace-nowrap">{fmtOutreach}</td>
                      <td className="px-5 py-3.5"><StatusBadge status={t.status} /></td>
                      <td className="px-5 py-3.5 text-gray-500 max-w-xs truncate">{t.notes || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Back button */}
        <div className="mt-6">
          <Link to={`/artists/${slug}`}
            className="text-gray-400 hover:text-white text-sm transition-colors">
            ← Back to {artist?.name ?? slug}
          </Link>
        </div>
      </main>

      {showModal && (
        <AddTargetModal
          artistSlug={slug}
          onClose={() => setShowModal(false)}
          onAdded={t => setTargets(prev => [t, ...prev])}
        />
      )}
    </div>
  );
}
