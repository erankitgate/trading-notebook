---
description: Build today's market brief (Nifty levels, RSI, crude, DXY, US/Asia, all Nifty 50 stocks) and save it to the dashboard
argument-hint: optional session date YYYY-MM-DD (default: next trading session) and any notes/news to factor in
---
Build and save the market brief. Notes from me (may be empty): $ARGUMENTS

1. Run `python3 scripts/market_brief.py .brief.json` (takes 2–4 minutes; it backs off when Yahoo rate-limits). Read `.brief.json`.
   If `failed` lists more than 5 symbols, wait 60 seconds and run it again.
2. Decide the session the brief is FOR: the next trading day (Mon–Fri, skip NSE holidays) after `as_of`, unless I gave a date.
3. Write the narrative from the numbers — blunt, 5–8 sentences, no filler:
   - Nifty: close, 1d/5d/20d, RSI and what it means, trend vs SMA20/50, ATR (expected day range), where price sits vs pivot/S1/R1.
   - Bank Nifty and VIX in one line each.
   - Global cues: crude, dollar index, USD/INR, US 10Y, US close (S&P/Nasdaq), Asia this morning — say which ones matter today and why.
   - Breadth: advances/declines, stocks above 20DMA, overbought/oversold names; the 3 strongest and 3 weakest stocks with RSI.
   - Any event risk today (RBI/Fed/expiry/results) from my notes or your knowledge — say "no big event known" if none.
4. Write the plan as 3–5 bullets that obey MY rules (Playbook): Nifty only, single trade, entry/SL/target written before the trade,
   no big-event days, no expiry within 2 days, trend trade (buy dip / sell top) on news only, no FOMO. Use the pivot levels:
   e.g. "Buy dip to S1 23,324 only if held for 15 min; SL 40 below; target R1 23,483 (1.9R)". If conditions don't fit the rules, the plan is "No trade".
   If my diary's latest page has an open position or a next-day strategy, put its management first.
5. Upsert into `market_briefs` via the Supabase MCP (`execute_sql`, project `owpcomcmvwiutlulojts`, `user_id` from
   `select id from auth.users order by created_at limit 1`), on conflict `(user_id, date)` update:
   `date`, `as_of`, `summary`, `plan` (jsonb array), `nifty` (the ^NSEI object incl. `pivots`), `indices` (the other index objects),
   `globals`, `stocks` (all 50, as produced), `breadth`. Pass the JSON straight from the file — do not retype numbers.
6. Reply with: Nifty close + RSI + pivot/S1/R1, the plan bullets, and the link https://erankitgate.github.io/trading-notebook/#/market
