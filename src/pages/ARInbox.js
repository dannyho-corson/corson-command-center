import Nav from '../components/Nav';
import ProspectsTable from '../components/ProspectsTable';

// /ar-inbox — kept as a route after Phase 2.7.5 so old bookmarks resolve.
// The A&R nav link was removed; the same prospects table now lives as a
// "Hip Pocket & A&R" section on the Artists page (src/pages/ArtistList.js).
// Both surfaces render the shared <ProspectsTable /> component.
export default function ARInbox() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Nav />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-display font-bold">A&amp;R Inbox</h1>
            <p className="text-gray-500 text-sm mt-1">Track unsolicited touches so they don't die in email.</p>
          </div>
        </div>

        <ProspectsTable />
      </div>
    </div>
  );
}
