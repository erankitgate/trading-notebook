# My Trading Notebook

A private, phone-first trading journal for one person. Every trading day gets a page; the notebook turns those pages into
the numbers a professional actually watches — R-multiples, expectancy, drawdown, plan adherence, repeated mistakes — and
puts the uncomfortable ones in a red box on the front page.

**Live:** https://erankitgate.github.io/trading-notebook/ · **Demo (no login):** https://erankitgate.github.io/trading-notebook/?demo=1

Plain HTML + CSS + JavaScript (ES modules, no build step), hosted on GitHub Pages. Data, login and live sync are
[Supabase](https://supabase.com) (Postgres + magic-link auth + realtime). Works on a 360px phone and syncs between devices in about a second.

## Sections

| Section | What's on it |
|---|---|
| **Index** | Red box *Read this before you trade* (pinned reminders, mistakes repeated on 2+ days, rules broken twice in 30 days), today's risk meter against your daily loss limit, 30-day stats with an equity sparkline, the plan and watchlist for the next session, recent days |
| **Diary** | One page per day: yesterday's plan and whether you followed it, pre-market checklist, trades table (entry/stop/target/exit, P&L, R), rules broken, mistakes (repeats turn red), what went well, lesson, strategy + watchlist for tomorrow. Searchable, filterable, grouped by month |
| **Analytics** | Net/gross/charges, return on capital, win rates, profit factor, expectancy, avg R, max drawdown with dates, best/worst day, streaks; discipline block (rules broken, stops not honoured, plan-followed vs not P&L); equity curve, daily bars, calendar heatmap, average by weekday; tables by setup, underlying, mistake, rule, week, month. Range: 30d / 90d / YTD / all |
| **Playbook** | Your setups with entry/exit rules and their live stats (trades, win rate, avg R, net); the hard-rule rulebook that appears as checkboxes on every diary page |
| **Learning** | Notes with key points and a link to the full guide; tag filter and search |
| **Reviews** | One review per week, pre-filled with that week's numbers; grade A–F for process, not P&L |
| **Settings** | Capital, risk per trade %, daily max loss, max trades/day, checklist template; export everything as JSON or trades as CSV |

The trade form computes P&L, planned risk, planned R:R, realised R and a suggested quantity for your risk budget as you type.

## Run it locally

```bash
npm install          # dev dependency only (puppeteer-core for e2e tests); the site itself has none
npm run dev          # http://127.0.0.1:8080/?demo=1  ← sample data, no login
npm run check        # syntax check + unit tests + secret scan
npm run test:e2e     # headless Chrome walk of every screen (needs Google Chrome installed)
```

Open `http://127.0.0.1:8080/` without `?demo=1` to use the real database (magic-link login).

## Deploy

Push to `main`. GitHub Actions (`.github/workflows/deploy.yml`) runs the checks and publishes the site to GitHub Pages.
`scripts/deploy.sh "message"` does check → commit → push → watch in one go.

Optional: set repository secrets `SUPABASE_URL` and `SUPABASE_ANON_KEY` and the workflow writes `config.js` from them at deploy time,
so a key rotation never needs a commit.

## Database

Migrations live in `supabase/migrations/` and are applied to the live project (`owpcomcmvwiutlulojts`, Mumbai):

- `001_init.sql` — diary, learning notes, highlights, RLS, realtime
- `002_pro_trader.sql` — charges/checklist/rules-broken/watchlist on diary days; `setups`, `rules`, `settings`, `reviews`
- `003_hardening.sql` — pinned `search_path` on the trigger function, covering indexes

Every table has row-level security: a user can only read and write rows where `user_id = auth.uid()`. The anon key in
`config.js` is public by design; it cannot read anyone's data without a signed-in session.

To change the schema: add `004_<name>.sql` (idempotent), apply it (Supabase MCP `apply_migration`, the CLI, or the SQL editor),
then check Database → Advisors for anything new.

## Working with Claude Code

Open this folder in Claude Code. `CLAUDE.md` explains the codebase and the daily routine; these slash commands are included:

- `/premarket` — briefing before the open
- `/log-day …` — describe the day in plain English, get a saved diary page
- `/learn <topic>` — a full guide as an Artifact + a saved learning note
- `/review-week` — the weekly review, drafted from the numbers
- `/deploy <message>` — test, commit, push, watch until green

## Layout

```
index.html  config.js  manifest.webmanifest  icon.svg
css/app.css
js/main.js  js/api.js  js/api.demo.js  js/state.js  js/router.js
js/lib/     fmt.js  stats.js  charts.js  dom.js
js/views/   home  diary  diaryForm  analytics  playbook  learn  reviews  settings  login
supabase/migrations/   001_init  002_pro_trader  003_hardening
tests/unit/  tests/e2e/   scripts/   .claude/commands/   .github/workflows/
```

## Phone

Chrome on Android: ⋮ → **Add to Home screen**. Safari on iPhone: Share → **Add to Home Screen**. It installs as an app
(`manifest.webmanifest`) and follows your light/dark setting.
