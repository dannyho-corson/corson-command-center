#!/usr/bin/env node
/*
 * get-avails.js — list open Fri/Sat weekend slots for one or more artists.
 *
 *   node scripts/get-avails.js --artists shogun,anoluxx,mad-dog --from 2026-05-01 --to 2026-12-31
 *
 * A weekend slot (Fri + Sat) is reported as OPEN only if neither day is
 * blocked by a confirmed show OR any pipeline deal.
 *
 * Also exported as a module so scripts/send-avails.js can reuse the logic:
 *   const { getAvails, formatAvailsText, formatAvailsHtml } = require('./get-avails');
 */
const fs = require('fs');
const path = require('path');

const PROJECT = path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
const env = {};
for (const line of raw.split('\n')) { const i = line.indexOf('='); if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
const { createClient } = require(path.join(PROJECT, 'node_modules/@supabase/supabase-js/dist/index.cjs'));
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

// Per-artist availability caveats — rendered under the heading when relevant.
// Extend as the roster's tour windows shift.
const AVAILABILITY_NOTES = {
  'mad-dog':  'Based in EU — limited US tour windows (typically Jul-Sep).',
  'ketting':  'EU-based LIVE artist — different tech/production needs; shorter US windows.',
  'anime':    'EU-based — limited US availability.',
  'mandy':    'EU-based — US runs tend to cluster around festival season.',
};

// ── argv parsing ────────────────────────────────────────────────────────────
function parseArgv(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      out[key] = val;
    }
  }
  return out;
}

// ── date helpers ───────────────────────────────────────────────────────────
function parseISO(s) { return new Date(s + 'T00:00:00'); }
function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function prettyDate(d) {
  return `${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}, ${d.getFullYear()}`;
}
function rangeHeading(fromISO, toISO) {
  const f = parseISO(fromISO), t = parseISO(toISO);
  const sameYear = f.getFullYear() === t.getFullYear();
  return sameYear
    ? `${MONTHS[f.getMonth()]}–${MONTHS[t.getMonth()]} ${f.getFullYear()}`
    : `${MONTHS[f.getMonth()]} ${f.getFullYear()}–${MONTHS[t.getMonth()]} ${t.getFullYear()}`;
}

function friSatPairsIn(fromISO, toISO) {
  const out = [];
  const end = parseISO(toISO);
  const d = parseISO(fromISO);
  // Advance d to next Friday
  while (d.getDay() !== 5 && d <= end) d.setDate(d.getDate() + 1);
  while (d <= end) {
    const fri = new Date(d);
    const sat = new Date(d); sat.setDate(sat.getDate() + 1);
    if (sat > end) break;
    out.push({ fri, sat });
    d.setDate(d.getDate() + 7);
  }
  return out;
}

// ── core: fetch blocked dates per artist from Supabase ─────────────────────
async function blockedDatesForArtist(slug, fromISO, toISO) {
  const [{ data: shows, error: sErr }, { data: pipe, error: pErr }] = await Promise.all([
    supabase.from('shows').select('event_date').eq('artist_slug', slug).gte('event_date', fromISO).lte('event_date', toISO),
    supabase.from('pipeline').select('event_date').eq('artist_slug', slug).gte('event_date', fromISO).lte('event_date', toISO),
  ]);
  const errs = [sErr, pErr].filter(Boolean).map(e => e.message);
  const dates = new Set();
  [...(shows || []), ...(pipe || [])].forEach(r => { if (r.event_date) dates.add(r.event_date); });
  return { blocked: dates, errs };
}

async function loadArtistNames(slugs) {
  const { data } = await supabase.from('artists').select('slug, name').in('slug', slugs);
  const m = {};
  (data || []).forEach(r => { m[r.slug] = r.name; });
  return m;
}

async function getAvails(slugs, fromISO, toISO) {
  const names = await loadArtistNames(slugs);
  const heading = rangeHeading(fromISO, toISO);
  const pairs = friSatPairsIn(fromISO, toISO);

  const results = [];
  for (const slug of slugs) {
    const { blocked, errs } = await blockedDatesForArtist(slug, fromISO, toISO);
    const available = pairs.filter(({ fri, sat }) => !blocked.has(isoDate(fri)) && !blocked.has(isoDate(sat)));
    results.push({
      slug,
      displayName: (names[slug] || slug).toUpperCase(),
      note: AVAILABILITY_NOTES[slug] || null,
      available,
      blockedCount: blocked.size,
      errs,
    });
  }
  return { heading, results };
}

// ── formatters ─────────────────────────────────────────────────────────────
function formatAvailsText({ heading, results }) {
  const lines = [];
  for (const r of results) {
    lines.push(`${r.displayName} — Available Fri/Sat (${heading})`);
    if (r.note) lines.push(`  ⚠ ${r.note}`);
    if (r.available.length === 0) {
      lines.push(`  (No open Fri/Sat pairs in this range — ${r.blockedCount} blocked dates)`);
    } else {
      for (const { fri, sat } of r.available) {
        lines.push(`  ${prettyDate(fri)} & ${prettyDate(sat)}`);
      }
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

function formatAvailsHtml({ heading, results }) {
  const parts = [];
  parts.push(`<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #111;">`);
  for (const r of results) {
    parts.push(`<h3 style="margin: 18px 0 4px 0; color: #111;">${escapeHtml(r.displayName)} — Available Fri/Sat <span style="font-weight: normal; color: #666;">(${escapeHtml(heading)})</span></h3>`);
    if (r.note) parts.push(`<p style="margin: 2px 0 6px 0; color: #a36400;">⚠ ${escapeHtml(r.note)}</p>`);
    if (r.available.length === 0) {
      parts.push(`<p style="margin: 4px 0; color: #666;">No open Fri/Sat pairs in this range.</p>`);
    } else {
      parts.push('<ul style="margin: 4px 0; padding-left: 22px;">');
      for (const { fri, sat } of r.available) {
        parts.push(`<li>${escapeHtml(prettyDate(fri))} &amp; ${escapeHtml(prettyDate(sat))}</li>`);
      }
      parts.push('</ul>');
    }
  }
  parts.push(`</div>`);
  return parts.join('\n');
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// ── CLI entry ──────────────────────────────────────────────────────────────
if (require.main === module) {
  const args = parseArgv(process.argv.slice(2));
  const slugs = (args.artists || '').split(',').map(s => s.trim()).filter(Boolean);
  const from = args.from || null;
  const to   = args.to   || null;
  if (!slugs.length || !from || !to) {
    console.error('Usage: node scripts/get-avails.js --artists slug1,slug2 --from YYYY-MM-DD --to YYYY-MM-DD');
    process.exit(2);
  }
  getAvails(slugs, from, to).then(payload => {
    console.log(formatAvailsText(payload));
    const missing = payload.results.filter(r => r.errs.length);
    if (missing.length) {
      console.error('\nQuery errors:');
      for (const r of missing) console.error(`  ${r.slug}: ${r.errs.join('; ')}`);
    }
  }).catch(e => { console.error('fatal:', e.message); process.exit(1); });
}

module.exports = { getAvails, formatAvailsText, formatAvailsHtml };
