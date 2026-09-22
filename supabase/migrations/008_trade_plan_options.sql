-- 008: option-specific fields on trade_plans, for the payoff-scenario visualiser
alter table public.trade_plans
  add column if not exists strike numeric(12,2),
  add column if not exists option_type text check (option_type in ('CE','PE')),
  add column if not exists expiry date,
  add column if not exists iv numeric(6,2);
