# Corson Agency — Booking Command Center

Internal dashboard for Corson Agency (talent booking agency) built by Danny Ho. Manages artist rosters, show bookings, deal pipeline, buyer contacts, financials, and touring grids.

## Tech Stack

- **Frontend:** React 19 + React Router 7 + Tailwind CSS 3
- **Backend/DB:** Supabase (hosted Postgres + JS client)
- **Hosting:** Vercel
- **Supabase URL:** `https://smueknsapnvyrdfnnkkq.supabase.co`
- **Credentials:** stored in `scripts/.env` (SUPABASE_URL, SUPABASE_ANON_KEY)
- **GitHub:** `dannyho-corson/corson-command-center` (private)

## Supabase Tables

| Table | Purpose |
|-------|---------|
| `artists` | Roster — id, name, slug, genre, base, category, spotify, instagram |
| `shows` | Confirmed/contracted/settled bookings — artist_slug, fee, deal_type, venue, city, promoter, event_date |
| `pipeline` | Active deals in progress — artist_slug, stage, fee_offered, venue, market, buyer, buyer_company, event_date |
| `buyers` | Promoter/buyer contacts (Rolodex) — name, company, market, email, status |
| `activity_log` | Per-artist activity feed — artist_slug, action, description |
| `reminders` | Follow-up reminders — reminder_date, completed |
| `targets` | Target promoters/markets per artist — artist_slug, promoter, market, status, priority_order |
| `urgent_issues` | Flagged issues — artist_slug, issue, priority, resolved |

## The Corson Agency 5-Stage Booking Pipeline

Stages 01-02 live in the `pipeline` table (column: `stage`). Stages 03-05 live in the `shows` table (column: `deal_type`).

### Stage 01 — Inquiry / Request
Buyer reaches out asking about availability or pitching a show.
- Could be avail check, general inquiry, or show pitch
- Respond within 24 hours — no exceptions
- Qualify the buyer: venue cap, budget range, ticket price, who else on bill, 18+ or 21+?
- Push all communication to email
- Check touring grid for availability immediately
- Check radius clauses

### Stage 02 — Offer In + Negotiating
Written offer received via email. **THIS IS REAL.**
- Nothing is real until written offer arrives via email
- Pre-negotiate if numbers are way off before forwarding to artist
- Once offer is solid → forward to artist and management **same day**
- Anchor high — you can come down, never go up
- Use Spotify stats, festival history, market demand as leverage
- 50% deposit non-negotiable
- Follow up every 7 days if no response
- Radius clauses create scarcity — use them

### Stage 03 — Confirmed
Both sides agree on terms.
- Send confirmation email within 24hrs in exact Corson format:
  - Subject: `CONFIRMED: Artist (MM-DD-YYYY) City, State [Venue]`
  - CC management + agents
  - BCC `bookings@corsonagency.com`
- Send contract immediately after confirmation
- Issue 50% deposit invoice immediately
- Collect deposit before any public announcement
- 72-hour contract return deadline

### Stage 04 — Advancing
60-90 days out for festivals, 30 days for clubs.
- Monitor promotion and marketing materials
- Travel: flights, ground, hotel confirmed
- Technical: stage plot, input list, backline
- Hospitality: rider fulfilled, catering, dressing room
- Financial: deposit confirmed, balance method set
- Day of show: set time, load in, soundcheck, guest list
- Management team drives advancing — we keep overall eye
- Promo: press kit, approved photos, social assets

### Stage 05 — Settled
Show happened. Money in. Deal closed.
- Collect remaining balance day of show (usually 50%)
- ECR issued by Provident Financial
- Artist approves ECR
- Direct deposit to artist
- Deal logged complete in master spreadsheet
- Buyer relationship note added
- Post-show debrief captured

### Key rules (apply to all stages)
- 50% deposit non-negotiable
- Nothing is real until written offer via email
- No announcement before deposit cleared
- Anchor high in negotiation — never go up, only down
- BCC `bookings@corsonagency.com` on all confirmations
- Follow up every 7 days on anything in Stage 02

## Artist Slugs

**Priority artists:**
shogun, junkie-kid, clawz, drakk, hellbound, triptykh, morelia, ketting, mad-dog, anime, dr-greco

**Full roster:**
anoluxx, water-spirit, dea-magna, jenna-shaw, jay-toledo, naomi-luna, gioh-cecato, pixie-dust, death-code, taylor-torrence, sihk, lara-klart, cyboy, mandy, fernanda-martins, jayr

**Leo's artists:**
tnt, dual-damage, the-purge, casska, sub-zero-project, melody-man, frontliner

Artist slugs are lowercase-hyphenated and used as foreign keys across all tables (`artist_slug`).

## Key Files

