#!/usr/bin/env python3
"""Push a TradingView fetch (.tv.json) into the brief for a session.

    NOTEBOOK_PASSWORD='…' python3 scripts/publish_tv.py --date 2026-09-23 [--data .tv.json]

Writes `technicals`, `contribution` and refreshes `stocks` on that date's market_briefs row,
creating the row if the session has no brief yet.
"""
import argparse, json, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from notebook_api import Notebook

ap = argparse.ArgumentParser()
ap.add_argument("--date", required=True)
ap.add_argument("--data", default=".tv.json")
a = ap.parse_args()

tv = json.loads(pathlib.Path(a.data).read_text())
idx = tv["index"]
row = {
    "date": a.date,
    "technicals": {**idx, "fetched_at": tv["fetched_at"], "source": tv["source"]},
    "contribution": tv["contribution"],
    "stocks": [{
        "symbol": s["symbol"], "close": s["close"], "chg_1d": s["chg_1d"], "chg_5d": s.get("chg_1w"), "chg_20d": s.get("chg_1m"),
        "rsi": s["rsi"], "trend": ("up" if (s.get("sma20") and s.get("sma50") and s["close"] > s["sma20"] > s["sma50"])
                                   else "down" if (s.get("sma20") and s.get("sma50") and s["close"] < s["sma20"] < s["sma50"]) else "sideways"),
        "dist_sma20_pct": round((s["close"] / s["sma20"] - 1) * 100, 2) if s.get("sma20") else None,
        "sma20": s.get("sma20"), "sma50": s.get("sma50"), "sma200": s.get("sma200"),
        "hi_52w": s.get("hi_52w"), "lo_52w": s.get("lo_52w"), "atr": s.get("atr"),
        "weight_pct": s.get("weight_pct"), "points": s.get("points"), "rating": s.get("rating"),
        "sector": s.get("sector"), "vol_vs_avg": s.get("vol_vs_avg"), "ytd": s.get("ytd"),
    } for s in tv["stocks"]],
}
nb = Notebook()
out = nb.upsert("market_briefs", row, on_conflict="user_id,date")
r = out[0] if isinstance(out, list) and out else {}
c = tv["contribution"]
print(f"{r.get('date', a.date)}: Nifty {idx['close']} ({idx['change_pct']:+.2f}%) — {idx['summary']['label']}")
print(f"  {len(row['stocks'])} stocks, net {c['net_points']:+.0f} pts ({c['advances']} up / {c['declines']} down)")
print(f"  https://erankitgate.github.io/trading-notebook/#/market/{a.date}")
