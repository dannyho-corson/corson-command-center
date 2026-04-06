import './App.css';

// ── KPI DATA ──────────────────────────────────────────────────────────────────
const kpis = [
  {
    label: 'Roster Artists',
    value: '29',
    sub: '11 priority · 18 full roster',
    icon: '🎧',
    color: 'indigo',
  },
  {
    label: 'Active Deals',
    value: '24',
    sub: 'Across all pipeline stages',
    icon: '📋',
    color: 'blue',
  },
  {
    label: 'Urgent Issues',
    value: '5',
    sub: 'Require action today',
    icon: '🚨',
    color: 'red',
  },
  {
    label: '2026 Commission',
    value: '$25,295',
    sub: "Danny's 60% share YTD",
    icon: '💰',
    color: 'green',
  },
];

// ── URGENT ISSUES ─────────────────────────────────────────────────────────────
const urgentIssues = [
  {
    severity: 'red',
    label: 'CONFLICT',
    artist: 'CLAWZ',
    issue:
      'Buyer pushing LA show June 12 — VIOLATES EDC LV radius clause (active until Aug 15). Reject immediately.',
  },
  {
    severity: 'red',
    label: 'OVERDUE',
    artist: 'SHOGUN',
    issue:
      'Domicile Miami contract unsigned — 72-hr deadline passed 2 days ago. Chase buyer now.',
  },
  {
    severity: 'yellow',
    label: 'FOLLOW UP',
    artist: 'MAD DOG',
    issue:
      'NYC offer at $3,500 — below floor of $4,000. Counter or decline pending artist approval.',
  },
  {
    severity: 'yellow',
    label: 'FOLLOW UP',
    artist: 'JUNKIE KID',
    issue:
      'Tomorrowland routing — need HGR details from VEOP by EOD for festival advance.',
  },
  {
    severity: 'yellow',
    label: 'ACTION',
    artist: 'DRAKK',
    issue:
      'Buyer communicated offer via WhatsApp only. Push to email — nothing is real until written offer received.',
  },
];

// ── PIPELINE SNAPSHOT ─────────────────────────────────────────────────────────
const pipeline = [
  {
    artist: 'CLAWZ',
    event: 'EDC Las Vegas — Wasteland',
    date: 'May 16–18, 2026',
    buyer: 'Insomniac',
    fee: '$3,500',
    stage: 'Contracted',
    stageColor: 'green',
  },
  {
    artist: 'HELLBOUND!',
    event: 'Vancouver — Kayzo Support',
    date: 'Jun 2026',
    buyer: 'Independent',
    fee: 'TBD',
    stage: 'Confirmed',
    stageColor: 'green',
  },
  {
    artist: 'SHOGUN',
    event: 'Ground Zero Miami',
    date: 'Jul 4, 2026',
    buyer: 'Domicile Miami',
    fee: '$2,200',
    stage: 'Confirmed',
    stageColor: 'green',
  },
  {
    artist: 'MAD DOG',
    event: 'New York City Club',
    date: 'Aug 2026',
    buyer: 'Bunker NYC',
    fee: '$3,500',
    stage: 'Negotiating',
    stageColor: 'yellow',
  },
  {
    artist: 'ANIME',
    event: 'Dallas Hard Techno Festival',
    date: 'Sep 2026',
    buyer: 'Trinity / Sxtcy',
    fee: '$5,000',
    stage: 'Negotiating',
    stageColor: 'yellow',
  },
  {
    artist: 'JUNKIE KID',
    event: 'Tomorrowland',
    date: 'Jul 2026',
    buyer: 'Tomorrowland NV',
    fee: '$6,000',
    stage: 'Advanced',
    stageColor: 'green',
  },
  {
    artist: 'DRAKK',
    event: 'San Francisco Warehouse',
    date: 'May 2026',
    buyer: 'Bounce SF',
    fee: '$2,000',
    stage: 'Offer In',
    stageColor: 'yellow',
  },
  {
    artist: 'MORELIA',
    event: 'London Underground',
    date: 'Jun 2026',
    buyer: 'UK Promoter',
    fee: '£2,500',
    stage: 'Offer In',
    stageColor: 'yellow',
  },
  {
    artist: 'TRIPTYKH',
    event: 'Denver Hard Techno',
    date: 'Aug 2026',
    buyer: 'Local Promoter',
    fee: '$1,800',
    stage: 'Request',
    stageColor: 'gray',
  },
  {
    artist: 'DR. GRECO',
    event: 'Miami Avail Check',
    date: 'Oct 2026',
    buyer: 'Domicile Miami',
    fee: 'TBD',
    stage: 'Inquiry',
    stageColor: 'gray',
  },
];

// ── STAGE BADGE ───────────────────────────────────────────────────────────────
function StageBadge({ stage, color }) {
  const classes = {
    green: 'bg-emerald-900 text-emerald-300 border border-emerald-700',
    yellow: 'bg-yellow-900 text-yellow-300 border border-yellow-700',
    red: 'bg-red-900 text-red-300 border border-red-700',
    gray: 'bg-gray-800 text-gray-400 border border-gray-700',
  };
  return (
    <span
      className={`px-2 py-0.5 rounded text-xs font-semibold ${
        classes[color] || classes.gray
      }`}
    >
      {stage}
    </span>
  );
}

