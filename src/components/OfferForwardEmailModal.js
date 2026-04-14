import { useState, useMemo, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// Build the offer-forward email sent to artist management when a buyer's
// offer comes in. Format:
//
//   To:      artist.manager_email
//   Subject: Offer In — [Artist] ([Date]) [City, State]
//   Body:    Yo [Manager], offer details, optional Danny notes, signature.

function formatDateDisplay(iso) {
  if (!iso) return 'TBD';
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function firstName(full) {
  if (!full) return 'there';
  return full.trim().split(/\s+/)[0];
}

function buildEmail(deal, artist, artistDisplayName, danNotes) {
  const dateStr = formatDateDisplay(deal.event_date);
  const cityState = deal.market || deal.city || 'TBD';
  const venue = deal.venue || 'TBD';
  const buyerLine = [deal.buyer, deal.buyer_company].filter(Boolean).join(' / ') || deal.promoter || 'TBD';
  const fee = deal.fee_offered || deal.fee || 'TBD';
  const dealType = deal.deal_type || '—';
  const notes = deal.notes || '—';

  const subject = `Offer In — ${artistDisplayName} (${dateStr}) ${cityState}`;
  const to = artist?.manager_email || '';
  const managerFirst = firstName(artist?.manager_name);

  const bodyLines = [
    `Yo ${managerFirst},`,
    '',
    `Offer came in for ${artistDisplayName}. Here are the details:`,
    '',
    `Date:         ${dateStr}`,
    `City/Market:  ${cityState}`,
    `Venue:        ${venue}`,
    `Promoter:     ${buyerLine}`,
    `Fee Offered:  ${fee}`,
    `Deal Type:    ${dealType}`,
    `Notes:        ${notes}`,
    '',
    'Let me know what you think. Happy to discuss.',
  ];

  if (danNotes && danNotes.trim()) {
    bodyLines.push('', '---', danNotes.trim());
  }

  bodyLines.push(
    '',
    'Danny',
    'Corson Agency',
    'dho@corsonagency.com',
  );

  return { subject, to, cc: '', body: bodyLines.join('\n') };
}

export default function OfferForwardEmailModal({ deal, artistDisplayName, onClose }) {
  const [artist, setArtist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(null);
  const [danNotes, setDanNotes] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('artists')
        .select('name, manager_name, manager_email, eu_agent, label')
        .eq('slug', deal.artist_slug)
        .single();
      if (!cancelled) {
        setArtist(data);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [deal.artist_slug]);

  const { subject, to, body } = useMemo(
    () => buildEmail(deal, artist, artistDisplayName, danNotes),
    [deal, artist, artistDisplayName, danNotes]
  );

  function copy(what, text) {
    navigator.clipboard.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(null), 2000);
  }

  function copyAll() {
    const full = [
      `To: ${to}`,
      `Subject: ${subject}`,
      '',
      body,
    ].join('\n');
    copy('all', full);
  }

  function openInMailClient() {
    const params = new URLSearchParams();
    params.set('subject', subject);
    params.set('body', body);
    const toParam = to ? encodeURIComponent(to) : '';
    window.location.href = `mailto:${toParam}?${params.toString()}`;
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4 py-6 overflow-y-auto"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl shadow-2xl my-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h3 className="text-white font-bold text-lg">Forward Offer — {artistDisplayName}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
        </div>

        {loading ? (
          <div className="px-6 py-8 text-gray-400 text-sm">Loading management contacts…</div>
        ) : (
          <div className="px-6 py-5 space-y-4">
            {/* To */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-gray-500 text-xs uppercase tracking-wider">To</label>
                <button onClick={() => copy('to', to)}
                  className="text-indigo-400 text-xs hover:text-indigo-300">
                  {copied === 'to' ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <div className="bg-gray-800 border border-gray-700 text-gray-300 text-sm font-mono rounded-lg px-3 py-2 break-all">
                {to || <span className="text-gray-600 italic">no manager_email on file — add in Edit Artist</span>}
              </div>
            </div>

            {/* Subject */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-gray-500 text-xs uppercase tracking-wider">Subject</label>
                <button onClick={() => copy('subject', subject)}
                  className="text-indigo-400 text-xs hover:text-indigo-300">
                  {copied === 'subject' ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <div className="bg-gray-800 border border-gray-700 text-white text-sm font-mono rounded-lg px-3 py-2 break-all">
                {subject}
              </div>
            </div>

            {/* My Notes — Danny's opinion, appended above signature */}
            <div>
              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">
                My Notes <span className="text-gray-600 normal-case">(appended to body, optional)</span>
              </label>
              <textarea
                value={danNotes}
                onChange={(e) => setDanNotes(e.target.value)}
                rows={3}
                placeholder="Your opinion on this offer — fee feels low, good promoter, radius conflict, etc."
                className="w-full bg-gray-800 border border-indigo-900/60 text-gray-200 text-sm rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-indigo-500 placeholder-gray-600"
              />
            </div>

            {/* Body preview */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-gray-500 text-xs uppercase tracking-wider">Body</label>
                <button onClick={() => copy('body', body)}
                  className="text-indigo-400 text-xs hover:text-indigo-300">
                  {copied === 'body' ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <textarea
                readOnly
                value={body}
                rows={16}
                className="w-full bg-gray-800 border border-gray-700 text-gray-200 text-sm font-mono rounded-lg px-3 py-2 resize-none focus:outline-none"
              />
            </div>
          </div>
        )}

        <div className="px-6 py-4 border-t border-gray-800 flex items-center justify-between gap-3">
          <button onClick={openInMailClient}
            className="text-gray-400 text-sm font-semibold px-4 py-2 rounded-lg border border-gray-700 hover:text-white hover:border-gray-500 transition-colors">
            Open in Mail Client
          </button>
          <div className="flex items-center gap-2">
            {copied === 'all' && <span className="text-emerald-400 text-xs">✓ Full email copied</span>}
            <button onClick={copyAll}
              className="text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
              style={{ backgroundColor: '#6366F1' }}>
              Copy Full Email
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
