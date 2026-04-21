#!/usr/bin/env node
/*
 * One-time import: seed historical + planned confirmed shows from each
 * artist's Excel touring grid into Supabase `shows`.
 *
 * This is one of the two documented exceptions to the "Supabase is source
 * of truth" rule — see the DATA FLOW section of CLAUDE.md / SYSTEM_BIBLE.
 *
 * Source layout (actual folder is "Artist Grids", not "Touring Grids"):
 *   ~/Documents/Corson Agency/Artist Grids/<Artist Folder>/Corson_<Name>_2026.xlsx
 *
 * Each workbook has a "2026 Touring Grid" sheet with columns:
 *   1 DAY · 2 DATE · 3 CITY · 4 VENUE/CAP · 5 PROMOTER · 6 FEE ·
 *   7 DEAL TYPE · 8 STATUS · 9 HOLD # · 10 NOTES
 *
 * Import rule per row:
 *   - DATE parseable AND CITY non-empty → candidate
 *   - NOTES contains /travel|fill|studio|visa|block|n\/?a/i → skip
 *   - STATUS column must be a real booking: Confirmed | Contracted |
 *     Settled | Advanced | Advancing. Rows with "Festival" or empty are
 *     scene-context markers present in every artist's grid template
 *     (Beyond Wonderland, Coachella, EDC, Movement, Time Warp, …) —
 *     NOT actual bookings. Skip them.
 *   - All imported rows are written with deal_type="Confirmed" (per spec)
 *   - Dedup on artist_slug + event_date — skip if already in `shows`
 *
 * Also: seeds Mad Dog EU tour placeholders directly (Jun 20-21, Jul 11-12,
 * Aug 22-23, Oct 24-25 2026 — city "EU Tour", status "Confirmed").
 *
 *   node scripts/import-touring-grids.js           # dry run
 *   node scripts/import-touring-grids.js --apply   # write to Supabase
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const APPLY = process.argv.includes('--apply');

const PROJECT = path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
const env = {};
for (const line of raw.split('\n')) { const i = line.indexOf('='); if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
const { createClient } = require(path.join(PROJECT, 'node_modules/@supabase/supabase-js/dist/index.cjs'));
const ExcelJS = require(path.join(PROJECT, 'node_modules/exceljs'));
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

const GRIDS_BASE = path.join(os.homedir(), 'Documents', 'Corson Agency', 'Artist Grids');

const SKIP_NOTES_RE = /\b(travel|fill|studio|visa|block|n\/?a)\b/i;
// Only rows whose STATUS column matches one of these are real bookings.
// Festival/Pending/Rescheduling/TBD/empty are not confirmed — skip.
const ACCEPT_STATUS = new Set(['Confirmed', 'Contracted', 'Settled', 'Advanced', 'Advancing', 'Active']);

const MONTH_ABBR = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function folderToSlug(folder) {
  return folder.trim().toLowerCase().replace(/\s+/g, '-');
}

function cellText(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map(r => r.text || '').join('');
    if (v.text) return String(v.text);
    if (v.result !== undefined) return String(v.result);
    if (v instanceof Date) return v.toISOString();
  }
  return String(v);
}

// Parse "Jan 1" / "Feb 6" / "May 16" with a supplied year → "YYYY-MM-DD"
function parseGridDate(dateStr, year) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  const m = s.match(/([A-Za-z]{3,9})\s+(\d{1,2})/);
  if (!m) return null;
  const mon = MONTH_ABBR[m[1].toLowerCase().slice(0, 4)] || MONTH_ABBR[m[1].toLowerCase().slice(0, 3)];
  if (!mon) return null;
  const day = parseInt(m[2], 10);
  if (day < 1 || day > 31) return null;
  return `${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function pickSheet(wb) {
  const by2026 = wb.worksheets.find(s => /2026/.test(s.name));
  return by2026 || wb.worksheets[0];
}

async function readArtistGrid(folder, slug) {
  const dir = path.join(GRIDS_BASE, folder);
  const files = fs.readdirSync(dir).filter(f => /\.xlsx$/i.test(f) && !f.startsWith('~$'));
  if (files.length === 0) return { rows: [], reason: 'no xlsx' };
  const file = path.join(dir, files[0]);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = pickSheet(wb);
  const yearMatch = ws.name.match(/(20\d{2})/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : 2026;

  const rows = [];
  for (let r = 4; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const date = cellText(row.getCell(2).value).trim();
    const city = cellText(row.getCell(3).value).trim();
    const venue = cellText(row.getCell(4).value).trim();
    const promoter = cellText(row.getCell(5).value).trim();
    const fee = cellText(row.getCell(6).value).trim();
    const deal_type = cellText(row.getCell(7).value).trim();
    const statusCol = cellText(row.getCell(8).value).trim();
    const notes = cellText(row.getCell(10).value).trim();

    if (!city || !date) continue;
    if (SKIP_NOTES_RE.test(notes)) { rows.push({ skip: true, reason: 'notes: ' + notes.slice(0, 40) }); continue; }
    if (!ACCEPT_STATUS.has(statusCol)) { rows.push({ skip: true, reason: `status: ${statusCol || '(blank)'}` }); continue; }

    const eventDate = parseGridDate(date, year);
    if (!eventDate) continue;

    rows.push({
      artist_slug: slug,
      event_date: eventDate,
      city: city || null,
      venue: venue || null,
      promoter: promoter || null,
      fee: fee || null,
      deal_type: 'Confirmed', // user spec — not the sheet's column
      status: 'Confirmed',
      notes: null,
      _sheetStatus: statusCol,
    });
  }
  return { rows, file: path.basename(file) };
}

async function existingShowsFor(slug) {
  const { data } = await supabase.from('shows').select('event_date').eq('artist_slug', slug);
  return new Set((data || []).map(r => r.event_date));
}

const MAD_DOG_EU_DATES = [
  '2026-06-20', '2026-06-21',
  '2026-07-11', '2026-07-12',
  '2026-08-22', '2026-08-23',
  '2026-10-24', '2026-10-25',
];

async function seedMadDogManual(existing) {
  let inserted = 0, skipped = 0;
  for (const d of MAD_DOG_EU_DATES) {
    if (existing.has(d)) { skipped++; continue; }
    const row = {
      artist_slug: 'mad-dog',
      event_date: d,
      city: 'EU Tour',
      venue: null,
      promoter: null,
      fee: null,
      deal_type: 'Confirmed',
      status: 'Confirmed',
    };
    if (APPLY) {
      const { error } = await supabase.from('shows').insert(row);
      if (error) { console.log(`  mad-dog ${d} ERR: ${error.message}`); continue; }
    }
    inserted++;
  }
  return { inserted, skipped };
}

(async () => {
  console.log(`Mode: ${APPLY ? 'APPLY (writing)' : 'DRY RUN'}`);
  console.log(`Source: ${GRIDS_BASE}\n`);

  if (!fs.existsSync(GRIDS_BASE)) { console.error('Artist Grids folder not found.'); process.exit(1); }

  const { data: artists } = await supabase.from('artists').select('slug, name');
  const validSlugs = new Set(artists.map(a => a.slug));

  const folders = fs.readdirSync(GRIDS_BASE, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  const report = [];
  let totalInserted = 0, totalSkipped = 0, totalSkippedNotes = 0;

  for (const folder of folders.sort()) {
    const slug = folderToSlug(folder);
    if (!validSlugs.has(slug)) { report.push(`${folder.padEnd(20)} — skip (slug "${slug}" not in artists table)`); continue; }

    let fileInfo;
    try { fileInfo = await readArtistGrid(folder, slug); }
    catch (e) { report.push(`${folder.padEnd(20)} ERR read: ${e.message.slice(0, 60)}`); continue; }

    const candidates = fileInfo.rows.filter(r => !r.skip);
    const notesSkipped = fileInfo.rows.filter(r => r.skip).length;
    totalSkippedNotes += notesSkipped;

    const existing = await existingShowsFor(slug);
    let inserted = 0, skippedExist = 0, errs = 0;
    for (const row of candidates) {
      if (existing.has(row.event_date)) { skippedExist++; continue; }
      const { _sheetStatus, ...payload } = row; void _sheetStatus;
      if (APPLY) {
        const { error } = await supabase.from('shows').insert(payload);
        if (error) { errs++; continue; }
      }
      existing.add(row.event_date);
      inserted++;
    }
    totalInserted += inserted;
    totalSkipped += skippedExist;
    report.push(`${folder.padEnd(20)} ${String(inserted).padStart(3)} imported, ${String(skippedExist).padStart(3)} skipped (exist)${notesSkipped ? `, ${notesSkipped} notes-skip` : ''}${errs ? ` · ${errs} ERRS` : ''}`);
  }

  // Mad Dog EU manual seed
  const mdExisting = await existingShowsFor('mad-dog');
  const md = await seedMadDogManual(mdExisting);
  report.push(`mad-dog (EU manual)  ${String(md.inserted).padStart(3)} imported, ${String(md.skipped).padStart(3)} skipped (exist)`);
  totalInserted += md.inserted;
  totalSkipped += md.skipped;

  console.log(report.join('\n'));
  console.log('\n' + '─'.repeat(60));
  console.log(`TOTAL: ${totalInserted} imported · ${totalSkipped} dups · ${totalSkippedNotes} notes-skipped`);
  if (!APPLY) console.log('\nDry run — re-run with --apply to persist.');
})().catch(e => { console.error('fatal:', e.message); process.exit(1); });