// ── SEVERITY BADGE ────────────────────────────────────────────────────────────
function SeverityBadge({ severity, label }) {
  const classes = {
    red: 'bg-red-600 text-white',
    yellow: 'bg-yellow-600 text-white',
  };
  return (
    <span
      className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${classes[severity]}`}
    >
      {label}
    </span>
  );
}

// ── KPI CARD ──────────────────────────────────────────────────────────────────
function KpiCard({ kpi }) {
  const borderColors = {
    indigo: 'border-indigo-500',
    blue: 'border-blue-500',
    red: 'border-red-500',
    green: 'border-emerald-500',
  };
  const valueColors = {
    indigo: 'text-indigo-400',
    blue: 'text-blue-400',
    red: 'text-red-400',
    green: 'text-emerald-400',
  };
  return (
    <div
      className={`bg-gray-900 rounded-xl p-6 border-l-4 ${borderColors[kpi.color]} flex flex-col gap-1`}
    >
      <div className="flex items-center justify-between">
        <span className="text-gray-400 text-sm font-medium uppercase tracking-wider">
          {kpi.label}
        </span>
        <span className="text-2xl">{kpi.icon}</span>
      </div>
      <div className={`text-4xl font-bold mt-1 ${valueColors[kpi.color]}`}>
        {kpi.value}
      </div>
      <div className="text-gray-500 text-xs mt-1">{kpi.sub}</div>
    </div>
  );
}

// ── APP ───────────────────────────────────────────────────────────────────────
function App() {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="min-h-screen text-white" style={{ backgroundColor: '#111827' }}>

      {/* ── TOP NAV ── */}
      <nav className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: '#6366F1' }}
            >
              <span className="text-white font-bold text-sm">CC</span>
            </div>
            <div>
              <h1 className="text-white font-bold text-lg tracking-widest uppercase">
                Corson Command Center
              </h1>
              <p className="text-gray-500 text-xs tracking-wide">
                Corson Agency · Hard Techno Division
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-white text-sm font-semibold">Danny Ho</p>
              <p className="text-gray-500 text-xs">dho@corsonagency.com</p>
            </div>
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm text-white flex-shrink-0"
              style={{ backgroundColor: '#6366F1' }}
            >
              DH
            </div>
          </div>
        </div>
      </nav>

      {/* ── MAIN CONTENT ── */}
      <main className="max-w-7xl mx-auto px-6 py-8">

        {/* Page Header */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white">Dashboard Overview</h2>
          <p className="text-gray-500 text-sm mt-1">{dateStr}</p>
        </div>

        {/* ── KPI CARDS ── */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {kpis.map((kpi) => (
            <KpiCard key={kpi.label} kpi={kpi} />
          ))}
        </section>

        {/* ── URGENT ISSUES ── */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-lg font-bold text-white">Urgent Issues</h3>
            <span className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              5
            </span>
          </div>

          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            {urgentIssues.map((item, i) => (
              <div
                key={i}
                className={`flex items-start gap-4 px-5 py-4 ${
                  i < urgentIssues.length - 1 ? 'border-b border-gray-800' : ''
                } ${
                  item.severity === 'red'
                    ? 'bg-red-950/20'
                    : 'bg-yellow-950/10'
                }`}
              >
                {/* Left severity bar */}
                <div
                  className={`w-1 self-stretch rounded-full flex-shrink-0 ${
                    item.severity === 'red' ? 'bg-red-500' : 'bg-yellow-500'
                  }`}
                />

                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <SeverityBadge severity={item.severity} label={item.label} />
                    <span className="text-white font-bold text-sm">
                      {item.artist}
                    </span>
                  </div>
                  <p className="text-gray-400 text-sm leading-relaxed">
                    {item.issue}
                  </p>
                </div>

                <button
                  className={`flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                    item.severity === 'red'
                      ? 'border-red-600 text-red-400 hover:bg-red-600 hover:text-white'
                      : 'border-yellow-600 text-yellow-400 hover:bg-yellow-600 hover:text-white'
                  }`}
                >
                  Resolve
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* ── PIPELINE SNAPSHOT ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white">
              Active Pipeline Snapshot
            </h3>
            <span className="text-gray-500 text-sm">{pipeline.length} deals</span>
          </div>

          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Artist', 'Event', 'Date', 'Buyer', 'Fee', 'Stage'].map(
                    (h) => (
                      <th
                        key={h}
                        className="text-left text-gray-500 font-semibold uppercase tracking-wider text-xs px-5 py-3 first:pl-5"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {pipeline.map((row, i) => (
                  <tr
                    key={i}
                    className="border-b border-gray-800 last:border-0 hover:bg-gray-800/50 transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      <span className="font-bold text-white">{row.artist}</span>
                    </td>
                    <td className="px-5 py-3.5 text-gray-300">{row.event}</td>
                    <td className="px-5 py-3.5 text-gray-400 whitespace-nowrap">
                      {row.date}
                    </td>
                    <td className="px-5 py-3.5 text-gray-400">{row.buyer}</td>
                    <td className="px-5 py-3.5 font-semibold text-emerald-400">
                      {row.fee}
                    </td>
                    <td className="px-5 py-3.5">
                      <StageBadge stage={row.stage} color={row.stageColor} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── FOOTER ── */}
        <footer className="mt-10 pt-6 border-t border-gray-800 text-center">
          <p className="text-gray-600 text-xs tracking-wide">
            CORSON COMMAND CENTER · Corson Agency · Hard Techno Division · Danny
            Ho (Johnny Blaze)
          </p>
        </footer>
      </main>
    </div>
  );
}

export default App;
