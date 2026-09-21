---
description: 1-minute pre-market briefing from the notebook (yesterday's plan, watchlist, repeated mistakes, broken rules, limits)
---
Give me my pre-market briefing. Use the Supabase MCP `execute_sql` tool on project `owpcomcmvwiutlulojts`
(read-only queries). If the MCP isn't available, say so and tell me to open the site instead.

1. Find my user id: `select id from auth.users order by created_at limit 1`.
2. Load: `settings` (limits), the latest `diary_entries` row (its `next_day_strategy`, `watchlist`, `lessons`),
   the last 30 days of `diary_entries` (`mistakes`, `rules_broken`, trades P&L, `charges`), active `rules`, `highlights`.
3. Print a short briefing, in this order, plain and blunt:
   - **Limits today**: max loss, max trades, risk per trade (₹ = capital × %).
   - **Yesterday's plan** and **watchlist** (instrument, bias, levels, note).
   - **Read this before you trade**: pinned reminders; mistakes repeated ≥2 times in 30 days (with counts); rules broken ≥2 times.
   - **Form**: last 5 days net P&L, current streak, and — if 3+ red days — a one-line reminder to halve size.
   - **Hard rules** (active), numbered.
4. End with one line: the single most important thing to do today, based on the above. No motivational filler.
