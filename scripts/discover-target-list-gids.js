#!/usr/bin/env node
/*
 * Discover the real #gid=<num> for each artist's Target List tab.
 *
 * For Excel-in-Drive sheets (the .xlsx format shown by `rtpof=true` in the
 * URL), tabs are NOT numbered 0,1,2,3 — they use large generated ids. Each
 * artist's sheet has its own unique id per tab. We can't hardcode.
 *
 * This script drives Chrome via AppleScript to:
 *   1. Navigate to each artist's touring_grid_url in ONE reused Chrome tab
 *   2. Wait for the sheet to load
 *   3. Dispatch a proper mouse sequence on the 4th .docs-sheet-tab (Target List)
 *   4. Read location.hash to capture the resulting gid
 *   5. UPDATE artists.target_list_url = touring_grid_url + '#gid=<gid>'
 *
 * Prerequisites:
 *   - Chrome is running
 *   - Chrome → View → Developer → Allow JavaScript from Apple Events is enabled
 *   - The user is signed into a Google account with access to all 27 sheets
 *
 *   node scripts/discover-target-list-gids.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PROJECT = path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
const env = {};
for (const line of raw.split('\n')) { const i = line.indexOf('='); if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
const { createClient } = require(path.join(PROJECT, 'node_modules/@supabase/supabase-js/dist/index.cjs'));
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

function runJSInSheetsTab(jsSource, urlFragment) {
  const tmp = path.join('/tmp', `corson_probe_${process.pid}_${Date.now()}.js`);
  fs.writeFileSync(tmp, jsSource);
  const applescript = `
    set jsSource to read POSIX file "${tmp}" as «class utf8»
    tell application "Google Chrome"
      repeat with w in windows
        repeat with t in tabs of w
          if URL of t contains "${urlFragment}" then
            return (execute t javascript jsSource)
          end if
        end repeat
      end repeat
      return "NO_TAB"
    end tell
  `;
  try {
    return execFileSync('osascript', ['-e', applescript], { encoding: 'utf8', timeout: 20_000 }).trim();
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

function navigateTab(fromFragment, newUrl) {
  // Reuse the currently-open Sheets tab; if none, open a new one.
  const applescript = `
    tell application "Google Chrome"
      set foundTab to missing value
      repeat with w in windows
        repeat with t in tabs of w
          if URL of t contains "${fromFragment}" then
            set foundTab to t
            exit repeat
          end if
        end repeat
        if foundTab is not missing value then exit repeat
      end repeat
      if foundTab is missing value then
        set foundTab to make new tab at end of tabs of window 1 with properties {URL:"${newUrl}"}
      else
        set URL of foundTab to "${newUrl}"
      end if
      return URL of foundTab
    end tell
  `;
  return execFileSync('osascript', ['-e', applescript], { encoding: 'utf8' }).trim();
}

function sleep(ms) { execFileSync('sleep', [String(ms / 1000)]); }

async function discoverGid(artist) {
  if (!artist.touring_grid_url) return { ok: false, reason: 'no touring_grid_url' };
  const fileIdMatch = artist.touring_grid_url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (!fileIdMatch) return { ok: false, reason: 'no file id' };
  const fileId = fileIdMatch[1];

  // 1) Navigate the sheets tab to this artist's sheet
  navigateTab('spreadsheets/d/', artist.touring_grid_url);
  sleep(6000); // let sheet render

  // 2) Click the 4th tab via a full mousedown/mouseup/click sequence (plain .click() doesn't work on Excel-in-Drive)
  const clickJS = `(function(){
    var tabs = document.querySelectorAll('.docs-sheet-tab');
    if (tabs.length < 4) return 'FEW_TABS:' + tabs.length;
    var target = tabs[3];
    var r = target.getBoundingClientRect();
    ['mousedown','mouseup','click'].forEach(function(type){
      target.dispatchEvent(new MouseEvent(type, {bubbles:true,cancelable:true,view:window,button:0,buttons:1,clientX:r.left+r.width/2,clientY:r.top+r.height/2}));
    });
    return 'clicked:' + target.textContent.trim();
  })();`;
  const clickRes = runJSInSheetsTab(clickJS, fileId);
  sleep(1500);

  // 3) Read hash
  const readJS = `(function(){
    var active = -1;
    document.querySelectorAll('.docs-sheet-tab').forEach(function(t,i){ if(t.classList.contains('docs-sheet-active-tab')) active = i; });
    return JSON.stringify({active: active, hash: location.hash, text: active >= 0 ? document.querySelectorAll('.docs-sheet-tab')[active].textContent.trim() : null});
  })();`;
  const readRes = runJSInSheetsTab(readJS, fileId);
  let parsed; try { parsed = JSON.parse(readRes); } catch { return { ok: false, reason: 'unparseable: ' + readRes.slice(0, 80) }; }

  const m = (parsed.hash || '').match(/gid=(\d+)/);
  if (!m) return { ok: false, reason: `click=${clickRes} read=${readRes.slice(0, 80)}` };
  if (parsed.active !== 3) return { ok: false, reason: `active tab ${parsed.active}, expected 3` };
  return { ok: true, gid: m[1], tabName: parsed.text };
}

(async () => {
  const { data: artists, error } = await supabase
    .from('artists')
    .select('slug, name, touring_grid_url, target_list_url')
    .not('touring_grid_url', 'is', null)
    .order('slug');
  if (error) { console.error('load error:', error.message); process.exit(1); }

  console.log(`Discovering Target List gids for ${artists.length} artists via Chrome…\n`);
  const results = [];
  for (let i = 0; i < artists.length; i++) {
    const a = artists[i];
    process.stdout.write(`[${i+1}/${artists.length}] ${a.slug.padEnd(20)} `);
    try {
      const res = await discoverGid(a);
      if (res.ok) {
        const base = a.touring_grid_url.split('#')[0];
        const targetUrl = `${base}#gid=${res.gid}`;
        const { error: uerr } = await supabase.from('artists').update({ target_list_url: targetUrl }).eq('slug', a.slug);
        if (uerr) { console.log(`ERR update: ${uerr.message}`); results.push({ slug: a.slug, status: 'err' }); continue; }
        console.log(`✓ gid=${res.gid}`);
        results.push({ slug: a.slug, status: 'ok', gid: res.gid });
      } else {
        console.log(`SKIP: ${res.reason}`);
        results.push({ slug: a.slug, status: 'skip', reason: res.reason });
      }
    } catch (e) {
      console.log(`ERR: ${e.message.split('\n')[0].slice(0, 100)}`);
      results.push({ slug: a.slug, status: 'err', reason: e.message.slice(0, 100) });
    }
  }

  const ok = results.filter(r => r.status === 'ok').length;
  const skip = results.filter(r => r.status === 'skip').length;
  const err = results.filter(r => r.status === 'err').length;
  console.log(`\nDone. ok=${ok} skip=${skip} err=${err}`);
})().catch(e => { console.error('fatal:', e.message); process.exit(1); });
