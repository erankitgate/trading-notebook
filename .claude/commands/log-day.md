---
description: Log today's trading day into the diary from a plain-English description
argument-hint: describe the day — trades, mistakes, lessons, plan for tomorrow
---
Create (or update) today's diary page from what I describe: $ARGUMENTS

Rules:
- Use the Supabase MCP `execute_sql` on project `owpcomcmvwiutlulojts`. Set `user_id` explicitly from
  `select id from auth.users order by created_at limit 1`. If the MCP isn't available, print the finished SQL for me to paste.
- Date = today in IST unless I say otherwise (format `YYYY-MM-DD`). One row per date: if a row exists for that date, `update` it, merging what I said into the existing jsonb arrays; never overwrite fields I didn't mention.
- Map what I say into the schema in CLAUDE.md:
  - `trades`: `[{instrument, side: "Buy"|"Sell", qty, entry, stop, target, exit, pnl, risk, setup, time_in, time_out, reason, result}]`.
    If I give entry, exit and qty but not P&L, compute `pnl = (exit − entry) × qty` (reverse for Sell), rounded to 2 dp. `risk = |entry − stop| × qty` when a stop is given.
    Match `setup` to an existing `setups.name` (case-insensitive) when what I describe fits one; otherwise leave it null and tell me.
  - `mistakes`: `[{tag, detail}]` — reuse an existing tag from past `diary_entries` when it's the same mistake (this is what powers the "repeated ×N" counter). List me the tags you reused.
  - `rules_check`: `[{id, text, followed}]` for EVERY active rule in `rules` (ordered by sort). Mark `followed:false` only when what I
    describe clearly breaks the rule; ask me about any rule you can't judge rather than guessing. A day with no trades → all `followed:true`.
    `rules_broken` = the `{id, text}` subset with `followed:false`.
  - `charges` (number), `plan_followed` (`yes|partly|no`) + `plan_note`, `market`, `mood`, `title` (one line, ≤ 60 chars, written by you if I didn't give one).
  - `went_well`, `lessons`, `next_day_strategy`: arrays of short strings. `watchlist`: `[{instrument, bias: bullish|bearish|neutral, levels, note}]`.
- Before writing, show me the row as a compact summary (trades table with P&L, day net, mistakes, rules broken, plan) and the SQL. Ask "Save it?" once. Then run it.
- After saving, print: day net P&L, and any of these that apply: daily loss limit hit, more trades than the limit, a mistake that is now repeated, a rule broken twice this month. Link the page: https://erankitgate.github.io/trading-notebook/#/diary/YYYY-MM-DD
