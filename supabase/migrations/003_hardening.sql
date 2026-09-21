-- 003: Hardening (from the Supabase security + performance advisors)

-- Pin the trigger function's search_path so it can't be hijacked by a role's setting.
create or replace function public.touch_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$ begin new.updated_at = now(); return new; end $$;

-- Covering indexes for user_id foreign keys (every query filters on user_id).
create index if not exists rules_user_idx    on public.rules   (user_id, sort);
create index if not exists setups_user_idx   on public.setups  (user_id);
create index if not exists reviews_user_idx  on public.reviews (user_id, week_start desc);