```
src/
  App.js                  — main router + dashboard home (loads artists, shows, pipeline, reminders)
  lib/supabase.js         — Supabase client init (URL + anon key)
  data/artists.js         — artist metadata, slugs, categories, priority lists
  pages/
    Pipeline.js           — kanban board + deal entry (COLUMNS config maps stages to kanban cols)
    ArtistDetail.js       — single artist view (shows, pipeline, activity log, edit artist)
    ArtistList.js         — roster grid with show counts
    ArtistShare.js        — public shareable artist page
    TouringGrid.js        — per-artist touring calendar
    Rolodex.js            — buyer/promoter contact manager
    Financials.js         — revenue tracking by artist/period
    TargetList.js         — target promoters/markets per artist
  components/
    Nav.js                — global nav with universal search (artists, buyers, pipeline)
  lib/
    activityLog.js        — helper to insert activity_log entries
scripts/
  .env                    — SUPABASE_URL, SUPABASE_ANON_KEY, ANTHROPIC_API_KEY
  seed.mjs                — seed artists table
  seed-buyers.mjs         — seed buyers table
  sync-log.txt            — legacy sync run log
sql/                      — SQL migration files
```

## Folder Structure: ~/Documents/Corson Agency/

```
Archive/                  — old/archived files
Artist Grids/             — per-artist folders with grid assets (one folder per artist)
Exports/                  — exported reports and logs
  briefing-log.txt        — one-line-per-run log from daily briefing
Templates/                — reusable document templates
```

## Scheduled Task: corson-daily-briefing

**Location:** `~/.claude/scheduled-tasks/corson-daily-briefing/SKILL.md`
**Schedule:** Daily at 10:06 AM local time (cron: `0 10 * * *`)

**What it does:**
1. Opens Outlook inbox via Chrome MCP tools
2. Reads today's emails and classifies them (shows, pipeline deals, urgent issues, activity)
3. Inserts extracted data into Supabase (with dedup, artist validation, date parsing)
4. Prints full verification output
5. Appends run summary to `~/corson-command-center/scripts/sync-log.txt`
6. Appends one-line summary to `~/Documents/Corson Agency/Exports/briefing-log.txt`

**Safeguards:**
- Hard 8-minute timeout — exits cleanly if exceeded
- All Chrome MCP permissions pre-approved (never waits for clicks)
- Dollar signs in fees preserved via heredoc pattern (never shell-interpolated)
- Errors in one step don't abort the whole run

## Data Rules

- **Fee values** are stored as-is from emails: `$2,500`, `$1,800+HGR`, `€3,000 ATA`. Never strip currency symbols or normalize.
- **Deduplication:** same artist_slug + event_date = skip (shows and pipeline). Same artist_slug + issue = skip (urgent_issues). Activity log always inserts.
- **Artist validation:** look up `artist_id` from `artists` table by slug before inserting. Skip and warn if not found.

## What's Built

- **Dashboard** (`src/App.js`) — KPI cards. YTD commission calculated as 15% of confirmed/contracted/advancing show fees (no placeholder fallback).
- **Pipeline kanban** (`src/pages/Pipeline.js`) — drag-through stages, inline **Quick Notes** textarea on every deal card (auto-saves to `notes` column on blur), detail panel with stage selector.
- **Stage 04 Offer Forward Email drafter** (`src/components/OfferForwardEmailModal.js`) — triggers on stage=`Offer In` in the detail panel. Pre-fills email to `artist.manager_email` with a "My Notes" field for Danny's opinion (appended before signature).
- **Stage 06 Confirmation Email drafter** (`src/components/ConfirmationEmailModal.js`) — triggers on Confirmed/Contracted/Advanced/Settled. Pre-fills Corson-standard confirmation: `CONFIRMED: Artist (MM-DD-YYYY) City, State [Venue]` + CC management + BCC bookings@.
- **Artist Detail** (`src/pages/ArtistDetail.js`) — per-artist dashboard with shows, pipeline, activity log, Touring Grid link + Sync-from-Sheet button.
- **Morning briefing** — `~/.claude/scheduled-tasks/corson-daily-briefing/SKILL.md`; runs Mon-Fri 10:06 AM; inbox scan + 7-day stale-Negotiating follow-up flagging as `urgent_issues`.
- **Grid generator** — `node scripts/generate-grids.js` rebuilds Master Touring Grid + 28 individual Excel files from Supabase.

## Architecture — Data Flow

Supabase is the **single source of truth**. Everything flows from it:

```
Email → Morning briefing → Supabase → App updates live
                                    → Excel grids (generated output)
                                    → Google Sheets (generated output)
```

- Excel files and Google Sheets are **outputs** generated from Supabase.
- Never edit Excel directly — regenerate with `node scripts/generate-grids.js`.
- Google Sheets can be edited in a pinch, then synced back via "Sync from Sheet" button on artist detail pages.
- The `generate-grids.js` script produces the Master Touring Grid and all 27 individual artist Excel files.

## Running Locally

```bash
npm start                       # dev server on localhost:3000
npm run build                   # production build (deployed to Vercel)
npm run seed                    # seed artists table
npm run seed:buyers             # seed buyers table
node scripts/generate-grids.js  # regenerate all Excel touring grids from Supabase
```
