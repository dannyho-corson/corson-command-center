/**
 * Corson Command Center — Buyer Rolodex Seed
 * Reads Danny - Techno Venues_Promoters .xlsx and seeds all contacts
 * into the Supabase buyers table (3 sheets: Main, Europe, Graveyard).
 *
 * Run: node scripts/seed-buyers.mjs
 */

import { createRequire } from 'module';
import { createClient } from '/Users/dannyho94/corson-command-center/node_modules/@supabase/supabase-js/dist/index.mjs';

const require = createRequire(import.meta.url);
const XLSX = require('/Users/dannyho94/corson-command-center/node_modules/xlsx/xlsx.js');

const SUPABASE_URL = 'https://smueknsapnvyrdfnnkkq.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtdWVrbnNhcG52eXJkZm5ua2txIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQxNzQsImV4cCI6MjA5MTA5MDE3NH0.ycYKQtF5JTb1bcDuRdFk-PrwNl15qf0f39ac2GzUWLc';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const XLSX_PATH = '/Users/dannyho94/Downloads/Danny - Techno Venues_Promoters .xlsx';

// Section header names in the Main sheet — rows to skip
const SECTION_HEADERS = new Set(['UNDERGROUND A', 'UNDERGROUND B', 'AAA BUYERS']);

// ── HELPERS ───────────────────────────────────────────────────────────────────
function clean(val) {
  return (val ?? '').toString().trim();
}

function isRedFlag(notes) {
  const n = notes.toLowerCase();
  return n.includes('red flag') || n.includes('burned') || n.includes('do not book');
}

function inferStatus(sheetName, rowNotes) {
  if (sheetName === 'Graveyard') {
    return isRedFlag(rowNotes) ? 'Red Flag' : 'Graveyard';
  }
  return 'Cold';
}

function parseRow(row, sheetName, sectionLabel) {
  const name    = clean(row['Promoter/Venue '] || row['Promoter/Venue'] || '');
  const email   = clean(row['Email ']          || row['Email']          || '');
  const market  = clean(row['City/State ']     || row['City/State']     || '');
  const ig      = clean(row['IG Handle ']      || row['IG Handle']      || '');
  const notes   = clean(row['Notes']           || '');
  const extra   = clean(row['__EMPTY']         || '');

  if (!name) return null;

  // Skip section-header rows (no email, city, or IG)
  const isHeader = SECTION_HEADERS.has(name.replace(/\s+$/, ''));
  if (isHeader) return null;

  // Build combined notes
  const notesParts = [];
  if (notes) notesParts.push(notes);
  if (extra && extra !== notes) notesParts.push(extra);
  if (sectionLabel) notesParts.push(`[${sectionLabel}]`);
  const fullNotes = notesParts.join(' · ') || null;

  return {
    name,
    company: name,   // promoter/venue name is the company
    market:  market || null,
    email:   email  || null,
    instagram: ig   || null,
    region:  sheetName === 'Europe' ? 'Europe' : 'US',
    status:  inferStatus(sheetName, fullNotes || ''),
    notes:   fullNotes,
    artists_worked: null,
  };
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
async function seed() {
  console.log('📖 Reading Excel file…');
  const wb = XLSX.readFile(XLSX_PATH);
  console.log('Sheets found:', wb.SheetNames.join(', '));

  const buyers = [];

  // Process each sheet
  for (const sheetName of wb.SheetNames) {
    const ws    = wb.Sheets[sheetName];
    const rows  = XLSX.utils.sheet_to_json(ws, { defval: '' });

    let currentSection = null;

    for (const row of rows) {
      const name = clean(row['Promoter/Venue '] || row['Promoter/Venue'] || '');

      // Track section header for context
      if (SECTION_HEADERS.has(name.replace(/\s+$/, ''))) {
        currentSection = name.trim();
        continue;
      }

      const buyer = parseRow(row, sheetName, currentSection);
      if (buyer) buyers.push(buyer);
    }

    console.log(`  ${sheetName}: processed`);
  }

  console.log(`\nTotal buyers parsed: ${buyers.length}`);

  // ── CLEAR EXISTING BUYERS ──
  console.log('\nClearing existing buyers table…');
  const { error: delErr } = await supabase.from('buyers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (delErr) {
    console.error('❌ Delete failed:', delErr.message);
    process.exit(1);
  }
  console.log('✅ Cleared');

  // ── INSERT IN BATCHES OF 100 ──
  console.log('\nInserting buyers in batches…');
  const BATCH = 100;
  let inserted = 0;

  for (let i = 0; i < buyers.length; i += BATCH) {
    const batch = buyers.slice(i, i + BATCH);
    const { error } = await supabase.from('buyers').insert(batch);
    if (error) {
      console.error(`❌ Batch ${Math.floor(i / BATCH) + 1} failed:`, error.message);
      console.error('First row of failed batch:', JSON.stringify(batch[0]));
      process.exit(1);
    }
    inserted += batch.length;
    console.log(`  Batch ${Math.floor(i / BATCH) + 1}: ${inserted}/${buyers.length} inserted`);
  }

  console.log(`\n🎉 Done! ${inserted} buyers seeded into Supabase.`);

  // ── SUMMARY ──
  const statusCounts = buyers.reduce((acc, b) => {
    acc[b.status] = (acc[b.status] || 0) + 1;
    return acc;
  }, {});
  console.log('\nStatus breakdown:');
  Object.entries(statusCounts).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
}

seed();
