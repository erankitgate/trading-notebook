-- 002: Pro-trader extensions
-- Adds risk settings, a playbook (setups + hard rules), weekly reviews, and
-- richer day pages (charges, pre-market checklist, rules broken, watchlist).
-- Safe to re-run: every statement is idempotent.

-- ---------------------------------------------------------------------------
-- 1) Day page: extra columns (all have defaults, so existing rows stay valid)
-- ---------------------------------------------------------------------------
alter table public.diary_entries
  add column if not exists charges      numeric(12,2) not null default 0,             -- brokerage + taxes for the day
  add column if not exists checklist    jsonb not null default '[]'::jsonb,           -- [{item, done}]
  add column if not exists rules_broken jsonb not null default '[]'::jsonb,           -- [{id, text}] snapshot of rules broken
  add column if not exists watchlist    jsonb not null default '[]'::jsonb;           -- [{instrument, bias, levels, note}] for next session

-- trades jsonb items may now also carry: setup, stop, target, risk, time_in, time_out (all optional)

-- ---------------------------------------------------------------------------
-- 2) Playbook: named setups with rules; per-setup stats are computed client-side
-- ---------------------------------------------------------------------------
create table if not exists public.setups (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  description text,
  entry_rules jsonb not null default '[]'::jsonb,
  exit_rules  jsonb not null default '[]'::jsonb,
  notes       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists setups_user_name_key on public.setups (user_id, lower(name));

-- ---------------------------------------------------------------------------
-- 3) Hard rules: the rulebook; the day page records which were broken
-- ---------------------------------------------------------------------------
create table if not exists public.rules (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  text       text not null,
  active     boolean not null default true,
  sort       integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4) Settings: one row per user (risk budget, limits, checklist template)
-- ---------------------------------------------------------------------------
create table if not exists public.settings (
  user_id            uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  capital            numeric(14,2),
  risk_per_trade_pct numeric(5,2) not null default 1,
  daily_max_loss     numeric(12,2),
  max_trades_per_day integer not null default 3,
  checklist          jsonb not null default '["Slept 7+ hours, mind is calm","Key levels marked (PDH/PDL, OI walls)","Event calendar checked (RBI/Fed/expiry/results)","Max loss and max trades set for today","Yesterday''s plan and repeated mistakes read"]'::jsonb,
  updated_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 5) Weekly reviews: one row per ISO week (Monday)
-- ---------------------------------------------------------------------------
create table if not exists public.reviews (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  week_start  date not null,
  grade       text check (grade in ('A','B','C','D','F') or grade is null),
  what_worked jsonb not null default '[]'::jsonb,
  what_didnt  jsonb not null default '[]'::jsonb,
  focus       jsonb not null default '[]'::jsonb,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, week_start)
);

-- ---------------------------------------------------------------------------
-- 6) Row-level security: a user sees and edits only their own rows.
--    (select auth.uid()) is evaluated once per query instead of once per row.
-- ---------------------------------------------------------------------------
alter table public.setups   enable row level security;
alter table public.rules    enable row level security;
alter table public.settings enable row level security;
alter table public.reviews  enable row level security;

drop policy if exists "own setups"   on public.setups;
drop policy if exists "own rules"    on public.rules;
drop policy if exists "own settings" on public.settings;
drop policy if exists "own reviews"  on public.reviews;

create policy "own setups" on public.setups
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rules" on public.rules
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own settings" on public.settings
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own reviews" on public.reviews
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Re-create the v1 policies in the same (faster) form
drop policy if exists "own diary"      on public.diary_entries;
drop policy if exists "own learning"   on public.learning_notes;
drop policy if exists "own highlights" on public.highlights;
create policy "own diary" on public.diary_entries
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own learning" on public.learning_notes
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own highlights" on public.highlights
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 7) updated_at maintenance
-- ---------------------------------------------------------------------------
drop trigger if exists setups_touch   on public.setups;
drop trigger if exists settings_touch on public.settings;
drop trigger if exists reviews_touch  on public.reviews;
create trigger setups_touch   before update on public.setups   for each row execute function public.touch_updated_at();
create trigger settings_touch before update on public.settings for each row execute function public.touch_updated_at();
create trigger reviews_touch  before update on public.reviews  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 8) Live sync for the new tables
-- ---------------------------------------------------------------------------
do $$ begin
  begin alter publication supabase_realtime add table public.setups;   exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.rules;    exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.settings; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.reviews;  exception when duplicate_object then null; end;
end $$;
