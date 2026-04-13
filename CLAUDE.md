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

## Pipeline Stages (in order)

1. **Inquiry** — initial interest / availability request
2. **Request** — formal request received
3. **Offer In** — offer submitted to artist or received from buyer
4. **Negotiating** — fee/terms being discussed
5. **Confirmed** — deal agreed, pending contract (moves to `shows` table)
6. **Contracted** — contract signed
7. **Advanced** — advancing logistics underway
8. **Settled** — payment settled, deal complete

Stages 1-4 live in the `pipeline` table. Stages 5-8 live in the `shows` table (as `deal_type`).

## Artist Slugs

**Priority artists:**
shogun, junkie-kid, clawz, drakk, hellbound, triptykh, morelia, ketting, mad-dog, anime, dr-greco

**Full roster:**
anoluxx, water-spirit, dea-magna, jenna-shaw, jay-toledo, naomi-luna, gioh-cecato, pixie-dust, death-code, taylor-torrence, sihk, lara-klart, cyboy, mandy

**Leo's artists:**
tnt, dual-damage, the-purge, casska

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
