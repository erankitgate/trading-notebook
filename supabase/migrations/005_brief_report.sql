-- 005: market brief carries a full written report (markdown) and an option-chain summary
alter table public.market_briefs
  add column if not exists report text,
  add column if not exists oi jsonb not null default '{}'::jsonb;   -- {expiry, pcr, max_call, max_put, walls[], straddle, expected_move}
