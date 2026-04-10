#!/usr/bin/env node
/**
 * Generate 2026 touring grid Excel files for all artists.
 * Clones the Shogun template and populates confirmed shows from artists.js data.
 */
import { createRequire } from 'module';
import { mkdir } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const XLSX = require('/Users/dannyho94/corson-command-center/node_modules/xlsx/xlsx.js');

const TEMPLATE = '/Users/dannyho94/Documents/Corson Agency/Artist Grids/Shogun/Corson_Shogun_2026.xlsx';
const GRIDS_BASE = '/Users/dannyho94/Documents/Corson Agency/Artist Grids';

// ── ARTIST DATA (from src/data/artists.js + skill context) ───────────────────
const ARTISTS = [
  {
    name: 'JUNKIE KID',
    folder: 'Junkie Kid',
    filename: 'Corson_JunkieKid_2026.xlsx',
    confirmedShows: [
      { date: 'Jul 18, 2026', city: 'Belgium', venue: 'Tomorrowland', promoter: 'Tomorrowland NV', fee: '$6,000', status: 'Advanced' },
    ],
  },
  {
    name: 'CLAWZ',
    folder: 'CLAWZ',
    filename: 'Corson_CLAWZ_2026.xlsx',
    confirmedShows: [
      { date: 'May 16, 2026', city: 'Las Vegas, NV', venue: 'EDC Las Vegas — Wasteland Stage', promoter: 'Insomniac', fee: '$3,500', status: 'Contracted', notes: 'RADIUS: No AZ/NV/UT/CA/Baja shows Jan 17–Aug 15 2026' },
    ],
  },
  {
    name: 'DRAKK',
    folder: 'DRAKK',
    filename: 'Corson_DRAKK_2026.xlsx',
    confirmedShows: [],
  },
  {
    name: 'MAD DOG',
    folder: 'Mad Dog',
    filename: 'Corson_MadDog_2026.xlsx',
    confirmedShows: [],
  },
  {
    name: 'TRIPTYKH',
    folder: 'Triptykh',
    filename: 'Corson_Triptykh_2026.xlsx',
    confirmedShows: [],
  },
  {
    name: 'HELLBOUND!',
    folder: 'Hellbound',
    filename: 'Corson_Hellbound_2026.xlsx',
    confirmedShows: [
      { date: 'Jun 12, 2026', city: 'Vancouver, BC', venue: 'TBD (Kayzo support)', promoter: 'Independent', fee: 'TBD', status: 'Confirmed' },
    ],
  },
  {
    name: 'AniMe',
    folder: 'AniMe',
    filename: 'Corson_AniMe_2026.xlsx',
    confirmedShows: [
      { date: 'Oct 30, 2026', city: 'San Bernardino, CA', venue: 'Escape Halloween', promoter: 'Insomniac', fee: 'TBD', status: 'Confirmed', notes: 'Festival — Insomniac' },
    ],
  },
  {
    name: 'MORELIA',
    folder: 'Morelia',
    filename: 'Corson_Morelia_2026.xlsx',
    confirmedShows: [],
  },
  {
    name: 'Jenna Shaw',
    folder: 'Jenna Shaw',
    filename: 'Corson_JennaShaw_2026.xlsx',
    confirmedShows: [
      { date: 'Apr 19, 2026', city: 'Indio, CA', venue: 'Coachella — Yuma Tent', promoter: 'Goldenvoice', fee: 'TBD', status: 'Confirmed', notes: 'Sara Landry NA tour manager. Underground Yuma stage.' },
    ],
  },
  {
    name: 'Anoluxx',
    folder: 'Anoluxx',
    filename: 'Corson_Anoluxx_2026.xlsx',
    confirmedShows: [],
  },
  {
    name: 'Water Spirit',
    folder: 'Water Spirit',
    filename: 'Corson_WaterSpirit_2026.xlsx',
    confirmedShows: [],
  },
  {
    name: 'Dea Magna',
    folder: 'Dea Magna',
    filename: 'Corson_DeaMagna_2026.xlsx',
    confirmedShows: [
      { date: 'Aug 29, 2026', city: 'San Bernardino, CA', venue: 'Wasteland Festival', promoter: 'Insomniac (Mutate)', fee: 'TBD', status: 'Confirmed', notes: 'Festival — Mutate stage' },
    ],
  },
  {
    name: 'KETTING',
    folder: 'Ketting',
    filename: 'Corson_Ketting_2026.xlsx',
    confirmedShows: [],
    note: '⚠️ LIVE artist — different tech/production rider required',
  },
];

// ── DATE → ROW MAPPING ────────────────────────────────────────────────────────
// Build a map of "Jan 1" -> row index by reading the template grid
function buildDateRowMap(ws) {
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const map = {};
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const dateCell = row[1]; // Column B = DATE
    if (dateCell && /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d/.test(String(dateCell))) {
      map[String(dateCell).trim()] = i; // 0-indexed row
    }
  }
  return map;
}

