-- 004: Dashboard v2 — rules tick-list, account balance log, market briefs, tracking start date.
-- Idempotent.

-- Per-day snapshot of every rule with followed true/false (rules_broken stays as the derived subset).
alter table public.diary_entries
  add column if not exists rules_check jsonb not null default '[]'::jsonb;   -- [{id, text, followed}]

-- When the equity tracking starts (P&L "since" this date). Capital = starting balance on that date.
alter table public.settings
  add column if not exists start_date date;

-- Daily account balance, as reported by the owner.
create table if not exists public.capital_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date       date not null,
  amount     numeric(14,2) not null,
  note       text,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

-- One brief per trading session, built from scripts/market_brief.py + Claude's narrative.
create table if not exists public.market_briefs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date       date not null,                          -- the session this brief is FOR
  as_of      date,                                   -- last data date used
  summary    text,                                   -- narrative
  plan       jsonb not null default '[]'::jsonb,     -- ["..."] trade plan bullets
  nifty      jsonb not null default '{}'::jsonb,     -- {close, chg_1d, rsi, pivots{...}, ...}
  indices    jsonb not null default '[]'::jsonb,     -- Bank Nifty, VIX
  globals    jsonb not null default '[]'::jsonb,     -- crude, DXY, US, Asia ...
  stocks     jsonb not null default '[]'::jsonb,     -- Nifty 50 constituents
  breadth    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

alter table public.capital_log   enable row level security;
alter table public.market_briefs enable row level security;
drop policy if exists "own capital" on public.capital_log;
drop policy if exists "own briefs"  on public.market_briefs;
create policy "own capital" on public.capital_log
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own briefs" on public.market_briefs
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create index if not exists capital_log_user_idx   on public.capital_log   (user_id, date desc);
create index if not exists market_briefs_user_idx on public.market_briefs (user_id, date desc);

drop trigger if exists briefs_touch on public.market_briefs;
create trigger briefs_touch before update on public.market_briefs for each row execute function public.touch_updated_at();

do $$ begin
  begin alter publication supabase_realtime add table public.capital_log;   exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.market_briefs; exception when duplicate_object then null; end;
end $$;
