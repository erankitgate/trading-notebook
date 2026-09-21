---
description: Draft and save the weekly review from the notebook's numbers
argument-hint: optional week start (Monday, YYYY-MM-DD); default = last week
---
Weekly review for: $ARGUMENTS (default: the most recent completed week, Monday–Sunday, IST).

1. Via the Supabase MCP (`execute_sql`, project `owpcomcmvwiutlulojts`, user id from `auth.users`), pull that week's
   `diary_entries` (trades, charges, mistakes, rules_broken, plan_followed, lessons, went_well) and the 8 weeks before it for comparison.
2. Compute, exactly as `js/lib/stats.js` does: net (Σ pnl − charges), green/red days, trade win rate, profit factor,
   expectancy per trade, avg R (trades with a stop), max drawdown within the week, trades per day vs the limit,
   days with rules broken, plan-followed counts, P&L on plan-followed vs not-followed days, best/worst setup, mistakes with counts.
3. Write the review in my voice, short and honest: **What worked** (3 bullets max, with numbers), **What didn't** (3 max, name the
   mistake/rule and what it cost), **Focus for next week** (ONE thing, phrased as a rule I can tick), and a **grade A–F**
   where A means "followed the process regardless of P&L". Compare to the prior 8-week averages in one line.
4. Show it to me, ask "Save?" once, then upsert into `reviews` (`week_start`, `grade`, `what_worked`, `what_didnt`, `focus`, `notes`).
   Link: https://erankitgate.github.io/trading-notebook/#/reviews
