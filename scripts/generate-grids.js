#!/usr/bin/env node
/**
 * generate-grids.js
 * Generates Master Touring Grid + Individual Artist Grid Excel files from Supabase data.
 * Uses exceljs for rich formatting and @supabase/supabase-js for data.
 */

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { createClient } = require('/Users/dannyho94/corson-command-center/node_modules/@supabase/supabase-js/dist/index.cjs');

// ── ENV ─────────────────────────────────────────────────────────────────────
const envPath = path.join(__dirname, '.env');
const envText = fs.readFileSync(envPath, 'utf8');
const env = {};
envText.split('\n').forEach(line => {
  const m = line.match(/^([^=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim();
});
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

// ── CONSTANTS ───────────────────────────────────────────────────────────────
const YEAR = 2026;
const YEAR2 = 2027;
const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const GRIDS_BASE = path.join(process.env.HOME, 'Documents', 'Corson Agency', 'Artist Grids');
const MASTER_PATH = path.join(process.env.HOME, 'Documents', 'Corson Agency', 'Master Touring Grid 2026.xlsx');

// ── ARTIST MAPPING ──────────────────────────────────────────────────────────
const ARTIST_MAP = [
  { slug: "anime", folder: "AniMe", file: "AniMe" },
  { slug: "anoluxx", folder: "Anoluxx", file: "Anoluxx" },
  { slug: "clawz", folder: "CLAWZ", file: "CLAWZ" },
  { slug: "cyboy", folder: "Cyboy", file: "Cyboy" },
  { slug: "dea-magna", folder: "Dea Magna", file: "DeaMagna" },
  { slug: "death-code", folder: "Death Code", file: "DeathCode" },
  { slug: "dr-greco", folder: "Dr Greco", file: "DrGreco" },
  { slug: "drakk", folder: "DRAKK", file: "DRAKK" },
  { slug: "fernanda-martins", folder: "Fernanda Martins", file: "FernandaMartins" },
  { slug: "gioh-cecato", folder: "Gioh Cecato", file: "GiohCecato" },
  { slug: "hellbound", folder: "Hellbound", file: "Hellbound" },
  { slug: "jay-toledo", folder: "Jay Toledo", file: "JayToledo" },
  { slug: "jayr", folder: "JayR", file: "JayR" },
  { slug: "jenna-shaw", folder: "Jenna Shaw", file: "JennaShaw" },
  { slug: "junkie-kid", folder: "Junkie Kid", file: "JunkieKid" },
  { slug: "ketting", folder: "Ketting", file: "Ketting" },
  { slug: "lara-klart", folder: "Lara Klart", file: "LaraKlart" },
  { slug: "mad-dog", folder: "Mad Dog", file: "MadDog" },
  { slug: "mandy", folder: "MANDY", file: "MANDY" },
  { slug: "morelia", folder: "Morelia", file: "Morelia" },
  { slug: "naomi-luna", folder: "Naomi Luna", file: "NaomiLuna" },
  { slug: "pixie-dust", folder: "Pixie Dust", file: "PixieDust" },
  { slug: "shogun", folder: "Shogun", file: "Shogun" },
  { slug: "sihk", folder: "SIHK", file: "SIHK" },
  { slug: "taylor-torrence", folder: "Taylor Torrence", file: "TaylorTorrence" },
  { slug: "the-purge", folder: "The Purge", file: "ThePurge" },
  { slug: "triptykh", folder: "Triptykh", file: "Triptykh" },
  { slug: "water-spirit", folder: "Water Spirit", file: "WaterSpirit" },
];

// ── FESTIVALS (for calendar grid marking) ───────────────────────────────────
const FESTIVAL_DATES = [
  { name: "Beyond Wonderland", startMonth: 2, startDay: 27, endMonth: 2, endDay: 29, city: "San Bernardino, CA", promoter: "Insomniac" },
  { name: "Coachella W1", startMonth: 3, startDay: 10, endMonth: 3, endDay: 12, city: "Indio, CA", promoter: "Goldenvoice" },
  { name: "Coachella W2", startMonth: 3, startDay: 17, endMonth: 3, endDay: 19, city: "Indio, CA", promoter: "Goldenvoice" },
  { name: "Time Warp Miami", startMonth: 3, startDay: 25, endMonth: 3, endDay: 25, city: "Miami, FL", promoter: "Time Warp" },
  { name: "EDC Las Vegas", startMonth: 4, startDay: 15, endMonth: 4, endDay: 17, city: "Las Vegas, NV", promoter: "Insomniac" },
  { name: "Movement Detroit", startMonth: 4, startDay: 23, endMonth: 4, endDay: 26, city: "Detroit, MI", promoter: "Paxahau" },
  { name: "Wasteland Festival", startMonth: 7, startDay: 29, endMonth: 7, endDay: 30, city: "San Bernardino, CA", promoter: "Insomniac" },
  { name: "Escape Halloween", startMonth: 9, startDay: 30, endMonth: 9, endDay: 31, city: "San Bernardino, CA", promoter: "Insomniac" },
];

// Build a set of festival date strings "YYYY-MM-DD" for quick lookup
function buildFestivalDateSet() {
  const set = new Map(); // dateStr -> festival info
  for (const f of FESTIVAL_DATES) {
    const start = new Date(YEAR, f.startMonth, f.startDay);
    const end = new Date(YEAR, f.endMonth, f.endDay);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = `${YEAR}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      set.set(key, f);
    }
  }
  return set;
}

const FESTIVAL_SET = buildFestivalDateSet();

// ── FESTIVAL CALENDAR DATA ──────────────────────────────────────────────────
const FESTIVAL_CALENDAR = [
  { name: "Ultra Music Festival", dates: "March 27-29", location: "Miami FL", promoter: "Ultra / Independent", fit: "HIGH — RESISTANCE", artists: "None yet", contact: "Ultra booking", status: "Target", notes: "RESISTANCE stage = underground techno. Dream target." },
  { name: "Beyond Wonderland SoCal", dates: "March 27-29", location: "San Bernardino CA", promoter: "Insomniac", fit: "MEDIUM", artists: "None yet", contact: "Naar / Jackie", status: "Target", notes: "Leverage existing Insomniac relationship." },
  { name: "Coachella", dates: "April 10-19", location: "Indio CA", promoter: "Goldenvoice / AEG", fit: "LOW-MEDIUM", artists: "Jenna Shaw", contact: "Goldenvoice booking", status: "IN", notes: "Yuma Tent = underground. Jenna Shaw confirmed." },
  { name: "Time Warp Miami", dates: "April 25", location: "Miami FL", promoter: "Time Warp", fit: "VERY HIGH", artists: "None yet", contact: "Time Warp booking", status: "Priority", notes: "Expanding US aggressively. Pure techno brand." },
  { name: "Insomniac CORE x Tomorrowland", dates: "May 2-3", location: "Los Angeles CA", promoter: "Insomniac", fit: "HIGH", artists: "None yet", contact: "Matt Smith / Carlos", status: "Urgent Target", notes: "Hard techno placement opportunity." },
  { name: "EDC Las Vegas", dates: "May 15-17", location: "Las Vegas NV", promoter: "Insomniac", fit: "VERY HIGH — neonGARDEN", artists: "CLAWZ", contact: "Jackie Bray / Naar", status: "IN", notes: "30th anniversary." },
  { name: "Movement Detroit", dates: "May 23-26", location: "Detroit MI", promoter: "Paxahau", fit: "VERY HIGH", artists: "None yet", contact: "Paxahau booking", status: "Dream Target", notes: "Most credible US techno festival." },
  { name: "Project GLOW", dates: "May 29-30", location: "Washington DC", promoter: "Club Glow / Insomniac", fit: "HIGH", artists: "None yet", contact: "Club Glow / Insomniac", status: "Target", notes: "Growing techno focus." },
  { name: "Beyond Wonderland Chicago", dates: "June 6", location: "Chicago IL", promoter: "Insomniac", fit: "MEDIUM", artists: "None yet", contact: "Naar / Jackie", status: "Target", notes: "Leverage Insomniac relationship." },
  { name: "Electric Forest", dates: "June 25-28", location: "Rothbury MI", promoter: "Goldenvoice / AEG", fit: "LOW-MEDIUM", artists: "None yet", contact: "Goldenvoice booking", status: "Monitor", notes: "Growing techno programming." },
  { name: "Time Warp LA", dates: "TBD 2026", location: "Los Angeles CA", promoter: "Time Warp", fit: "VERY HIGH", artists: "None yet", contact: "Time Warp booking", status: "Priority", notes: "Ace Mission LA. Date TBD." },
  { name: "HARD Summer", dates: "Aug 1-2", location: "Hollywood Park LA", promoter: "Hard Events / Live Nation", fit: "HIGH", artists: "None yet", contact: "HARD Events booking", status: "Target", notes: "Hard dance growing." },
  { name: "Wasteland Festival", dates: "Sept 4-5", location: "San Bernardino CA", promoter: "Insomniac (Mutate)", fit: "VERY HIGH", artists: "CLAWZ, JK, Mad Dog, Dea Magna", contact: "Jasper Li / Matt Smith", status: "IN", notes: "BIGGEST OPPORTUNITY." },
  { name: "Arc Music Festival", dates: "Sept 4-6", location: "Chicago IL", promoter: "Paxahau", fit: "HIGH", artists: "None yet", contact: "Paxahau booking", status: "Target", notes: "Underground techno." },
  { name: "Nocturnal Wonderland", dates: "Sept 19-20", location: "San Bernardino CA", promoter: "Insomniac", fit: "MEDIUM", artists: "None yet", contact: "Naar / Jackie", status: "Target", notes: "Insomniac staple." },
  { name: "Escape Halloween", dates: "Oct 30-31", location: "San Bernardino CA", promoter: "Insomniac", fit: "HIGH", artists: "AniMe, The Purge", contact: "Jackie Bray", status: "IN", notes: "Hard dance/techno focus." },
  { name: "EDC Orlando", dates: "November 2026", location: "Orlando FL", promoter: "Insomniac", fit: "HIGH", artists: "None yet", contact: "Naar / Jackie", status: "Target", notes: "Smaller EDC." },
  { name: "Time Warp USA NYC", dates: "~November 2026", location: "Brooklyn NY", promoter: "Time Warp", fit: "VERY HIGH", artists: "None yet", contact: "Time Warp booking", status: "Priority", notes: "Annual NYC edition." },
  { name: "Countdown NYE", dates: "December 31", location: "San Bernardino CA", promoter: "Insomniac", fit: "MEDIUM", artists: "None yet", contact: "Insomniac booking", status: "Monitor", notes: "NYE space theme." },
];

// ── COLOR CONSTANTS ─────────────────────────────────────────────────────────
const C = {
  darkBg:      '0F0F23',
  headerBg:    '16213E',
  monthSep:    '533483',
  monthFont:   'E8D5B7',
  weekendBg:   '252545',
  todayBg:     '0A3D91',
  redFont:     'E94560',
  white:       'FFFFFF',
  lightGray:   'CCCCCC',
  border:      '333355',
  // Status colors
  confirmed:   '1B5E20',
  pending:     '4A148C',
  festival:    '0D47A1',
  settled:     '424242',
  rescheduling:'8B0000',
  hold:        '6D5B00',
};

function statusBg(status) {
  if (!status) return null;
  const s = String(status).toLowerCase();
  if (['confirmed', 'contracted', 'active', 'advanced'].includes(s)) return C.confirmed;
  if (s === 'pending') return C.pending;
  if (s === 'festival') return C.festival;
  if (s === 'settled') return C.settled;
  if (s === 'rescheduling') return C.rescheduling;
  if (s === 'hold') return C.hold;
  return null;
}

// ── HELPERS ─────────────────────────────────────────────────────────────────
function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function dateLabel(month, day) {
  return `${MONTH_ABBR[month]} ${day}`;
}

function fillObj(color) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + color } };
}

function fontObj(color, bold, size) {
  return { name: 'Calibri', size: size || 10, bold: !!bold, color: { argb: 'FF' + color } };
}

function thinBorder() {
  return {
    bottom: { style: 'hair', color: { argb: 'FF' + C.border } }
  };
}

function headerBorder() {
  return {
    bottom: { style: 'thin', color: { argb: 'FF' + C.border } }
  };
}

// Apply dark theme style to a cell
function styleCell(cell, bgColor, fontColor, bold, fontSize) {
  cell.fill = fillObj(bgColor || C.darkBg);
  cell.font = fontObj(fontColor || C.lightGray, bold, fontSize);
  cell.border = thinBorder();
  cell.alignment = { vertical: 'middle' };
}

// ── SUPABASE DATA ───────────────────────────────────────────────────────────
async function fetchData() {
  console.log('Fetching data from Supabase...');

  const [showsRes, pipelineRes, targetsRes, artistsRes] = await Promise.all([
    supabase.from('shows').select('*'),
    supabase.from('pipeline').select('*'),
    supabase.from('targets').select('*'),
    supabase.from('artists').select('*'),
  ]);

  if (showsRes.error) console.error('Shows error:', showsRes.error.message);
  if (pipelineRes.error) console.error('Pipeline error:', pipelineRes.error.message);
  if (targetsRes.error) console.error('Targets error:', targetsRes.error.message);
  if (artistsRes.error) console.error('Artists error:', artistsRes.error.message);

  const shows = showsRes.data || [];
  const pipeline = pipelineRes.data || [];
  const targets = targetsRes.data || [];
  const artists = artistsRes.data || [];

  console.log(`  Shows: ${shows.length}, Pipeline: ${pipeline.length}, Targets: ${targets.length}, Artists: ${artists.length}`);
  return { shows, pipeline, targets, artists };
}

// Group shows by date key for master grid, by artist_slug for individual grids
function groupShowsByDate(shows) {
  const map = {};
  for (const s of shows) {
    if (!s.event_date) continue;
    const key = s.event_date.slice(0, 10); // YYYY-MM-DD
    if (!map[key]) map[key] = [];
    map[key].push(s);
  }
  return map;
}

function groupShowsByArtist(shows) {
  const map = {};
  for (const s of shows) {
    if (!s.artist_slug) continue;
    if (!map[s.artist_slug]) map[s.artist_slug] = [];
    map[s.artist_slug].push(s);
  }
  return map;
}

function groupTargetsByArtist(targets) {
  const map = {};
  for (const t of targets) {
    if (!t.artist_slug) continue;
    if (!map[t.artist_slug]) map[t.artist_slug] = [];
    map[t.artist_slug].push(t);
  }
  return map;
}

// ── MASTER TOURING GRID ─────────────────────────────────────────────────────
async function generateMasterGrid(shows, artists) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Master Touring Grid 2026');

  // Column widths
  ws.columns = [
    { width: 5 },  // A: DAY
    { width: 8 },  // B: DATE
    { width: 18 }, // C: ARTIST
    { width: 18 }, // D: CITY
    { width: 24 }, // E: VENUE / CAP
    { width: 22 }, // F: PROMOTER
    { width: 18 }, // G: FEE
    { width: 14 }, // H: DEAL TYPE
    { width: 14 }, // I: STATUS
    { width: 8 },  // J: HOLD #
    { width: 35 }, // K: NOTES
  ];

  // Build artist name lookup
  const artistNames = {};
  for (const a of artists) {
    artistNames[a.slug] = a.name;
  }

  // Row 1: Title
  const r1 = ws.getRow(1);
  ws.mergeCells('A1:K1');
  const titleCell = ws.getCell('A1');
  titleCell.value = 'CORSON AGENCY \u2014 MASTER TOURING GRID 2026';
  titleCell.fill = fillObj(C.darkBg);
  titleCell.font = fontObj(C.redFont, true, 14);
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  r1.height = 28;

  // Row 2: Legend
  const legendLabels = [
    { text: 'CONFIRMED', bg: C.confirmed },
    { text: 'PENDING', bg: C.pending },
    { text: 'FESTIVAL', bg: C.festival },
    { text: 'SETTLED', bg: C.settled },
    { text: 'RESCHEDULING', bg: C.rescheduling },
    { text: 'HOLD', bg: C.hold },
  ];
  const r2 = ws.getRow(2);
  r2.height = 20;
  for (let i = 0; i < 11; i++) {
    const cell = r2.getCell(i + 1);
    cell.fill = fillObj(C.headerBg);
    cell.font = fontObj(C.white, true, 9);
  }
  for (let i = 0; i < legendLabels.length; i++) {
    const cell = r2.getCell(i + 3); // start at col C
    cell.value = legendLabels[i].text;
    cell.fill = fillObj(legendLabels[i].bg);
    cell.font = fontObj(C.white, true, 9);
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  // Row 3: Headers
  const headers = ['DAY', 'DATE', 'ARTIST', 'CITY', 'VENUE / CAP', 'PROMOTER', 'FEE', 'DEAL TYPE', 'STATUS', 'HOLD #', 'NOTES'];
  const r3 = ws.getRow(3);
  r3.height = 18;
  headers.forEach((h, i) => {
    const cell = r3.getCell(i + 1);
    cell.value = h;
    cell.fill = fillObj(C.headerBg);
    cell.font = fontObj(C.white, true, 10);
    cell.border = headerBorder();
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  // Group shows by date
  const showsByDate = groupShowsByDate(shows);
  const today = todayStr();

  let rowNum = 4;
  let totalShowRows = 0;
  let totalFestivalRows = 0;

  for (let month = 0; month < 12; month++) {
    // Month separator row
    const monthRow = ws.getRow(rowNum);
    monthRow.height = 20;
    ws.mergeCells(rowNum, 1, rowNum, 11);
    const monthCell = monthRow.getCell(1);
    monthCell.value = MONTH_NAMES[month].toUpperCase();
    monthCell.fill = fillObj(C.monthSep);
    monthCell.font = fontObj(C.monthFont, true, 11);
    monthCell.alignment = { horizontal: 'center', vertical: 'middle' };
    rowNum++;

    const days = daysInMonth(YEAR, month);
    for (let day = 1; day <= days; day++) {
      const d = new Date(YEAR, month, day);
      const dayName = DAY_NAMES[d.getDay()];
      const dk = dateKey(YEAR, month, day);
      const label = dateLabel(month, day);
      const isWeekend = d.getDay() === 5 || d.getDay() === 6;
      const isToday = dk === today;
      const festInfo = FESTIVAL_SET.get(dk);
      const dayShows = showsByDate[dk] || [];

      // Determine rows needed: at least 1 (the date row), plus extra shows, plus festival row
      const rows = [];

      if (festInfo) {
        // Festival row
        rows.push({ type: 'festival', festival: festInfo });
        totalFestivalRows++;
      }

      if (dayShows.length > 0) {
        for (const s of dayShows) {
          rows.push({ type: 'show', show: s });
          totalShowRows++;
        }
      }

      if (rows.length === 0) {
        rows.push({ type: 'empty' });
      }

      for (let ri = 0; ri < rows.length; ri++) {
        const row = ws.getRow(rowNum);
        row.height = 16;
        const entry = rows[ri];

        // Determine bg color
        let bg = C.darkBg;
        if (isToday) bg = C.todayBg;
        else if (entry.type === 'festival') bg = C.festival;
        else if (entry.type === 'show' && entry.show.status) {
          const sBg = statusBg(entry.show.status);
          if (sBg) bg = sBg;
        }
        if (isWeekend && entry.type === 'empty') bg = C.weekendBg;

        // Fill all 11 columns with base style
        for (let col = 1; col <= 11; col++) {
          const cell = row.getCell(col);
          cell.fill = fillObj(bg);
          cell.font = fontObj(C.lightGray, false, 10);
          cell.border = thinBorder();
          cell.alignment = { vertical: 'middle' };
        }

        // Col A: Day name (only on first sub-row)
        if (ri === 0) {
          row.getCell(1).value = dayName;
          row.getCell(2).value = label;
        }

        if (entry.type === 'festival') {
          row.getCell(3).value = '\u2014 ALL ARTISTS \u2014';
          row.getCell(3).font = fontObj(C.white, true, 10);
          row.getCell(4).value = entry.festival.city;
          row.getCell(5).value = entry.festival.name;
          row.getCell(6).value = entry.festival.promoter;
          row.getCell(9).value = 'Festival';
        } else if (entry.type === 'show') {
          const s = entry.show;
          row.getCell(3).value = artistNames[s.artist_slug] || s.artist_slug;
          row.getCell(4).value = s.city || '';
          row.getCell(5).value = s.venue || '';
          row.getCell(6).value = s.promoter || '';
          row.getCell(7).value = s.fee || '';
          row.getCell(8).value = s.deal_type || '';
          row.getCell(9).value = s.status || '';
          row.getCell(10).value = s.hold_number || '';
          row.getCell(11).value = s.notes || '';
        }

        rowNum++;
      }
    }
  }

  // Freeze panes at C4
  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 3, activeCell: 'C4' }];

  // Auto-filter
  ws.autoFilter = { from: 'A3', to: `K${rowNum - 1}` };

  // Data validation on Status column (col I = 9)
  for (let r = 4; r < rowNum; r++) {
    ws.getCell(r, 9).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"Confirmed,Contracted,Active,Advanced,Pending,Festival,Settled,Rescheduling,Hold"'],
    };
  }

  fs.mkdirSync(path.dirname(MASTER_PATH), { recursive: true });
  await wb.xlsx.writeFile(MASTER_PATH);
  console.log(`Master grid written: ${MASTER_PATH}`);
  return { totalShowRows, totalFestivalRows };
}

// ── INDIVIDUAL ARTIST GRIDS ─────────────────────────────────────────────────

function buildCalendarRows(ws, year, startRow, artistShows, isPopulated) {
  const today = todayStr();
  let rowNum = startRow;

  for (let month = 0; month < 12; month++) {
    // Month separator row
    const monthRow = ws.getRow(rowNum);
    monthRow.height = 20;
    ws.mergeCells(rowNum, 1, rowNum, 10);
    const monthCell = monthRow.getCell(1);
    monthCell.value = MONTH_NAMES[month].toUpperCase();
    monthCell.fill = fillObj(C.monthSep);
    monthCell.font = fontObj(C.monthFont, true, 11);
    monthCell.alignment = { horizontal: 'center', vertical: 'middle' };
    rowNum++;

    const days = daysInMonth(year, month);
    for (let day = 1; day <= days; day++) {
      const d = new Date(year, month, day);
      const dayName = DAY_NAMES[d.getDay()];
      const dk = dateKey(year, month, day);
      const label = dateLabel(month, day);
      const isWeekend = d.getDay() === 5 || d.getDay() === 6;
      const isToday = dk === today;
      const festInfo = (year === YEAR) ? FESTIVAL_SET.get(dk) : null;

      // Find show for this artist on this date
      const show = isPopulated ? (artistShows || []).find(s => s.event_date && s.event_date.slice(0, 10) === dk) : null;

      // Determine bg
      let bg = C.darkBg;
      if (isToday) bg = C.todayBg;
      else if (festInfo && !show) bg = C.festival;
      else if (show) {
        const sBg = statusBg(show.status);
        if (sBg) bg = sBg;
      } else if (isWeekend) bg = C.weekendBg;

      const row = ws.getRow(rowNum);
      row.height = 16;

      for (let col = 1; col <= 10; col++) {
        const cell = row.getCell(col);
        cell.fill = fillObj(bg);
        cell.font = fontObj(C.lightGray, false, 10);
        cell.border = thinBorder();
        cell.alignment = { vertical: 'middle' };
      }

      row.getCell(1).value = dayName;
      row.getCell(2).value = label;

      if (festInfo && !show) {
        row.getCell(3).value = festInfo.city;
        row.getCell(4).value = festInfo.name;
        row.getCell(5).value = festInfo.promoter;
        row.getCell(8).value = 'Festival';
        row.getCell(3).font = fontObj(C.white, true, 10);
      } else if (show) {
        row.getCell(3).value = show.city || '';
        row.getCell(4).value = show.venue || '';
        row.getCell(5).value = show.promoter || '';
        row.getCell(6).value = show.fee || '';
        row.getCell(7).value = show.deal_type || '';
        row.getCell(8).value = show.status || '';
        row.getCell(9).value = show.hold_number || '';
        row.getCell(10).value = show.notes || '';
      }

      rowNum++;
    }
  }
  return rowNum;
}

function buildTouringTab(wb, tabName, year, artistName, artistShows, isPopulated) {
  const ws = wb.addWorksheet(tabName);

  // Column widths (10 columns: DAY, DATE, CITY, VENUE/CAP, PROMOTER, FEE, DEAL TYPE, STATUS, HOLD#, NOTES)
  ws.columns = [
    { width: 5 },  // A: DAY
    { width: 8 },  // B: DATE
    { width: 18 }, // C: CITY
    { width: 24 }, // D: VENUE / CAP
    { width: 22 }, // E: PROMOTER
    { width: 18 }, // F: FEE
    { width: 14 }, // G: DEAL TYPE
    { width: 14 }, // H: STATUS
    { width: 8 },  // I: HOLD #
    { width: 35 }, // J: NOTES
  ];

  // Row 1: Title
  ws.mergeCells('A1:J1');
  const titleCell = ws.getCell('A1');
  titleCell.value = `CORSON AGENCY  \u00B7  TOURING GRID  \u00B7  ${year}`;
  titleCell.fill = fillObj(C.darkBg);
  titleCell.font = fontObj(C.redFont, true, 14);
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 28;

  // Row 2: Artist name + legend
  const r2 = ws.getRow(2);
  r2.height = 20;
  for (let i = 1; i <= 10; i++) {
    r2.getCell(i).fill = fillObj(C.headerBg);
    r2.getCell(i).font = fontObj(C.white, true, 9);
  }
  r2.getCell(1).value = `ARTIST:  ${artistName}`;
  r2.getCell(1).font = fontObj(C.white, true, 10);

  const legendItems = [
    { col: 4, text: 'CONFIRMED', bg: C.confirmed },
    { col: 5, text: 'CONTRACTED', bg: C.confirmed },
    { col: 6, text: 'HOLD', bg: C.hold },
    { col: 7, text: 'FESTIVAL', bg: C.festival },
    { col: 8, text: 'SETTLED', bg: C.settled },
    { col: 9, text: 'PENDING', bg: C.pending },
    { col: 10, text: 'TODAY \u2192', bg: C.todayBg },
  ];
  for (const item of legendItems) {
    const cell = r2.getCell(item.col);
    cell.value = item.text;
    cell.fill = fillObj(item.bg);
    cell.font = fontObj(C.white, true, 9);
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  // Row 3: Headers
  const headers = ['DAY', 'DATE', 'CITY', 'VENUE / CAP', 'PROMOTER', 'FEE', 'DEAL TYPE', 'STATUS', 'HOLD #', 'NOTES'];
  const r3 = ws.getRow(3);
  r3.height = 18;
  headers.forEach((h, i) => {
    const cell = r3.getCell(i + 1);
    cell.value = h;
    cell.fill = fillObj(C.headerBg);
    cell.font = fontObj(C.white, true, 10);
    cell.border = headerBorder();
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  // Calendar rows starting at row 4
  const lastRow = buildCalendarRows(ws, year, 4, artistShows, isPopulated);

  // Freeze panes at C4
  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 3, activeCell: 'C4' }];

  return ws;
}

function buildFestivalCalendarTab(wb) {
  const ws = wb.addWorksheet('\uD83C\uDFAA Festival Calendar');

  ws.columns = [
    { width: 28 }, // A: FESTIVAL
    { width: 16 }, // B: DATES
    { width: 20 }, // C: LOCATION
    { width: 24 }, // D: PROMOTER
    { width: 20 }, // E: TECHNO FIT
    { width: 28 }, // F: CORSON ARTISTS
    { width: 24 }, // G: BOOKING CONTACT
    { width: 16 }, // H: STATUS
    { width: 40 }, // I: NOTES
  ];

  // Row 1: Title
  ws.mergeCells('A1:I1');
  const titleCell = ws.getCell('A1');
  titleCell.value = 'CORSON AGENCY \u2014 US FESTIVAL CALENDAR 2026 + CORPORATE BUYER MAP';
  titleCell.fill = fillObj(C.darkBg);
  titleCell.font = fontObj(C.redFont, true, 13);
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 28;

  // Row 2: Legend
  const r2 = ws.getRow(2);
  r2.height = 20;
  const legendItems = [
    { col: 1, text: 'IN', bg: C.confirmed },
    { col: 2, text: 'TARGET', bg: C.festival },
    { col: 3, text: 'PRIORITY', bg: C.hold },
    { col: 4, text: 'MONITOR', bg: C.settled },
  ];
  for (let i = 1; i <= 9; i++) {
    r2.getCell(i).fill = fillObj(C.headerBg);
    r2.getCell(i).font = fontObj(C.white, true, 9);
  }
  for (const item of legendItems) {
    const cell = r2.getCell(item.col);
    cell.value = item.text;
    cell.fill = fillObj(item.bg);
    cell.font = fontObj(C.white, true, 9);
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  // Row 3: Headers
  const headers = ['FESTIVAL', 'DATES', 'LOCATION', 'PROMOTER', 'TECHNO FIT', 'CORSON ARTISTS', 'BOOKING CONTACT', 'STATUS', 'NOTES'];
  const r3 = ws.getRow(3);
  r3.height = 18;
  headers.forEach((h, i) => {
    const cell = r3.getCell(i + 1);
    cell.value = h;
    cell.fill = fillObj(C.headerBg);
    cell.font = fontObj(C.white, true, 10);
    cell.border = headerBorder();
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  // Data rows
  FESTIVAL_CALENDAR.forEach((f, idx) => {
    const rowNum = idx + 4;
    const row = ws.getRow(rowNum);
    row.height = 18;

    // Determine bg based on status
    let bg = C.darkBg;
    const s = f.status.toLowerCase();
    if (s.includes('in')) bg = C.confirmed;
    else if (s.includes('priority') || s.includes('urgent')) bg = C.hold;
    else if (s.includes('target') || s.includes('dream')) bg = C.festival;
    else if (s.includes('monitor')) bg = C.settled;

    const vals = [f.name, f.dates, f.location, f.promoter, f.fit, f.artists, f.contact, f.status, f.notes];
    vals.forEach((v, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = v;
      cell.fill = fillObj(bg);
      cell.font = fontObj(C.white, false, 10);
      cell.border = thinBorder();
      cell.alignment = { vertical: 'middle', wrapText: true };
    });
  });

  return ws;
}

function buildTargetListTab(wb, artistName, targets) {
  const ws = wb.addWorksheet('\uD83C\uDFAF Target List');

  ws.columns = [
    { width: 5 },  // A: PRI
    { width: 22 }, // B: PROMOTER
    { width: 28 }, // C: CONTACT / EMAIL
    { width: 18 }, // D: MARKET
    { width: 20 }, // E: INSTAGRAM
    { width: 14 }, // F: OUTREACH
    { width: 14 }, // G: STATUS
    { width: 30 }, // H: NOTES
    { width: 18 }, // I: NEXT ACTION
  ];

  // Row 1: Title
  ws.mergeCells('A1:I1');
  const titleCell = ws.getCell('A1');
  titleCell.value = `CORSON AGENCY  \u00B7  TARGET LIST  \u00B7  ${artistName.toUpperCase()}`;
  titleCell.fill = fillObj(C.darkBg);
  titleCell.font = fontObj(C.redFont, true, 13);
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 28;

  // Row 2: Headers
  const headers = ['PRI', 'PROMOTER', 'CONTACT / EMAIL', 'MARKET', 'INSTAGRAM', 'OUTREACH', 'STATUS', 'NOTES', 'NEXT ACTION'];
  const r2 = ws.getRow(2);
  r2.height = 18;
  headers.forEach((h, i) => {
    const cell = r2.getCell(i + 1);
    cell.value = h;
    cell.fill = fillObj(C.headerBg);
    cell.font = fontObj(C.white, true, 10);
    cell.border = headerBorder();
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  // Row 3: Section header
  const r3 = ws.getRow(3);
  r3.height = 20;
  ws.mergeCells('A3:I3');
  const secCell = r3.getCell(1);
  secCell.value = '\uD83C\uDFAF  PRIORITY MARKETS';
  secCell.fill = fillObj(C.monthSep);
  secCell.font = fontObj(C.monthFont, true, 11);
  secCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // Target data rows
  if (targets && targets.length > 0) {
    // Sort by priority_order if available
    targets.sort((a, b) => (a.priority_order || 999) - (b.priority_order || 999));
    targets.forEach((t, idx) => {
      const rowNum = idx + 4;
      const row = ws.getRow(rowNum);
      row.height = 16;
      const vals = [
        t.priority_order || idx + 1,
        t.promoter || '',
        t.contact || t.email || '',
        t.market || '',
        t.instagram || '',
        t.outreach || '',
        t.status || '',
        t.notes || '',
        t.next_action || '',
      ];
      vals.forEach((v, ci) => {
        const cell = row.getCell(ci + 1);
        cell.value = v;
        cell.fill = fillObj(C.darkBg);
        cell.font = fontObj(C.lightGray, false, 10);
        cell.border = thinBorder();
        cell.alignment = { vertical: 'middle' };
      });
    });
  }

  return ws;
}

async function generateArtistGrid(artistInfo, artistShows, targets, artistRecord) {
  const wb = new ExcelJS.Workbook();
  const artistName = artistRecord ? artistRecord.name : artistInfo.file;

  // Tab 1: 2026 Touring Grid
  buildTouringTab(wb, '2026 Touring Grid', YEAR, artistName, artistShows, true);

  // Tab 2: 2027 Touring Grid
  buildTouringTab(wb, '2027 Touring Grid', YEAR2, artistName, [], false);

  // Tab 3: Festival Calendar
  buildFestivalCalendarTab(wb);

  // Tab 4: Target List
  buildTargetListTab(wb, artistName, targets);

  // Write file
  const outDir = path.join(GRIDS_BASE, artistInfo.folder);
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `Corson_${artistInfo.file}_2026.xlsx`);
  await wb.xlsx.writeFile(outPath);
  return outPath;
}

// ── MAIN ────────────────────────────────────────────────────────────────────
async function main() {
  const { shows, pipeline, targets, artists } = await fetchData();

  // Build lookups
  const showsByArtist = groupShowsByArtist(shows);
  const targetsByArtist = groupTargetsByArtist(targets);
  const artistsBySlug = {};
  for (const a of artists) {
    artistsBySlug[a.slug] = a;
  }

  // Shogun targets as fallback
  const shogunTargets = targetsByArtist['shogun'] || [];

  // 1. Generate master grid
  console.log('\n--- Generating Master Touring Grid ---');
  const masterStats = await generateMasterGrid(shows, artists);

  // 2. Generate individual artist grids
  console.log('\n--- Generating Individual Artist Grids ---');
  let gridCount = 0;
  for (const info of ARTIST_MAP) {
    try {
      const artistShows = showsByArtist[info.slug] || [];
      let artistTargets = targetsByArtist[info.slug];
      if (!artistTargets || artistTargets.length === 0) {
        artistTargets = shogunTargets; // fallback
      }
      const artistRecord = artistsBySlug[info.slug];
      const outPath = await generateArtistGrid(info, artistShows, artistTargets, artistRecord);
      console.log(`  ${info.file} -> ${outPath}`);
      gridCount++;
    } catch (err) {
      console.error(`  ERROR ${info.file}: ${err.message}`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log(`Generated ${gridCount} artist grids, Master grid with ${masterStats.totalShowRows} shows, ${masterStats.totalFestivalRows} festival rows`);
  console.log('='.repeat(60));
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
