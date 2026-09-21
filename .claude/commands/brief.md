---
description: Build today's market brief (Nifty levels, RSI, crude, DXY, US/Asia, all Nifty 50 stocks) and save it to the dashboard
argument-hint: optional session date YYYY-MM-DD (default: next trading session) and any notes/news to factor in
---
Build and save the market brief. Notes from me (may be empty): $ARGUMENTS

1. Run `python3 scripts/market_brief.py .brief.json` (takes 2–4 minutes; it backs off when Yahoo rate-limits). Read `.brief.json`.
   If `failed` lists more than 5 symbols, wait 60 seconds and run it again.
2. Decide the session the brief is FOR: the next trading day (Mon–Fri, skip NSE holidays) after `as_of`, unless I gave a date.
2b. Option chain from Upstox (token in Keychain — see CLAUDE.md "Live data"): weekly and monthly Nifty chains → PCR, max call/put OI,
   top-4 walls each side, ATM straddle and expected move. Also LTP of any open position's instrument key. Build the `oi` JSON.
2c. Live news research with WebSearch/WebFetch (Reuters, Moneycontrol, Business Standard, CNBC-TV18, Economic Times): the day's market
   wrap and why; top Nifty gainers/losers and reasons; FPI/DII flows; rupee; crude (Saudi/Hormuz/OPEC/Iran); US close and why; Fed/US yields;
   Asia this morning; events last week and next two weeks (Fed, RBI MPC, expiries, US CPI/PCE/jobs, India CPI/IIP, GST, results, holidays);
   sector news (IT/H-1B/AI, autos/festive, banks, pharma, metals). Note contract-roll artefacts (e.g. WTI front-month expiry) so Yahoo % moves aren't misread.
3. Write the FULL report in markdown (this is what the owner reads in one go). Required sections, in this order, as `## ` headings:
   The one-line read · What happened on <day> · Global cues (table: cue, level, read) · Events: last week → next two weeks ·
   Nifty technicals for <session> (10/20/50/200-DMA, RSI, ATR, 30-day and 52-week range, pivots S3–R3 + PDH/PDL, bigger levels,
   option chain walls weekly + monthly, 2–3 scenarios with probabilities) · What history says (30-year analogues, clearly marked as from memory) ·
   Sectors and the Nifty 50, stock by stock (every stock: close, 1d, 20d, RSI, trend, view for tomorrow AND next 2 weeks; group by sector) ·
   Your open position (if any; manage-don't-add rules) · Plan for the session (numbered, obeys the rules) · Sources line.
   Save it to a file, then publish: `python3 scripts/publish_brief.py --date <session> --report <file> --data .brief.json --oi <oi.json>`
   (needs `NOTEBOOK_PASSWORD` in the env for that run) — OR upsert via the Supabase MCP `execute_sql` with the same columns.
3b. Create the session's `trade_plans` rows (instrument, instrument_key, side, entry, stop, target, qty, condition, status) — the open
   position as `live` with `fill`, each conditional setup as `waiting`. Delete/cancel stale plans from earlier sessions that never triggered.
   The old short narrative rules below still apply to the `summary`:
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
