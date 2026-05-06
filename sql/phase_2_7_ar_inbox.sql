-- Phase 2.7 — A&R Inbox
-- Lightweight prospect tracker so unsolicited inflows (artist self-pitches,
-- coordinator applications, buyers asking us to review their artist) don't
-- die in the Outlook inbox.
--
-- Apply manually via Supabase Dashboard → SQL Editor.
-- Idempotent: safe to re-run (uses IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS prospects (
  id                    BIGSERIAL PRIMARY KEY,
  prospect_type         TEXT NOT NULL,                       -- 'artist' | 'coordinator' | 'buyer' | 'other'
  name                  TEXT NOT NULL,
  contact_email         TEXT,
  contact_phone         TEXT,
  source                TEXT,                                -- 'email' | 'IG' | 'referral' | 'show' | 'other'
  source_detail         TEXT,                                -- e.g. "Renault @ Swarm France emailed May 4"
  status                TEXT NOT NULL DEFAULT 'New',         -- 'New' | 'Reviewing' | 'Pass' | 'Sign' | 'Hip Pocket'
  notes                 TEXT,
  spotify_listeners     INTEGER,
  instagram_handle      TEXT,
  decision_target_date  DATE,                                -- "decide by"
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Status filter pills hit this index frequently
CREATE INDEX IF NOT EXISTS prospects_status_idx ON prospects (status);
CREATE INDEX IF NOT EXISTS prospects_type_idx ON prospects (prospect_type);

ALTER TABLE prospects DISABLE ROW LEVEL SECURITY;
