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
| `/brief` | Numbers from `scripts/market_brief.py` + `scripts/tradingview.py` + Upstox option chain, live news research (Reuters/Moneycontrol/CNBC), then a FULL written report (`market_briefs.report`, markdown) + plan + `trade_plans` rows for the session |
| `/tv` | Just the TradingView refresh: `python3 scripts/tradingview.py .tv.json` then `NOTEBOOK_PASSWORD=… python3 scripts/publish_tv.py --date <session>` — oscillators, MAs, ratings, pivots in 5 methods, and every stock's index weight + points contribution |
| `/balance <₹>` | Records the day's account balance in `capital_log` (hero card + balance chart) |
| `/deploy` | Runs checks + tests, commits, pushes, watches the Pages deploy until green |

Owner facts: starting capital ₹2,27,000 on 2026-09-21 (`settings.capital`, `settings.start_date`); 9 hard rules in `rules`
(Nifty only, single trade/day, written entry/SL/target, no big-event days, no expiry within 2 days, no blind futures, news-based only,
trend trades buy-dip/sell-top, no FOMO). Rule compliance = per-day tick-list in `diary_entries.rules_check`; a no-trade day is 100%.

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
js/views/market.js    market brief view + briefTeaser() for the front page
scripts/market_brief.py  Yahoo Finance fetch + indicators → .brief.json (git-ignored); the raw data behind /brief
supabase/migrations/  001_init … 004_dashboard — applied to the live project; add 005_… for changes
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
- `capital_log` — `date (unique per user), amount, note` — reported account balances; `stats.balanceSeries` fills gaps with diary P&L.
- `market_briefs` — `date (session, unique per user), as_of, summary, plan [], nifty {…, pivots}, indices [], globals [], stocks [], breadth {}` — built by `/brief`.
- `market_briefs.technicals` — TradingView's own numbers: `{close, change_pct, summary{all,ma,osc,label,…}, oscillators[], moving_averages[], pivots{Classic,Fibonacci,Camarilla,Woodie,DM}, pivots_daily{}}`.
- `market_briefs.contribution` — `{points_up, points_down, net_points, advances, declines, top_contributors[], top_draggers[]}`; each `stocks[]` row also carries `weight_pct` (free-float) and `points` (weight × move).
- `market_briefs.report` — the full written analysis (markdown; rendered by `md()` in dom.js); `oi` — option-chain summary `{weekly{expiry,pcr,max_call,max_put,call_walls,put_walls,straddle,expected_move}, monthly{…}}`.
- `trade_plans` — per-session plans shown live: `date, instrument, instrument_key (Upstox), side, entry, stop, target, qty, condition, status (waiting|live|done|cancelled), fill, exit, note, sort`.
- `diary_entries.rules_check` — `[{id, text, followed}]` snapshot of every rule for the day (`rules_broken` is the derived subset).

## Live data (Upstox analytics token — read-only)

- Token lives in the macOS Keychain (`security find-generic-password -s trading-notebook-upstox-token -w`) and as the edge-function
  secret `UPSTOX_TOKEN` (`supabase secrets set`). Never in files, commits, or the site. Groww key/secret are in the Keychain too
  (`trading-notebook-groww-*`) but Groww returns "Access forbidden" until the owner enables API access.
- Edge function `supabase/functions/market-live` proxies GET-only ops (`ltp, quote, ohlc, chain, expiries, intraday, daily, status`)
  for a signed-in user. Frontend: `api.live(op, params)`; the panel is `js/views/live.js` (mounted on Home and Market; polls 15 s in NSE hours).
- Useful keys: `NSE_INDEX|Nifty 50`, `NSE_INDEX|Nifty Bank`, `NSE_INDEX|India VIX`; stocks `NSE_EQ|<ISIN>`; options from `chain`.
  Nifty weekly expiry = Tuesday, monthly = last Tuesday (Sept 2026: 22, 29). Stock options monthly (Laurus 1900 CE 29 Sep = `NSE_FO|89064`, lot 850).
- From a shell with the token: `curl -H "Authorization: Bearer $(security find-generic-password -s trading-notebook-upstox-token -w)" "https://api.upstox.com/v2/option/chain?instrument_key=NSE_INDEX%7CNifty%2050&expiry_date=YYYY-MM-DD"`.
- `settings.start_date` — equity tracking starts here; `capital` is the balance on that date.
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
