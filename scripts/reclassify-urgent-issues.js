#!/usr/bin/env node
/*
 * One-off: reclassify every unresolved urgent_issues row's priority column
 * using the Corson TODO rubric (High/Medium/Low = DO TODAY / THIS WEEK / THIS MONTH).
 *
 * Calls Claude once with all unresolved issues + the rubric, gets back a mapping
 * of {id → priority}, then applies via Supabase UPDATE.
 *
 *   node scripts/reclassify-urgent-issues.js
 */
const fs = require('fs');
const path = require('path');

const PROJECT = path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
const env = {};
for (const line of raw.split('\n')) { const i = line.indexOf('='); if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }

const { createClient } = require(path.join(PROJECT, 'node_modules/@supabase/supabase-js/dist/index.cjs'));
const Anthropic = require(path.join(PROJECT, 'node_modules/@anthropic-ai/sdk')).default;

const CLAUDE_MODEL = 'claude-opus-4-7';
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

const RUBRIC = `Assign priority to each urgent issue using these rules EXACTLY:

"High" (DO TODAY — red) — any of:
  - Show is within 7 days and something is missing (contract, deposit, advancing info)
  - Deposit is overdue
  - Contract deadline has passed
  - Buyer has been waiting 48+ hours for a response
  - Competing offers on the same date need resolution today
  - Radius-clause conflict flagged

"Medium" (DO THIS WEEK — yellow) — any of:
  - Active negotiation needing follow-up
  - Offer received, needs forwarding to artist team
  - Avail check that came in this week
  - Show is within 30 days and needs advancing started
  - Payment follow-up needed (not yet overdue)

"Low" (DO THIS MONTH — green) — any of:
  - Early-stage inquiry
  - Festival pitch opportunity
  - Relationship building / outreach
  - Show is 30+ days out with no immediate blocker

If an item doesn't clearly fit any bucket, default to "Medium".`;

(async () => {
  if (!env.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY === 'your-new-key') {
    console.error('ANTHROPIC_API_KEY missing or placeholder in scripts/.env');
    process.exit(1);
  }
  const { data: rows, error } = await supabase
    .from('urgent_issues')
    .select('id, artist_slug, issue, priority, created_at')
    .eq('resolved', false)
    .order('created_at', { ascending: false });
  if (error) { console.error('load error:', error.message); process.exit(1); }
  if (!rows || rows.length === 0) { console.log('No unresolved urgent issues.'); return; }

  console.log(`Loaded ${rows.length} unresolved urgent issues`);
  const today = new Date().toISOString().slice(0, 10);

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const systemPrompt = `You are the Corson Agency booking intelligence assistant. You are classifying the priority of existing urgent items in Danny Ho's TODO list for a hard-techno booking agency.

Today's date: ${today}.

${RUBRIC}

Return ONLY a JSON array — no prose, no preamble. Each element has the shape:
{"id": "<uuid>", "priority": "High|Medium|Low"}

Include every input id exactly once.`;

  const userMessage = JSON.stringify({
    items: rows.map(r => ({ id: r.id, artist_slug: r.artist_slug, issue: r.issue, flagged_on: r.created_at?.slice(0, 10) })),
  }, null, 2);

  console.log(`Calling Claude ${CLAUDE_MODEL}…`);
  const resp = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });
  const text = resp.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) { console.error('No JSON array in Claude response:\n', text); process.exit(1); }
  const assignments = JSON.parse(m[0]);

  const byId = new Map(assignments.map(a => [a.id, a.priority]));
  console.log(`Claude returned ${assignments.length} assignments`);

  let updated = 0, unchanged = 0, errs = 0, missing = 0;
  const counts = { High: 0, Medium: 0, Low: 0 };
  for (const row of rows) {
    const next = byId.get(row.id);
    if (!next) { missing++; continue; }
    if (!['High', 'Medium', 'Low'].includes(next)) { missing++; continue; }
    counts[next]++;
    if (next === row.priority) { unchanged++; continue; }
    const { error: uerr } = await supabase.from('urgent_issues').update({ priority: next }).eq('id', row.id);
    if (uerr) { console.error(`  ERR ${row.id}: ${uerr.message}`); errs++; continue; }
    console.log(`  ${row.priority || '—'} → ${next}  [${row.artist_slug}]  ${row.issue.slice(0, 80)}`);
    updated++;
  }
  console.log(`\nDone. updated=${updated} unchanged=${unchanged} missing=${missing} errors=${errs}`);
  console.log(`Distribution: High=${counts.High}  Medium=${counts.Medium}  Low=${counts.Low}`);
})().catch(e => { console.error('fatal:', e.message); process.exit(1); });
