#!/usr/bin/env node
/*
 * Triage urgent_issues (the "To Do" list) by staleness.
 *
 * Default: DRY RUN — no deletes. Prints classification.
 *
 * Flags:
 *   --apply-tier-1            delete Tier 1 only
 *   --apply-tier-1-and-2      delete Tier 1 + Tier 2
 *   --apply-all               alias for --apply-tier-1-and-2
 *
 * Today hardcoded as 2026-04-30 (per the brief).
 *
 * NEVER touched:
 *   - Tier 3 rows (always kept)
 *   - resolved=true rows (already cleared)
 *   - activity_log, pipeline, processed_emails (out of scope)
 */
const fs = require('fs');
const path = require('path');

const TODAY = '2026-04-30';
const TODAY_MS = new Date(TODAY + 'T00:00:00Z').getTime();
const DAY_MS = 86400000;

const args = new Set(process.argv.slice(2));
const APPLY_TIER_1   = args.has('--apply-tier-1') || args.has('--apply-tier-1-and-2') || args.has('--apply-all');
const APPLY_TIER_1_2 = args.has('--apply-tier-1-and-2') || args.has('--apply-all');

const ENV_PATH = path.join(__dirname, '.env');
const raw = fs.readFileSync(ENV_PATH, 'utf8');
const env = {};
for (const line of raw.split('\n')) {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
const { createClient } = require(path.join(__dirname, '..', 'node_modules/@supabase/supabase-js/dist/index.cjs'));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

// ── Helpers ─────────────────────────────────────────────────────────────────
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function ageDays(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  return Math.floor((Date.now() - t) / DAY_MS);
}

function ageDaysFrom(iso, ref = TODAY_MS) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  return Math.floor((ref - t) / DAY_MS);
}

function pad(s, n) {
  s = String(s ?? '');
  if (s.length >= n) return s.slice(0, n - 1) + '…';
  return s + ' '.repeat(n - s.length);
}

function shortId(id) { return String(id || '').slice(0, 8); }

// ── Loose date parser for issue text ────────────────────────────────────────
// Returns the most recent date *referenced* in the text, or null. Uses
// 2026 as the inferred year for bare M/D references.
const MONTH_NAMES = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
  apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
  aug: 7, august: 7, sep: 8, sept: 8, september: 8,
  oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};
function parseDatesInText(text) {
  if (!text || typeof text !== 'string') return [];
  const out = [];
  // M/D or M/D/YYYY
  const mdRe = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g;
  let m;
  while ((m = mdRe.exec(text)) !== null) {
    let mo = parseInt(m[1], 10);
    let d  = parseInt(m[2], 10);
    let y  = m[3] ? parseInt(m[3], 10) : 2026;
    if (y < 100) y += 2000;
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      out.push(new Date(Date.UTC(y, mo - 1, d)).getTime());
    }
  }
  // Month name + day  ("April 25", "Apr 25", "May 2nd")
  const monRe = /\b(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+(\d{1,2})(?:st|nd|rd|th)?\b/ig;
  while ((m = monRe.exec(text)) !== null) {
    const mo = MONTH_NAMES[m[1].toLowerCase()];
    const d  = parseInt(m[2], 10);
    if (mo !== undefined && d >= 1 && d <= 31) {
      out.push(new Date(Date.UTC(2026, mo, d)).getTime());
    }
  }
  return out;
}

// ── Standing concerns / always-keep heuristics ──────────────────────────────
const STANDING_PATTERNS = [
  /radius\s*clause/i,
  /\bECR\b/,
  /commission/i,
  /tax\b/i,
  /visa/i,                          // visa is process; recurring
  /\bUS\s*VISA\b/i,
  /\binternal\b/i,
];

function looksStanding(text) {
  if (!text) return false;
  return STANDING_PATTERNS.some(re => re.test(text));
}

const FOLLOWUP_PATTERNS = [/follow up/i, /check in/i, /confirm\b/i];

