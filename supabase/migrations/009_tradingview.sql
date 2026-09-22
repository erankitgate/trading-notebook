-- 009: TradingView technicals + index contribution breakdown on the daily brief
alter table public.market_briefs
  add column if not exists technicals jsonb not null default '{}'::jsonb,   -- oscillators, MAs, ratings, pivots (Classic/Fib/Camarilla/Woodie/DM)
  add column if not exists contribution jsonb not null default '{}'::jsonb; -- index weights + points each stock added/removed
