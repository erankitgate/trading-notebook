-- 006: Live data — per-session trade plans shown against live prices.
-- (The Upstox token lives in the edge function's secrets: `supabase secrets set UPSTOX_TOKEN=…`, never in the DB or repo.)

-- Planned trades for a session, shown live against the market.
create table if not exists public.trade_plans (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date           date not null,
  instrument     text not null,             -- e.g. NIFTY 29 SEP 23500 CE / LAURUSLABS 1900 CE
  instrument_key text,                      -- Upstox key, e.g. NSE_INDEX|Nifty 50, NSE_FO|89064
  side           text not null default 'Buy' check (side in ('Buy','Sell')),
  entry          numeric(12,2),
  stop           numeric(12,2),
  target         numeric(12,2),
  qty            integer,
  condition      text,                      -- what must be true first
  status         text not null default 'waiting' check (status in ('waiting','live','done','cancelled')),
  fill           numeric(12,2),             -- actual entry when status = live/done
  exit           numeric(12,2),
  note           text,
  sort           integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table public.trade_plans enable row level security;
drop policy if exists "own plans" on public.trade_plans;
create policy "own plans" on public.trade_plans
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create index if not exists trade_plans_user_idx on public.trade_plans (user_id, date desc, sort);
drop trigger if exists plans_touch on public.trade_plans;
create trigger plans_touch before update on public.trade_plans for each row execute function public.touch_updated_at();
do $$ begin
  begin alter publication supabase_realtime add table public.trade_plans; exception when duplicate_object then null; end;
end $$;
