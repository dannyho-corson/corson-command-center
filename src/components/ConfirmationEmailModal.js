import { useState, useMemo, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// Build the Corson-standard confirmation email from a deal + artist row.
//
// Subject format:  CONFIRMED: Artist (MM-DD-YYYY) City, State [Venue]
// CC:              artist management + agents
// BCC:             bookings@corsonagency.com
// 72-hour contract return deadline in body.

function formatDateMMDDYYYY(iso) {
  if (!iso) return 'TBD';
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  if (isNaN(d.getTime())) return iso;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}-${dd}-${d.getFullYear()}`;
}

function buildEmail(deal, artist, artistDisplayName) {
  const dateStr = formatDateMMDDYYYY(deal.event_date);
  const cityState = deal.market || deal.city || 'TBD';
  const venue = deal.venue || 'TBD';
  const promoter = deal.buyer_company || deal.buyer || deal.promoter || 'TBD';
  const fee = deal.fee_offered || deal.fee || 'TBD';

  const subject = `CONFIRMED: ${artistDisplayName} (${dateStr}) ${cityState} [${venue}]`;

  // Build CC list from artist management fields
  const ccList = [];
  if (artist?.manager_email) ccList.push(artist.manager_email);
  if (artist?.eu_agent && artist.eu_agent.includes('@')) ccList.push(artist.eu_agent);

  const cc = ccList.join(', ');
  const bcc = 'bookings@corsonagency.com';

  const body = [
    `Hi ${promoter.split(/[\s,/]/)[0] || 'team'},`,
    '',
    `Confirming ${artistDisplayName} for your event — details below:`,
    '',
    `  Artist:      ${artistDisplayName}`,
    `  Date:        ${dateStr}`,
    `  City:        ${cityState}`,
    `  Venue:       ${venue}`,
    `  Promoter:    ${promoter}`,
    `  Fee:         ${fee}`,
    deal.hold_number ? `  Hold #:      ${deal.hold_number}` : null,
    deal.deal_type ? `  Deal Type:   ${deal.deal_type}` : null,
    '',
    'Gigwell contract will be sent shortly — please return within 72 hours to lock the date.',
    '50% deposit invoiced on contract execution per standard terms.',
    '',
    'No public announcement until deposit clears, per agency policy.',
    deal.notes ? `\nNotes: ${deal.notes}` : '',
    '',
    'Looking forward to a great show.',
    '',
    'Best,',
    'Danny Ho',
    'Corson Agency',
    'dho@corsonagency.com',
  ].filter(Boolean).join('\n');

  return { subject, cc, bcc, body };
}

export default function ConfirmationEmailModal({ deal, artistDisplayName, onClose }) {
  const [artist, setArtist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(null);

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

  const { subject, cc, bcc, body } = useMemo(
    () => buildEmail(deal, artist, artistDisplayName),
    [deal, artist, artistDisplayName]
  );

  function copy(what, text) {
    navigator.clipboard.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(null), 2000);
  }

  function copyAll() {
    const full = [
      `Subject: ${subject}`,
      `CC: ${cc}`,
      `BCC: ${bcc}`,
      '',
      body,
    ].join('\n');
    copy('all', full);
  }

  function openInMailClient() {
    const params = new URLSearchParams();
    params.set('subject', subject);
    if (cc) params.set('cc', cc);
    if (bcc) params.set('bcc', bcc);
    params.set('body', body);
    window.location.href = `mailto:?${params.toString()}`;
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4 py-6 overflow-y-auto"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl shadow-2xl my-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h3 className="text-white font-bold text-lg">Confirmation Email — {artistDisplayName}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
        </div>

        {loading ? (
          <div className="px-6 py-8 text-gray-400 text-sm">Loading management contacts…</div>
        ) : (
          <div className="px-6 py-5 space-y-4">
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

            {/* CC */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-gray-500 text-xs uppercase tracking-wider">CC</label>
                <button onClick={() => copy('cc', cc)}
                  className="text-indigo-400 text-xs hover:text-indigo-300">
                  {copied === 'cc' ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <div className="bg-gray-800 border border-gray-700 text-gray-300 text-sm font-mono rounded-lg px-3 py-2 break-all">
                {cc || <span className="text-gray-600 italic">no management emails on file — add in Edit Artist</span>}
              </div>
            </div>

            {/* BCC */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-gray-500 text-xs uppercase tracking-wider">BCC</label>
                <button onClick={() => copy('bcc', bcc)}
                  className="text-indigo-400 text-xs hover:text-indigo-300">
                  {copied === 'bcc' ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <div className="bg-gray-800 border border-gray-700 text-gray-300 text-sm font-mono rounded-lg px-3 py-2">
                {bcc}
              </div>
            </div>

            {/* Body */}
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
                rows={14}
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
