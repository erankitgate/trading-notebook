-- My Trading Notebook: database setup
-- Paste this whole file into Supabase > SQL Editor > New query, then click Run.

-- 1) Daily trade diary: one row per trading day
create table if not exists public.diary_entries (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date              date not null,
  title             text,
  market            text,
  mood              text,
  plan_followed     text check (plan_followed in ('yes','partly','no') or plan_followed is null),
  plan_note         text,
  trades            jsonb not null default '[]'::jsonb,   -- [{instrument, side, qty, entry, exit, pnl, reason, result}]
  mistakes          jsonb not null default '[]'::jsonb,   -- [{tag, detail}]
  went_well         jsonb not null default '[]'::jsonb,   -- ["..."]
  lessons           jsonb not null default '[]'::jsonb,   -- ["..."]
  next_day_strategy jsonb not null default '[]'::jsonb,   -- ["..."]
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, date)
);

-- 2) Daily learning notes
create table if not exists public.learning_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date       date not null default current_date,
  title      text not null,
  summary    text,
  points     jsonb not null default '[]'::jsonb,
  url        text,
  tags       jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- 3) Pinned reminders shown in red on the front page
create table if not exists public.highlights (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  text       text not null,
  created_at timestamptz not null default now()
);

-- Only you can see and change your own rows
alter table public.diary_entries  enable row level security;
alter table public.learning_notes enable row level security;
alter table public.highlights     enable row level security;

drop policy if exists "own diary"      on public.diary_entries;
drop policy if exists "own learning"   on public.learning_notes;
drop policy if exists "own highlights" on public.highlights;

create policy "own diary" on public.diary_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own learning" on public.learning_notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own highlights" on public.highlights
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Keep updated_at fresh
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists diary_touch on public.diary_entries;
create trigger diary_touch before update on public.diary_entries
  for each row execute function public.touch_updated_at();

-- Real-time updates (changes on your phone appear instantly on your laptop)
do $$ begin
  begin alter publication supabase_realtime add table public.diary_entries;  exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.learning_notes; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.highlights;     exception when duplicate_object then null; end;
end $$;
