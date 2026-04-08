-- Corson Command Center — SQL Migrations
-- Run these in the Supabase SQL Editor at:
-- https://supabase.com/dashboard/project/smueknsapnvyrdfnnkkq/sql/new

-- ── urgent_issues table ───────────────────────────────────────────────────────
-- Stores dashboard alert items with resolve state.
-- Once this table exists, the Resolve button will persist to Supabase.
-- Until then, resolved state is stored in localStorage (still works).

create table if not exists urgent_issues (
  id uuid primary key default gen_random_uuid(),
  severity text not null check (severity in ('red', 'yellow')),
  label text not null,
  artist_name text,
  artist_slug text,
  issue text,
  resolved boolean not null default false,
  created_at timestamptz default now()
);

-- Seed the 5 initial urgent issues
insert into urgent_issues (severity, label, artist_name, artist_slug, issue) values
  ('red',    'CONFLICT',   'CLAWZ',     'clawz',     'Buyer pushing LA show June 12 — VIOLATES EDC LV radius clause (active until Aug 15). Reject immediately.'),
  ('red',    'OVERDUE',    'SHOGUN',    'shogun',     'Domicile Miami contract unsigned — 72-hr deadline passed 2 days ago. Chase buyer now.'),
  ('yellow', 'FOLLOW UP',  'MAD DOG',   'mad-dog',   'NYC offer at $3,500 — below floor of $4,000. Counter or decline pending artist approval.'),
  ('yellow', 'FOLLOW UP',  'JUNKIE KID','junkie-kid', 'Tomorrowland routing — need HGR details from VEOP by EOD for festival advance.'),
  ('yellow', 'ACTION',     'DRAKK',     'drakk',     'Buyer communicated offer via WhatsApp only. Push to email — nothing is real until written offer received.')
on conflict do nothing;

-- Enable Row Level Security (recommended for production)
-- alter table urgent_issues enable row level security;
-- create policy "allow all" on urgent_issues for all using (true);

-- ── buyers table ──────────────────────────────────────────────────────────────
-- Buyer Rolodex — all promoter/venue contacts.
-- Run this in the Supabase SQL Editor before using the /rolodex page.

create table if not exists buyers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text,
  market text,
  email text,
  instagram text,
  region text,
  status text not null default 'Cold' check (status in ('Active', 'Warm', 'Cold', 'Graveyard', 'Red Flag')),
  notes text,
  artists_worked text,
  created_at timestamptz default now()
);

-- Enable Row Level Security (recommended for production)
-- alter table buyers enable row level security;
-- create policy "allow all" on buyers for all using (true);
