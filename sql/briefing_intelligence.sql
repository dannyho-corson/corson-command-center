-- Corson Daily Briefing — Intelligence Layer Migration
--
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor) once.
-- Safe to re-run — every statement is IF NOT EXISTS / IF EXISTS.

-- ───────────────────────────────────────────────────────────────────────────
-- processed_emails: dedup by message hash so each email is processed once forever
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS processed_emails (
  message_id    TEXT PRIMARY KEY,
  subject       TEXT,
  sender        TEXT,
  processed_at  TIMESTAMPTZ DEFAULT NOW(),
  run_status    TEXT,
  classified_as TEXT
);

-- If a prior partial migration created processed_emails without these columns,
-- add them now. All statements are IF NOT EXISTS so safe to re-run.
ALTER TABLE processed_emails ADD COLUMN IF NOT EXISTS message_id    TEXT;
ALTER TABLE processed_emails ADD COLUMN IF NOT EXISTS run_status    TEXT;
ALTER TABLE processed_emails ADD COLUMN IF NOT EXISTS classified_as TEXT;

-- Ensure message_id has a UNIQUE constraint for dedup. Safe re-run via DO block.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'processed_emails_message_id_key'
  ) THEN
    ALTER TABLE processed_emails ADD CONSTRAINT processed_emails_message_id_key UNIQUE (message_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS processed_emails_processed_at_idx
  ON processed_emails (processed_at DESC);
CREATE INDEX IF NOT EXISTS processed_emails_message_id_idx
  ON processed_emails (message_id);

-- ───────────────────────────────────────────────────────────────────────────
-- industry_intel: festivals, buyers, agencies, scene trends
-- Feeds the dashboard Industry Intel widget + Claude's briefing system prompt
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS industry_intel (
  id           SERIAL PRIMARY KEY,
  category     TEXT NOT NULL,            -- 'festival' | 'buyer' | 'agency' | 'trend'
  name         TEXT NOT NULL,
  description  TEXT,
  market       TEXT,
  corson_status TEXT,                    -- 'in' | 'target' | 'dream' | 'n/a'
  priority     TEXT,                     -- 'urgent' | 'high' | 'medium' | 'low'
  corson_artists TEXT[],                  -- artist slugs already booked (for festivals)
  contacts     JSONB,                    -- freeform contacts {name, role, email}
  notes        TEXT,
  event_date   TEXT,                     -- free-text: "May 15-17", "Oct 21-25"
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- If a prior partial migration created industry_intel without these columns,
-- add them now. All statements are IF NOT EXISTS so safe to re-run.
ALTER TABLE industry_intel ADD COLUMN IF NOT EXISTS market         TEXT;
ALTER TABLE industry_intel ADD COLUMN IF NOT EXISTS corson_status  TEXT;
ALTER TABLE industry_intel ADD COLUMN IF NOT EXISTS priority       TEXT;
ALTER TABLE industry_intel ADD COLUMN IF NOT EXISTS corson_artists TEXT[];
ALTER TABLE industry_intel ADD COLUMN IF NOT EXISTS contacts       JSONB;
ALTER TABLE industry_intel ADD COLUMN IF NOT EXISTS event_date     TEXT;

CREATE INDEX IF NOT EXISTS industry_intel_category_idx ON industry_intel (category);
CREATE INDEX IF NOT EXISTS industry_intel_priority_idx ON industry_intel (priority);

-- ───────────────────────────────────────────────────────────────────────────
-- urgent_issues: drag-and-drop TODO ordering
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE urgent_issues ADD COLUMN IF NOT EXISTS sort_order           INTEGER DEFAULT 0;
ALTER TABLE urgent_issues ADD COLUMN IF NOT EXISTS manually_prioritized BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS urgent_issues_priority_sort_idx
  ON urgent_issues (priority, sort_order);

-- ───────────────────────────────────────────────────────────────────────────
-- buyers: last_contact column for Rolodex freshness tracking
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS last_contact DATE;

-- ───────────────────────────────────────────────────────────────────────────
-- pipeline + shows: sort_order for drag-and-drop within kanban columns
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE pipeline ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE shows    ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS pipeline_stage_sort_idx ON pipeline (stage, sort_order);
CREATE INDEX IF NOT EXISTS shows_deal_type_sort_idx ON shows (deal_type, sort_order);

-- ───────────────────────────────────────────────────────────────────────────
-- campaigns: active outreach campaigns per artist — shown at the top of the
-- Pipeline page. Counters (emails_sent / replies / offers / bounces) are
-- bumped by the daily briefing when Claude detects a known campaign reply.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_slug TEXT NOT NULL,
  name TEXT NOT NULL,
  market TEXT,
  window_start DATE,
  window_end DATE,
  target_shows INTEGER DEFAULT 0,
  emails_sent INTEGER DEFAULT 0,
  bounces INTEGER DEFAULT 0,
  replies INTEGER DEFAULT 0,
  offers INTEGER DEFAULT 0,
  status TEXT DEFAULT 'Not Started',
  notes TEXT,
  anchor_show TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS campaigns_artist_status_idx ON campaigns (artist_slug, status);

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon full access campaigns" ON campaigns;
CREATE POLICY "anon full access campaigns" ON campaigns
  FOR ALL USING (true) WITH CHECK (true);

-- Open RLS policies so the anon key can read + write (command-center runs with anon)
ALTER TABLE processed_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE industry_intel  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon full access processed_emails" ON processed_emails;
CREATE POLICY "anon full access processed_emails" ON processed_emails
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon full access industry_intel" ON industry_intel;
CREATE POLICY "anon full access industry_intel" ON industry_intel
  FOR ALL USING (true) WITH CHECK (true);