// Parse a display date like "May 16, 2026" → "May 16" for lookup
function toGridKey(dateStr) {
  if (!dateStr) return null;
  // "May 16, 2026" → try to get "May 16"
  const m = String(dateStr).match(/^([A-Za-z]+)\s+(\d+)/);
  if (!m) return null;
  const months = { January:'Jan', February:'Feb', March:'Mar', April:'Apr', May:'May',
    June:'Jun', July:'Jul', August:'Aug', September:'Sep', October:'Oct',
    November:'Nov', December:'Dec' };
  const mon = months[m[1]] || m[1].slice(0,3);
  return `${mon} ${m[2]}`;
}

// ── CELL HELPERS ─────────────────────────────────────────────────────────────
function setCell(ws, col, row, value) {
  // row is 0-indexed, XLSX uses 1-indexed
  const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
  if (!ws[cellRef]) ws[cellRef] = {};
  ws[cellRef].v = value;
  ws[cellRef].t = typeof value === 'number' ? 'n' : 's';
}

function getCellVal(ws, col, row) {
  const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
  return ws[cellRef]?.v ?? '';
}

// ── GENERATE ONE FILE ─────────────────────────────────────────────────────────
async function generateFile(artist, template) {
  const outputDir = join(GRIDS_BASE, artist.folder);
  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, artist.filename);

  // Deep clone the workbook by re-reading from buffer
  const buf = XLSX.write(template, { type: 'buffer', bookType: 'xlsx' });
  const wb = XLSX.read(buf, { type: 'buffer' });

  const sheetName26 = '2026 Touring Grid';
  const sheetName27 = '2027 Touring Grid';
  const targetSheet = '🎯 Target List';

  // ── UPDATE 2026 GRID ──
  const ws26 = wb.Sheets[sheetName26];
  // Row 1 (index 0): title cell A1
  setCell(ws26, 0, 0, 'CORSON AGENCY  ·  TOURING GRID  ·  2026');
  // Row 2 (index 1): artist name cell A2
  setCell(ws26, 0, 1, `ARTIST:  ${artist.name}`);

  // Add artist note if any (e.g. KETTING live rider)
  if (artist.note) {
    const current = getCellVal(ws26, 9, 1); // column J row 2
    setCell(ws26, 9, 1, artist.note);
  }

  // Build date→row map and fill confirmed shows
  if (artist.confirmedShows.length > 0) {
    const dateMap = buildDateRowMap(ws26);
    for (const show of artist.confirmedShows) {
      const key = toGridKey(show.date);
      if (key && dateMap[key] !== undefined) {
        const r = dateMap[key];
        // Columns: A=Day B=Date C=City D=Venue/Cap E=Promoter F=Fee G=DealType H=Status I=Hold# J=Notes
        setCell(ws26, 2, r, show.city || '');
        setCell(ws26, 3, r, show.venue || '');
        setCell(ws26, 4, r, show.promoter || '');
        setCell(ws26, 5, r, show.fee || '');
        setCell(ws26, 6, r, show.dealType || 'Club');
        setCell(ws26, 7, r, show.status || 'Confirmed');
        if (show.notes) setCell(ws26, 9, r, show.notes);
        console.log(`  ✓ ${artist.name}: placed "${show.venue}" on row ${r+1} (${key})`);
      } else {
        console.log(`  ⚠ ${artist.name}: could not find grid row for date "${show.date}" (key: ${key})`);
      }
    }
  }

  // ── UPDATE 2027 GRID ──
  const ws27 = wb.Sheets[sheetName27];
  setCell(ws27, 0, 0, 'CORSON AGENCY  ·  TOURING GRID  ·  2027');
  setCell(ws27, 0, 1, `ARTIST:  ${artist.name}`);

  // ── UPDATE TARGET LIST HEADER ──
  const wst = wb.Sheets[targetSheet];
  setCell(wst, 0, 0, `CORSON AGENCY  ·  TARGET LIST  ·  ${artist.name.toUpperCase()}`);

  // Write file
  XLSX.writeFile(wb, outputPath);
  console.log(`✅ ${artist.filename} → ${outputPath}`);
  return outputPath;
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Loading template:', TEMPLATE);
  const template = XLSX.readFile(TEMPLATE);
  console.log('Sheets:', template.SheetNames);
  console.log('');

  const results = [];
  for (const artist of ARTISTS) {
    try {
      const path = await generateFile(artist, template);
      results.push({ artist: artist.name, path, ok: true });
    } catch (err) {
      console.error(`❌ ${artist.name}: ${err.message}`);
      results.push({ artist: artist.name, ok: false, err: err.message });
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log('GRID GENERATION COMPLETE');
  console.log('═'.repeat(60));
  results.forEach(r => {
    if (r.ok) console.log(`✅ ${r.artist}`);
    else console.log(`❌ ${r.artist}: ${r.err}`);
  });
  console.log(`\n${results.filter(r=>r.ok).length}/${results.length} files generated`);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
