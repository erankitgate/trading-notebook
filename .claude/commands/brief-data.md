---
description: Rebuild the whole data half of a brief from one consistent run (Upstox + TradingView)
argument-hint: session date YYYY-MM-DD (the session the brief is FOR)
---
Rebuild the brief data for: $ARGUMENTS (default: the next trading session — Mon–Fri, skipping NSE holidays).

1. `python3 scripts/tradingview.py .tv.json` — technicals, ratings, pivots (all five methods), every
   Nifty 50 stock with free-float weight and points contribution, and all global cues.
2. `NOTEBOOK_PASSWORD='<notebook password>' python3 scripts/build_brief.py --date <session> --tv .tv.json`
   — adds Upstox: index OHLC, both option chains (PCR, walls, ATM straddle, expected move), and computes
   the session's pivots from the last completed candle. Upserts the row.
3. **Never** hand-edit individual numbers afterwards, and never mix in a fetch from another time —
   that is exactly what produced a page showing two different Nifty prices. Re-run the whole thing instead.
4. Then write `report`, `summary`, `plan`, `sentiment` and `news` yourself (see `/brief`), and refresh
   `trade_plans` for the session, carrying any open position forward with its live mark and greeks.
5. Reply with: Nifty close and TradingView's rating, the session's pivot levels, both chains' PCR/walls/
   straddle, net points with the top contributors and draggers, and the link.
