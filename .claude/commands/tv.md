---
description: Refresh TradingView technicals, pivots and the Nifty 50 index-contribution ranking
argument-hint: optional session date YYYY-MM-DD (default: today, or the next session after the close)
---
Refresh the TradingView data for: $ARGUMENTS (default: today in IST; after 15:30 use today, since the close is final).

1. `python3 scripts/tradingview.py .tv.json` — pulls from TradingView's scanner: the index's oscillators,
   moving averages and Buy/Sell ratings, pivots in all five methods (Classic, Fibonacci, Camarilla, Woodie, DM)
   at monthly and daily, plus every Nifty 50 stock with free-float weight, points contribution, RSI, rating, sector.
2. `NOTEBOOK_PASSWORD='<the notebook password>' python3 scripts/publish_tv.py --date <session> --data .tv.json`
   (ask the owner for the password if you don't have it in the environment; never store it).
   That writes `technicals`, `contribution` and refreshes `stocks` on that date's brief, creating the row if needed.
3. Reply with: Nifty close and TradingView's summary rating (plus the MA and oscillator ratings), the daily pivot
   levels for the next session, net points and the three biggest contributors and draggers by points — and the link
   https://erankitgate.github.io/trading-notebook/#/market/<session>
4. If the owner's open positions are affected (check `trade_plans` where status = 'live'), say in one line what the
   technicals mean for them — specifically whether price is above or below the levels that matter for that strike.
