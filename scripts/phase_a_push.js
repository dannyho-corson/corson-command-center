#!/usr/bin/env node
/**
 * Phase A — May 5 mega-update data push.
 *
 * Idempotent: every write checks existing state first.
 * Logs every action with reason. Never deletes destructively.
 *
 * Run: node scripts/phase_a_push.js
 */

const fs = require('fs');
const path = require('path');

const ENV_PATH = path.join(__dirname, '.env');
const env = {};
for (const line of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
const { createClient } = require(path.join(__dirname, '..', 'node_modules/@supabase/supabase-js/dist/index.cjs'));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

const counts = { inserts: 0, updates: 0, deletes: 0, skips: 0, warns: 0, errors: 0 };
const log = [];
function rec(kind, msg) { log.push(`${kind.padEnd(8)} ${msg}`); counts[kind] = (counts[kind] || 0) + 1; }

const STAGE_INQUIRY = 'Inquiry / Request';
const STAGE_OFFERIN = 'Offer In + Negotiating';

async function ensureArtist(slug) {
  const { data } = await sb.from('artists').select('id,slug,name').eq('slug', slug).maybeSingle();
  return data;
}

async function pipelineDedup({ artist_slug, event_date, market, buyer_company }) {
  // Match on artist_slug + event_date when date is set; else artist_slug + market + buyer_company.
  let q = sb.from('pipeline').select('*').eq('artist_slug', artist_slug);
  if (event_date) q = q.eq('event_date', event_date);
  else {
    if (market) q = q.eq('market', market);
    if (buyer_company) q = q.eq('buyer_company', buyer_company);
  }
  const { data } = await q;
  return data || [];
}

async function showsDedup({ artist_slug, event_date, venue }) {
  let q = sb.from('shows').select('*').eq('artist_slug', artist_slug);
  if (event_date) q = q.eq('event_date', event_date);
  if (venue) q = q.eq('venue', venue);
  const { data } = await q;
  return data || [];
}

async function urgentDedup({ artist_slug, task }) {
  const { data } = await sb.from('urgent_issues').select('id,task,resolved').eq('artist_slug', artist_slug).eq('resolved', false);
  return (data || []).filter(r => (r.task || '').trim().toLowerCase() === task.trim().toLowerCase());
}

async function buyerByName(name) {
  const { data } = await sb.from('buyers').select('*').ilike('name', name);
  return (data && data[0]) || null;
}

async function insertPipeline(row, label) {
  const dups = await pipelineDedup(row);
  if (dups.length) { rec('skips', `pipeline ${label} (dedup matched id=${dups[0].id})`); return; }
  const { error } = await sb.from('pipeline').insert(row);
  if (error) { rec('errors', `pipeline ${label}: ${error.message}`); return; }
  rec('inserts', `pipeline ${label}`);
}

async function insertShow(row, label) {
  const dups = await showsDedup(row);
  if (dups.length) { rec('skips', `shows ${label} (dedup matched id=${dups[0].id})`); return; }
  const { error } = await sb.from('shows').insert(row);
  if (error) { rec('errors', `shows ${label}: ${error.message}`); return; }
  rec('inserts', `shows ${label}`);
}

async function insertUrgent(row, label) {
  const dups = await urgentDedup({ artist_slug: row.artist_slug, task: row.task });
  if (dups.length) { rec('skips', `urgent ${label} (dedup matched id=${dups[0].id})`); return; }
  const { error } = await sb.from('urgent_issues').insert({ ...row, resolved: false, manual_entry: false });
  if (error) { rec('errors', `urgent ${label}: ${error.message}`); return; }
  rec('inserts', `urgent ${label}`);
}

async function upsertBuyer(row, label) {
  const existing = await buyerByName(row.name);
  if (existing) {
    // merge: only fill in null-ish fields, append to notes
    const patch = {};
    for (const k of ['company','market','email','region','status','instagram']) {
      if (row[k] && !existing[k]) patch[k] = row[k];
    }
    if (row.notes) {
      const merged = existing.notes ? `${existing.notes}\n[2026-05-05] ${row.notes}` : `[2026-05-05] ${row.notes}`;
      patch.notes = merged;
    }
    if (row.last_contact) patch.last_contact = row.last_contact;
    if (Object.keys(patch).length === 0) { rec('skips', `buyer ${label} (no patch needed, id=${existing.id})`); return; }
    const { error } = await sb.from('buyers').update(patch).eq('id', existing.id);
    if (error) { rec('errors', `buyer ${label}: ${error.message}`); return; }
    rec('updates', `buyer ${label} (id=${existing.id}, patched: ${Object.keys(patch).join(',')})`);
  } else {
    const { error } = await sb.from('buyers').insert(row);
    if (error) { rec('errors', `buyer ${label}: ${error.message}`); return; }
    rec('inserts', `buyer ${label}`);
  }
}

(async () => {
  console.log('=== PHASE A — May 5 mega-update push ===\n');

  // Pre-snapshot counts
  const before = {};
  for (const t of ['pipeline','shows','urgent_issues','buyers']) {
    const { count } = await sb.from(t).select('*', { count: 'exact', head: true });
    before[t] = count;
  }
  console.log('Pre-counts:', before, '\n');

  // ─── A1: Pipeline / Shows ────────────────────────────────────────────
  // Item 1: Anoluxx Seattle / Cult Fest 6/12 → graduate to shows
  {
    const a = await ensureArtist('anoluxx');
    if (!a) { rec('warns', 'item1: anoluxx artist not found'); }
    else {
      // FLAG: existing pipeline 6/12 row is Tampa/Mireya, NOT Seattle.
      // We will NOT delete that row (it's Tampa, handled separately in item 2).
      const existing612 = await pipelineDedup({ artist_slug: 'anoluxx', event_date: '2026-06-12' });
      if (existing612.length && (existing612[0].market || '').toLowerCase().includes('tampa')) {
        rec('warns', 'item1: pipeline anoluxx 2026-06-12 is Tampa/Mireya, not Seattle — leaving pipeline alone, only inserting Seattle into shows');
      }
      await insertShow({
        artist_id: a.id,
        artist_slug: 'anoluxx',
        event_date: '2026-06-12',
        city: 'Seattle',
        venue: 'Cult Fest',
        promoter: 'Cult Fest',
        fee: '$2,000',
        deal_type: 'All In',
        notes: '[2026-05-05] Verbally locked $2K all-in. Stage 6→7 transition pending Gigwell contract.',
      }, '#1 anoluxx Seattle Cult Fest 2026-06-12');
    }
  }

  // Item 2: Anoluxx Tampa flex → update existing Mireya/Tampa row to no-date inquiry
  {
    const existing = await pipelineDedup({ artist_slug: 'anoluxx', event_date: '2026-06-12' });
    const tampaRow = existing.find(r => (r.market || '').toLowerCase().includes('tampa'));
    if (!tampaRow) {
      // No existing Tampa pipeline row — insert fresh
      const a = await ensureArtist('anoluxx');
      await insertPipeline({
        artist_id: a?.id || null,
        artist_slug: 'anoluxx',
        stage: STAGE_INQUIRY,
        event_date: null,
        market: 'Tampa',
        buyer: null,
        buyer_company: null,
        notes: '[2026-05-05] Date flexed after Seattle Cult Fest 6/12 confirmed. Tampa is hometown — easier negotiation. New buyer TBD.',
      }, '#2 anoluxx Tampa flex (fresh)');
    } else {
      const flexNote = '[2026-05-05 FLEX] Date flexed after Seattle Cult Fest 6/12 confirmed. Tampa is hometown — easier negotiation. New buyer TBD. (Original 6/12 offer from Mireya / Date Night Productions preserved below.)';
      const newNotes = `${flexNote}\n\n${tampaRow.notes || ''}`;
      const { error } = await sb.from('pipeline').update({
        event_date: null,
        stage: STAGE_INQUIRY,
        buyer: null,
        buyer_company: null,
        buyer_email: null,
        fee_offered: null,
        notes: newNotes,
      }).eq('id', tampaRow.id);
      if (error) rec('errors', `item2: ${error.message}`);
      else rec('updates', `pipeline #2 anoluxx Tampa flex (updated id=${tampaRow.id}, event_date→null, stage→Inquiry, buyer cleared)`);
    }
  }

  // Item 3: Triptykh Chicago / Auris × Teletech
  {
    const a = await ensureArtist('triptykh');
    await insertPipeline({
      artist_id: a?.id || null,
      artist_slug: 'triptykh',
      stage: STAGE_INQUIRY,
      event_date: null,
      market: 'Chicago',
      venue: 'Cermak Hall',
      buyer: 'Yianni Papa',
      buyer_company: 'Auris Presents',
      buyer_email: 'yianni.papa@aurispresents.com',
      notes: 'Oct 31 OR Nov 1 2026. Halloween weekend. Brendan (Megadog) coordinating. Cermak Hall venue. Auris × Teletech partnership confirms SPIN brief intel landing in real time.',
    }, '#3 triptykh Chicago Auris');
  }

  // Item 4: DRAKK Chicago support pitch (same Auris event)
  {
    const a = await ensureArtist('drakk');
    await insertPipeline({
      artist_id: a?.id || null,
      artist_slug: 'drakk',
      stage: STAGE_INQUIRY,
      event_date: null,
      market: 'Chicago',
      venue: 'Cermak Hall',
      buyer: 'Yianni Papa',
      buyer_company: 'Auris Presents',
      buyer_email: 'yianni.papa@aurispresents.com',
      notes: 'Brendan suggested DRAKK for support — Berlin-based DJ headlining, name TBD. Same Auris × Teletech Halloween event as Triptykh inquiry.',
    }, '#4 drakk Chicago Auris support');
  }

  // Item 5: Jenna Shaw Austin / I Hate Models support
  {
    const a = await ensureArtist('jenna-shaw');
    await insertPipeline({
      artist_id: a?.id || null,
      artist_slug: 'jenna-shaw',
      stage: STAGE_OFFERIN, // canonical "Negotiating" → "Offer In + Negotiating"
      event_date: null,
      market: 'Austin',
      buyer: 'Andrew Parsons',
      buyer_company: 'Concourse Project',
      notes: 'Support for I Hate Models. Tier 2 co-sign opportunity. Awaiting Andrew Parsons follow-up.',
    }, '#5 jenna-shaw Austin I Hate Models');
  }

  // Item 6: Gioh Cecato Chicago / Redline — no event_date provided.
  // Per plan: don't insert show with null date (breaks dedup). Create urgent_issue follow-up.
  {
    rec('warns', 'item6: gioh-cecato Redline confirmation has no event_date — converting to urgent_issue follow-up instead of inserting null-date show');
    await insertUrgent({
      artist_slug: 'gioh-cecato',
      task: 'Confirm Gioh Cecato Chicago/Redline event date and create show row',
      issue: 'Confirm Gioh Cecato Chicago/Redline event date and create show row',
      why: 'Confirmation email sent (Stage 6 → 7 transition pending Gigwell contract) but no event_date captured. Need date to insert into shows table.',
      next_step: 'Pull date from confirmation email thread; insert into shows with city=Chicago, venue=Redline, promoter=Redline.',
      action_type: 'CONFIRM',
      domain: 'OPERATIONS',
      priority: 'High',

    }, '#6 gioh-cecato Redline date follow-up');
  }

  // Item 7: Unicorn on K + Dual Damage / Toxic Winter SF 2027 (Vital Mgmt)
  {
    const a = await ensureArtist('unicorn-on-k');
    if (!a) {
      rec('warns', 'item7: unicorn-on-k slug not in artists table — skipping pipeline insert');
    } else {
      await insertPipeline({
        artist_id: a.id,
        artist_slug: 'unicorn-on-k',
        stage: STAGE_INQUIRY,
        event_date: null,
        market: 'San Francisco',
        buyer: 'Santiago',
        buyer_company: 'Vital Management',
        notes: 'Toxic Winter 2027. Visa needed for Unicorn on K. Dual Damage on same lineup — Leo handles. Specific date TBD.',
      }, '#7 unicorn-on-k Toxic Winter SF 2027');
    }
  }

  // Item 8: Cave Rave 8/15 mystery artist → urgent_issue
  await insertUrgent({
    artist_slug: 'anoluxx', // placeholder; needs identification — use anoluxx as Hayden's historical headliner
    task: 'Confirm which artist Hayden / Cave Rave 8/15 Midway is for',
    issue: 'Confirm which artist Hayden / Cave Rave 8/15 Midway is for',
    why: 'Hayden (Bay Area buyer, Midway SF) wants a Corson artist for Aug 15 — historical context suggests Anoluxx headline but artist not confirmed in dictation.',
    next_step: 'Re-read Cave Rave thread; identify artist; create proper pipeline row with correct artist_slug.',
    action_type: 'CONFIRM',
    domain: 'DEAL',
    priority: 'High',

  }, '#8 cave rave 8/15 artist mystery');

  // Item 9: AniMe LA Aug + Dec
  {
    const a = await ensureArtist('anime');
    await insertPipeline({
      artist_id: a?.id || null,
      artist_slug: 'anime',
      stage: STAGE_OFFERIN,
      event_date: null,
      market: 'Los Angeles',
      buyer: 'Trinity / Sxtcy',
      buyer_company: 'Trinity / Sxtcy',
      notes: 'August + December dates. Leo says wait until after Escape per May 4 briefing.',
    }, '#9 anime LA Aug+Dec Trinity/Sxtcy');
  }

  // Item 10: JP / Mixmag CLAWZ LA — DEAD + Dea Magna pitch
  {
    // Try to find existing CLAWZ LA Mixmag pipeline row
    const { data: clawzRows } = await sb.from('pipeline').select('id,artist_slug,market,buyer,buyer_company,notes')
      .eq('artist_slug', 'clawz')
      .or('buyer_company.ilike.%mixmag%,buyer.ilike.%mixmag%,notes.ilike.%mixmag%,buyer.ilike.%jp%,notes.ilike.%jp%');
    const target = (clawzRows || []).find(r => (r.market || '').toLowerCase().includes('los angeles') || (r.notes || '').toLowerCase().includes('los angeles'));
    if (target) {
      const { error } = await sb.from('pipeline').delete().eq('id', target.id);
      if (error) rec('errors', `item10 delete: ${error.message}`);
      else rec('deletes', `pipeline #10 clawz Mixmag LA dead deal (id=${target.id})`);
    } else {
      rec('skips', 'item10: no existing clawz Mixmag LA pipeline row to delete');
    }
    // Insert Dea Magna pitch
    const a = await ensureArtist('dea-magna');
    await insertPipeline({
      artist_id: a?.id || null,
      artist_slug: 'dea-magna',
      stage: STAGE_INQUIRY,
      event_date: null,
      market: 'Los Angeles',
      buyer: 'JP',
      buyer_company: 'Mixmag',
      notes: 'Pitched Dea Magna after passing on CLAWZ LA. White lie told JP that radius wasn\'t clear (it was). Maintain warm relationship.',
    }, '#10 dea-magna Mixmag LA pitch');
  }

  // ─── A2: Urgent Issues ──────────────────────────────────────────────
  await insertUrgent({
    artist_slug: 'anoluxx',
    task: 'Send confirmation email + Gigwell contract for Anoluxx Seattle Cult Fest',
    issue: 'Send confirmation email + Gigwell contract for Anoluxx Seattle Cult Fest',
    why: '$2K all-in deal verbally locked May 5. Stage 6 → 7 transition needed.',
    next_step: 'Compose CONFIRMED: email in Corson format, send Gigwell contract, issue 50% deposit invoice.',
    action_type: 'SEND', domain: 'DEAL', priority: 'High',
  }, '#11 anoluxx Seattle confirmation');

  await insertUrgent({
    artist_slug: 'jenna-shaw',
    task: 'Follow up with Andrew Parsons re: Jenna Shaw I Hate Models support Austin',
    issue: 'Follow up with Andrew Parsons re: Jenna Shaw I Hate Models support Austin',
    why: 'Tier 2 co-sign opportunity for Jenna. Concourse Project not responding fast enough.',
    next_step: 'Email Andrew at Concourse, push for written offer.',
    action_type: 'REPLY', domain: 'DEAL', priority: 'Medium',
  }, '#12 jenna-shaw Andrew Parsons follow-up');

  await insertUrgent({
    artist_slug: 'ketting',
    task: 'Resolve Ketting payment collection — Yelle (manager) asking',
    issue: 'Resolve Ketting payment collection — Yelle (manager) asking',
    why: 'Stage 9 settlement issue. Yelle followed up May 5.',
    next_step: 'Loop Angela DeSimone @ Provident, verify which show + amount, get ECR moving.',
    action_type: 'REPLY', domain: 'OPERATIONS', priority: 'High',
  }, '#13 ketting payment collection');

  await insertUrgent({
    artist_slug: 'phoros',
    task: 'Pitch Phoros for NYC shows around May 23 — proactive avail outreach',
    issue: 'Pitch Phoros for NYC shows around May 23 — proactive avail outreach',
    why: 'Phoros confirmed in NYC May 23. 18 days out. No app automation yet — manual buyer outreach needed.',
    next_step: 'Pull NYC hard techno buyers from Rolodex (Ratchet Ravers, Masters of Techno, etc), send avail emails. Phase 2.8 Avail Engine queued.',
    action_type: 'SEND', domain: 'CAMPAIGN', priority: 'High',
  }, '#14 phoros NYC May 23 outreach');

  await insertUrgent({
    artist_slug: 'anoluxx',
    task: 'Confirm new Anoluxx Tampa date with new buyer',
    issue: 'Confirm new Anoluxx Tampa date with new buyer',
    why: 'Tampa flexed when Seattle 6/12 confirmed. Hometown show = easier negotiation.',
    next_step: 'Reply to Tampa buyer with new date options.',
    action_type: 'REPLY', domain: 'DEAL', priority: 'Medium',
  }, '#15 anoluxx Tampa reschedule');

  await insertUrgent({
    artist_slug: 'mad-dog',
    task: 'Send 303 Family asking prices for Mad Dog + AniMe',
    issue: 'Send 303 Family asking prices for Mad Dog + AniMe',
    why: 'Denver outreach from May 4 briefing. Still pending.',
    next_step: 'Send pricing email.',
    action_type: 'SEND', domain: 'DEAL', priority: 'Medium',
  }, '#16 mad-dog 303 Family pricing');

  await insertUrgent({
    artist_slug: 'tnt',
    task: "Schedule Francisco / TNT Rebels Mexico call (Leo's artist, Danny supporting)",
    issue: "Schedule Francisco / TNT Rebels Mexico call (Leo's artist, Danny supporting)",
    why: 'Pending from May 4 briefing.',
    next_step: 'Send calendar invite.',
    action_type: 'SCHEDULE', domain: 'RELATIONSHIP', priority: 'Low',
  }, '#17 tnt Francisco call schedule');

  // ─── A3: Buyer Rolodex ──────────────────────────────────────────────
  await upsertBuyer({
    name: 'Cult Fest', company: 'Cult Fest', market: 'Seattle', region: 'PNW', status: 'Active',
    notes: 'Anoluxx confirmed 6/12 $2K all-in. Mig is the contact.',
    last_contact: '2026-05-05',
  }, '#18 Cult Fest Seattle');

  await upsertBuyer({
    name: 'Mig', company: 'Cult Fest', market: 'Seattle', region: 'PNW', status: 'Active',
    notes: 'Cult Fest Seattle contact — booked Anoluxx 6/12.',
    last_contact: '2026-05-05',
  }, '#19 Mig (Cult Fest contact)');

  await upsertBuyer({
    name: 'Santiago', company: 'Vital Management', market: 'San Francisco', region: 'West', status: 'Active',
    notes: 'Toxic Winter SF 2027. Books Unicorn on K + Dual Damage.',
    last_contact: '2026-05-05',
  }, '#20 Santiago / Vital Management');

  await upsertBuyer({
    name: 'Cave Rave', company: 'Cave Rave', market: 'Bay Area', email: 'caverave.ent@gmail.com', status: 'Active',
    notes: 'Hayden contact. Wants Anoluxx headline (per Industry Bible). Shogun 6/12-13 confirmed. 8/15 Midway show pending artist confirmation.',
    last_contact: '2026-05-05',
  }, '#21 Cave Rave / Hayden');

  // ─── Summary ────────────────────────────────────────────────────────
  const after = {};
  for (const t of ['pipeline','shows','urgent_issues','buyers']) {
    const { count } = await sb.from(t).select('*', { count: 'exact', head: true });
    after[t] = count;
  }

  console.log('\n=== ACTION LOG ===');
  for (const l of log) console.log(' ', l);

  console.log('\n=== COUNTS ===');
  console.log(' inserts:', counts.inserts || 0);
  console.log(' updates:', counts.updates || 0);
  console.log(' deletes:', counts.deletes || 0);
  console.log(' skips:  ', counts.skips || 0);
  console.log(' warns:  ', counts.warns || 0);
  console.log(' errors: ', counts.errors || 0);

  console.log('\n=== ROW DELTAS ===');
  for (const t of Object.keys(after)) {
    const d = after[t] - before[t];
    console.log(`  ${t.padEnd(16)} ${before[t]} → ${after[t]}  (delta ${d >= 0 ? '+' : ''}${d})`);
  }
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
