# My Trading Notebook — working notes for Claude Code

Personal options-trading journal for one owner (Ankit, Nifty options, "one good trade a day").
Static site on GitHub Pages + Supabase (Postgres, magic-link auth, realtime). No build step, no framework.

- Live site: https://erankitgate.github.io/trading-notebook/
- Repo: https://github.com/erankitgate/trading-notebook (branch `main` auto-deploys via GitHub Actions)
- Supabase project ref: `owpcomcmvwiutlulojts` (ap-south-1). Only the anon key lives in `config.js`.

## Daily workflow (what the owner does with you)

The owner opens Claude Code in this folder every day. The project slash commands cover the routine:

| Command | What it does |
|---|---|
| `/premarket` | Shows yesterday's plan, watchlist, repeated mistakes, broken rules, limits — a 1-minute briefing before the open |
| `/log-day` | Turns the owner's plain-English description of the day into a `diary_entries` row (trades, P&L, mistakes, lessons, plan) |
| `/learn <topic>` | Writes a full guide as an Artifact, then saves a `learning_notes` row linking to it |
| `/review-week` | Pulls the week's numbers from the DB, drafts the weekly review, saves it to `reviews` |
| `/deploy` | Runs checks + tests, commits, pushes, watches the Pages deploy until green |

Writing to the database from here goes through the Supabase MCP `execute_sql` tool. It runs as the
service role, so **always set `user_id` explicitly** — look it up first:
`select id, email from auth.users order by created_at limit 1;` Never hard-code it in files.
Dates are `YYYY-MM-DD` in IST. `trades`, `mistakes`, `rules_broken`, `watchlist` etc. are jsonb (see schema below).

If the Supabase MCP is not connected, say so and give the owner the SQL to paste into the Supabase SQL editor,
or point them at the website form.

## Layout

```
index.html            page shell, CSP, nav tabs; loads config.js then js/main.js (ES module)
config.js             Supabase URL + anon key (public; RLS protects data)
css/app.css           all styles; light tokens on :root, dark overrides under prefers-color-scheme
js/main.js            boot: auth, load, realtime subscribe, hash router → views
js/api.js             the only file that talks to Supabase (createApi); api.demo.js = in-memory twin for ?demo=1 and tests
js/state.js           in-memory store S + settings() with defaults
js/router.js          parseHash, go, inForm
js/lib/fmt.js         money/date/number formatting (pure)
js/lib/stats.js       all trading maths: P&L, R, win rate, PF, expectancy, drawdown, streaks, breakdowns, limits (pure, unit-tested)
js/lib/charts.js      inline-SVG equity line, signed bars, calendar heatmap, sparkline + tooltips
js/lib/dom.js         esc(), toast(), download(), busy()
js/views/*.js         one file per screen: home, diary (list+day), diaryForm, analytics, playbook, learn, reviews, settings, login
supabase/migrations/  001_init, 002_pro_trader, 003_hardening — applied to the live project; add 004_… for changes
tests/unit/           node:test for stats/fmt/charts ticks — `npm test`
tests/e2e/run.js      headless Chrome (puppeteer-core) walk of every route in demo mode — `npm run test:e2e`
.github/workflows/    deploy.yml copies the site into _site and publishes to Pages
```

## Conventions

- Plain ES modules, no bundler. Every user string goes through `esc()`; every link into the app is `#/…`.
- Views: `render(ctx)` / `list(ctx)` / `form(ctx, id)`. `ctx` = `{ app, api, query, go, reload, onLeave, setNav, demo }`.
- Trading maths lives in `js/lib/stats.js` only. Add a unit test when you touch it.
- Money is INR; `money()` prints `+₹1,250`. Green = `--up`, red = `--down`, amber = one-off mistake / warning.
- Keep the notebook look: paper page, red margin line, Figtree, tabular numerals in tables.
- Mobile first: nothing wider than 360px except tables/charts inside `.table-wrap` / `.chart`.
- Realtime: any change to any table reloads everything (single user, small data). Forms are never re-rendered underneath the user (`inForm()`).

## Schema (public)

- `diary_entries` — one row per trading day, unique `(user_id, date)`.
  Columns: `date, title, market, mood, plan_followed (yes|partly|no), plan_note, charges numeric,
  trades jsonb [{instrument, side (Buy|Sell), qty, entry, stop, target, exit, pnl, risk, setup, time_in, time_out, reason, result}],
  mistakes jsonb [{tag, detail}], rules_broken jsonb [{id, text}], checklist jsonb [{item, done}],
  went_well/lessons/next_day_strategy jsonb [string], watchlist jsonb [{instrument, bias, levels, note}], notes`.
  P&L for a trade: `(exit − entry) × qty` for Buy, reversed for Sell. Day net = Σ pnl − charges.
- `learning_notes` — `date, title, summary, points [string], url, tags [string]`.
- `highlights` — pinned reminders `text` (front-page red box).
- `setups` — playbook: `name (unique per user, case-insensitive), description, entry_rules [], exit_rules [], notes, active`.
- `rules` — hard rules: `text, active, sort`.
- `settings` — one row per user (pk `user_id`): `capital, risk_per_trade_pct, daily_max_loss, max_trades_per_day, checklist [string]`.
- `reviews` — weekly: `week_start (Monday, unique per user), grade A–F, what_worked [], what_didnt [], focus [], notes`.
All tables: RLS on, policy `(select auth.uid()) = user_id`, in the `supabase_realtime` publication.

## Changing things

1. Edit code → `npm run check` (syntax + unit tests) → `npm run test:e2e` (needs Chrome) → `npm run dev` to eyeball at http://127.0.0.1:8080/?demo=1
2. DB change → new file `supabase/migrations/00N_name.sql` (idempotent), apply with the Supabase MCP `apply_migration` (or `supabase db push` after `supabase link --project-ref owpcomcmvwiutlulojts`; the CLI is installed via Homebrew), then run both advisors and fix anything they flag. Always add RLS policies for new tables and add them to the realtime publication.
3. `/deploy` or `bash scripts/deploy.sh "message"` → commit, push, `gh run watch`. Verify with `curl -sI` on the live URL.

## Never

- Commit a service-role key, database password, GitHub token, or Supabase access token. Only the anon key belongs in `config.js`.
- Disable RLS, or write a policy that isn't scoped to `auth.uid()`.
- Add a framework, bundler, or runtime npm dependency for the site. Dev dependencies (tests) are fine.
- Rewrite `stats.js` semantics silently — the owner reads these numbers to make decisions.