// ── Triage ──────────────────────────────────────────────────────────────────
(async () => {
  console.log(`Mode: ${APPLY_TIER_1_2 ? 'APPLY (Tier 1 + 2)' : APPLY_TIER_1 ? 'APPLY (Tier 1 only)' : 'DRY RUN'} · today = ${TODAY}\n`);

  // Pull unresolved urgent_issues
  const [{ data: urgents, error: uErr }, { data: shows, error: sErr }, { data: activity, error: aErr }] = await Promise.all([
    sb.from('urgent_issues').select('*').eq('resolved', false),
    sb.from('shows').select('artist_slug, event_date'),
    sb.from('activity_log').select('artist_slug, created_at'),
  ]);
  if (uErr) { console.error('urgent_issues select:', uErr.message); process.exit(1); }
  if (sErr) { console.error('shows select:', sErr.message); process.exit(1); }
  if (aErr) { console.error('activity_log select:', aErr.message); process.exit(1); }

  // Index activity_log by artist_slug → most recent created_at
  const lastActivityByArtist = new Map();
  for (const a of activity) {
    if (!a.artist_slug || !a.created_at) continue;
    const t = new Date(a.created_at).getTime();
    if (isNaN(t)) continue;
    const prev = lastActivityByArtist.get(a.artist_slug);
    if (!prev || t > prev) lastActivityByArtist.set(a.artist_slug, t);
  }

  // Index shows by artist_slug → array of event_date timestamps
  const showsByArtist = new Map();
  for (const s of shows) {
    if (!s.artist_slug || !s.event_date || !ISO_DATE.test(s.event_date)) continue;
    const t = new Date(s.event_date + 'T00:00:00Z').getTime();
    if (isNaN(t)) continue;
    if (!showsByArtist.has(s.artist_slug)) showsByArtist.set(s.artist_slug, []);
    showsByArtist.get(s.artist_slug).push(t);
  }

  const tier1 = [], tier2 = [], tier3 = [];

  for (const row of urgents) {
    const created = row.created_at ? new Date(row.created_at).getTime() : null;
    const age = created ? Math.floor((Date.now() - created) / DAY_MS) : null;
    const text = (row.task || row.issue || '').toString();
    const lastActivity = lastActivityByArtist.get(row.artist_slug) || null;
    const daysSinceActivity = lastActivity ? Math.floor((Date.now() - lastActivity) / DAY_MS) : null;

    // ── Tier 1 checks ────────────────────────────────────────────────────
    let t1Reason = null;

    // (1a) Issue text matches an artist + show in shows where event_date < today
    if (showsByArtist.has(row.artist_slug)) {
      const shows = showsByArtist.get(row.artist_slug);
      const allPast = shows.every(t => t < TODAY_MS);
      const anyPast = shows.some(t => t < TODAY_MS);
      // Conservative: only flag if EVERY known show for this artist is in the past
      // AND the issue text references one of them by date. This avoids false positives
      // for artists with multiple shows.
      if (anyPast) {
        const datesInText = parseDatesInText(text);
        const matchesPastShow = datesInText.some(td =>
          shows.some(sd => Math.abs(sd - td) <= DAY_MS) && td < TODAY_MS
        );
        if (matchesPastShow) {
          t1Reason = 'matches past show in shows table';
        }
      }
    }

    // (1b) Parseable date in text < today, with no future date alongside it.
    // Standing-concern keywords (visa, ECR, etc.) override — those reference
    // process dates that don't expire when the date passes.
    if (!t1Reason && !looksStanding(text)) {
      const datesInText = parseDatesInText(text);
      if (datesInText.length > 0) {
        const anyFuture = datesInText.some(t => t >= TODAY_MS);
        const allPast   = datesInText.every(t => t < TODAY_MS);
        if (allPast && !anyFuture) {
          t1Reason = 'all dates referenced are in the past';
        }
      }
    }

    // (1c) created_at > 60 days ago AND no related activity_log in last 30 days
    if (!t1Reason && age !== null && age > 60) {
      if (daysSinceActivity === null || daysSinceActivity > 30) {
        t1Reason = `created ${age}d ago + no activity for this artist in 30d+`;
      }
    }

    if (t1Reason) {
      tier1.push({ ...row, _age: age, _reason: t1Reason });
      continue;
    }

    // ── Tier 2 checks ────────────────────────────────────────────────────
    let t2Reason = null;

    // (2a) created_at > 30 days ago AND priority is null/yellow/green (not red)
    const pri = (row.priority || '').toLowerCase();
    const isRed = pri === 'red' || pri === 'high';   // brief uses color; data uses High/Medium/Low
    if (age !== null && age > 30 && !isRed) {
      t2Reason = `created ${age}d ago and priority=${row.priority || 'null'} (not red/high)`;
    }

    // (2b) text contains follow up / check in / confirm referencing dates older than 14 days
    if (!t2Reason) {
      const isFollowup = FOLLOWUP_PATTERNS.some(re => re.test(text));
      if (isFollowup) {
        const datesInText = parseDatesInText(text);
        const oldest = datesInText.length ? Math.min(...datesInText) : null;
        const daysOld = oldest ? Math.floor((TODAY_MS - oldest) / DAY_MS) : null;
        if (daysOld !== null && daysOld > 14) {
          t2Reason = `follow-up phrasing referencing date ${daysOld}d ago`;
        }
      }
    }

    // (2c) no activity in 14d AND created > 21d ago
    if (!t2Reason && age !== null && age > 21) {
      if (daysSinceActivity === null || daysSinceActivity > 14) {
        t2Reason = `created ${age}d ago + no activity for this artist in 14d+`;
      }
    }

    if (t2Reason) {
      tier2.push({ ...row, _age: age, _reason: t2Reason });
      continue;
    }

    // ── Tier 3 = keep ────────────────────────────────────────────────────
    tier3.push({ ...row, _age: age });
  }

  // ── Print ────────────────────────────────────────────────────────────────
  function printTable(label, rows) {
    console.log(`\n── ${label} (${rows.length}) ──`);
    if (rows.length === 0) { console.log('  (none)'); return; }
    console.log(`| ${pad('id', 8)} | ${pad('artist_slug', 18)} | ${pad('age', 4)} | ${pad('priority', 8)} | ${pad('issue / task', 60)} | reason`);
    for (const r of rows) {
      const text = (r.task || r.issue || '').replace(/\s+/g, ' ').trim();
      console.log(
        `| ${pad(shortId(r.id), 8)} | ${pad(r.artist_slug, 18)} | ${pad(r._age + 'd', 4)} | ${pad(r.priority, 8)} | ${pad(text, 60)} | ${r._reason}`
      );
    }
  }

  printTable('TIER 1 — definitely delete', tier1);
  printTable('TIER 2 — probably delete', tier2);
  console.log(`\n── TIER 3 — keeping (${tier3.length}) ──`);
  console.log('  (count only, not listed)');

  const total = urgents.length;
  const flagged = tier1.length + tier2.length;
  const pct = total ? Math.round((flagged / total) * 100) : 0;

  console.log(`\nSummary — Tier 1: ${tier1.length} · Tier 2: ${tier2.length} · Tier 3 (keeping): ${tier3.length}`);
  console.log(`Total unresolved: ${total} · Flagged for delete: ${flagged} (${pct}%)`);

  // Sanity guards before any apply
  const dangerouslyHigh = pct > 75;
  const youngFlagged = [...tier1, ...tier2].filter(r => r._age !== null && r._age < 7);

  if (dangerouslyHigh) {
    console.log(`\n⚠ Flag: ${pct}% of urgent_issues would be deleted. Review carefully.`);
  }
  if (youngFlagged.length) {
    console.log(`\n⚠ Flag: ${youngFlagged.length} flagged rows are <7 days old:`);
    for (const r of youngFlagged) {
      console.log(`  ! ${shortId(r.id)} (${r._age}d) ${r.artist_slug} — ${r._reason}`);
    }
  }

  if (!APPLY_TIER_1) {
    console.log('\nDRY RUN — no changes made. Re-run with --apply-tier-1 or --apply-tier-1-and-2.');
    process.exit(0);
  }

  // APPLY
  const toDelete = APPLY_TIER_1_2 ? [...tier1, ...tier2] : tier1;
  console.log(`\nApplying — deleting ${toDelete.length} rows…`);
  let deleted = 0, errs = 0;
  for (const r of toDelete) {
    const { error } = await sb.from('urgent_issues').delete().eq('id', r.id);
    if (error) {
      console.error(`  ERR ${shortId(r.id)}: ${error.message}`);
      errs++;
    } else {
      deleted++;
    }
  }
  console.log(`Done. deleted=${deleted} errors=${errs}`);
})();
