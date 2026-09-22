-- 007: brief carries an overall/per-section sentiment score and a scored top-news list
alter table public.market_briefs
  add column if not exists sentiment jsonb not null default '{}'::jsonb,  -- {score:-100..100, positive, negative, label, sections:[{title, score:-2..2, why}]}
  add column if not exists news jsonb not null default '[]'::jsonb;       -- [{title, source, url, score:-2..2, impact:high|med|low, note}]
