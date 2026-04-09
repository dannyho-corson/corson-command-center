-- Run this in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/smueknsapnvyrdfnnkkq/sql/new

-- 1. Add priority_order column
alter table targets add column if not exists priority_order integer default 0;

-- 2. Assign sequential priority_order to all existing targets,
--    grouped by artist, ordered by created_at
with ranked as (
  select
    id,
    row_number() over (
      partition by artist_slug
      order by created_at asc
    ) - 1 as rn
  from targets
)
update targets
set priority_order = ranked.rn
from ranked
where targets.id = ranked.id;
