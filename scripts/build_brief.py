#!/usr/bin/env python3
"""Build one internally-consistent brief for a session, from the authoritative source for each number.

    Upstox      → Indian index OHLC, the option chains, live marks for open positions
    TradingView → technicals/ratings, pivots in every method, all 50 stocks, global cues

Everything in a brief comes from one run, so a page can never show two different prices for the same
thing. Daily pivots are computed here from the last completed candle, so they are the levels for the
session the brief is FOR, not the session that just ended.

    NOTEBOOK_PASSWORD='…' python3 scripts/build_brief.py --date 2026-09-23 [--tv .tv.json]

Writes: as_of, nifty, indices, globals, stocks, breadth, technicals, contribution, oi.
Leaves `report`, `summary`, `plan`, `sentiment` and `news` alone — those are written by Claude.
"""
import argparse, json, pathlib, subprocess, sys, urllib.request, urllib.error, datetime as dt

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from notebook_api import Notebook

IST = dt.timezone(dt.timedelta(hours=5, minutes=30))
UPSTOX = "https://api.upstox.com"
NIFTY = "NSE_INDEX|Nifty 50"


def token():
    r = subprocess.run(["security", "find-generic-password", "-s", "trading-notebook-upstox-token", "-w"], capture_output=True, text=True)
    if r.returncode:
        sys.exit("Upstox token not in Keychain (service trading-notebook-upstox-token).")
    return r.stdout.strip()


def ups(path, tok):
    # Upstox rejects urllib's default user-agent with a 403, so send a real one.
    req = urllib.request.Request(f"{UPSTOX}{path}", headers={
        "Authorization": f"Bearer {tok}", "Accept": "application/json", "User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            return json.load(r).get("data")
    except urllib.error.HTTPError as e:
        print(f"  ! upstox {path.split('?')[0]} -> HTTP {e.code}", file=sys.stderr)
        return None


def pivots_from(h, l, c):
    """Classic floor pivots for the NEXT session, from the last completed candle."""
    p = (h + l + c) / 3
    r = lambda x: round(x, 2)
    return {"pdh": r(h), "pdl": r(l), "pivot": r(p), "r1": r(2 * p - l), "r2": r(p + (h - l)), "r3": r(h + 2 * (p - l)),
            "s1": r(2 * p - h), "s2": r(p - (h - l)), "s3": r(l - 2 * (h - p))}


def chain_summary(tok, expiry, spot, lo=0.97, hi=1.03):
    rows = ups(f"/v2/option/chain?instrument_key={urllib.parse.quote(NIFTY)}&expiry_date={expiry}", tok)
    if not rows:
        return None
    band = [r for r in rows if spot * lo <= r["strike_price"] <= spot * hi]
    if not band:
        return None
    tc = sum(r["call_options"]["market_data"]["oi"] or 0 for r in band)
    tp = sum(r["put_options"]["market_data"]["oi"] or 0 for r in band)
    mc = max(band, key=lambda r: r["call_options"]["market_data"]["oi"] or 0)
    mp = max(band, key=lambda r: r["put_options"]["market_data"]["oi"] or 0)
    atm = min(band, key=lambda r: abs(r["strike_price"] - spot))
    straddle = round((atm["call_options"]["market_data"]["ltp"] or 0) + (atm["put_options"]["market_data"]["ltp"] or 0), 1)
    top = lambda side, n=4: sorted(band, key=lambda r: -(r[side]["market_data"]["oi"] or 0))[:n]
    m = lambda x: round((x or 0) / 1e6, 2)
    return {
        "expiry": expiry, "pcr": round(tp / tc, 2) if tc else None,
        "max_call": mc["strike_price"], "max_put": mp["strike_price"],
        "call_walls": [[r["strike_price"], m(r["call_options"]["market_data"]["oi"])] for r in top("call_options")],
        "put_walls": [[r["strike_price"], m(r["put_options"]["market_data"]["oi"])] for r in top("put_options")],
        "rows": [[r["strike_price"], m(r["call_options"]["market_data"]["oi"]), m(r["put_options"]["market_data"]["oi"])]
                 for r in band if r["strike_price"] % 100 == 0],
        "straddle": straddle, "expected_move": round(straddle * 0.8),
        "atm": atm["strike_price"],
    }


def main():
    import urllib.parse  # noqa: F401 (used via urllib.parse.quote above)
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", required=True, help="the session this brief is FOR (YYYY-MM-DD)")
    ap.add_argument("--tv", default=".tv.json", help="output of scripts/tradingview.py")
    a = ap.parse_args()

    tv = json.loads(pathlib.Path(a.tv).read_text())
    tok = token()

    keys = urllib.parse.quote("NSE_INDEX|Nifty 50,NSE_INDEX|Nifty Bank,NSE_INDEX|India VIX", safe=",")
    q = ups(f"/v2/market-quote/quotes?instrument_key={keys}", tok) or {}
    nifty_q = q.get("NSE_INDEX:Nifty 50", {})
    ohlc = nifty_q.get("ohlc", {})
    spot = nifty_q.get("last_price") or tv["index"]["close"]
    as_of = dt.datetime.now(IST).strftime("%Y-%m-%d")

    tvi = tv["index"]
    nifty = {
        "symbol": "^NSEI", "name": "Nifty 50", "date": as_of, "close": spot,
        "open": ohlc.get("open"), "high": ohlc.get("high"), "low": ohlc.get("low"),
        "prev_close": round(spot - (nifty_q.get("net_change") or 0), 2),
        "chg_1d": tvi.get("change_pct"), "chg_5d": None, "chg_20d": None,
        "rsi": next((o["value"] for o in tvi["oscillators"] if o["name"].startswith("Relative")), None),
        "sma10": next((m["value"] for m in tvi["moving_averages"] if m["name"] == "Simple Moving Average (10)"), None),
        "sma20": next((m["value"] for m in tvi["moving_averages"] if m["name"] == "Simple Moving Average (20)"), None),
        "sma50": next((m["value"] for m in tvi["moving_averages"] if m["name"] == "Simple Moving Average (50)"), None),
        "sma200": next((m["value"] for m in tvi["moving_averages"] if m["name"] == "Simple Moving Average (200)"), None),
        "atr": tvi.get("atr"), "trend": "down" if (tvi["summary"]["ma"] or 0) < -0.1 else "up" if (tvi["summary"]["ma"] or 0) > 0.1 else "sideways",
    }
    nifty["dist_sma20_pct"] = round((spot / nifty["sma20"] - 1) * 100, 2) if nifty["sma20"] else None
    if ohlc.get("high") and ohlc.get("low"):
        nifty["pivots"] = pivots_from(ohlc["high"], ohlc["low"], spot)
    stocks_52w = [s for s in tv["stocks"] if s.get("hi_52w")]
    nifty["hi_52w"] = max((s["hi_52w"] for s in stocks_52w), default=None) and None  # index 52w not in the stock scan
    nifty.pop("hi_52w", None)

    # other Indian indices, from the same TradingView pull
    indices = []
    for x in tv.get("indices", []):
        if x["name"] == "Nifty 50":
            continue
        y = dict(x)
        qq = q.get("NSE_INDEX:Nifty Bank" if "Bank" in x["name"] else "NSE_INDEX:India VIX", {})
        o = qq.get("ohlc", {})
        y.update({"high": o.get("high"), "low": o.get("low"), "close": qq.get("last_price", x["close"])})
        if "Bank" in x["name"] and o.get("high") and o.get("low"):
            y["pivots"] = pivots_from(o["high"], o["low"], y["close"])
        indices.append(y)

    expiries = ups(f"/v2/option/contract?instrument_key={urllib.parse.quote(NIFTY)}", tok) or []
    dates = sorted({c["expiry"] for c in expiries if c["expiry"] >= a.date})
    oi = {"note": f"NSE option chain via Upstox, {as_of} close"}
    if dates:
        w = chain_summary(tok, dates[0], spot)
        if w:
            oi["weekly"] = w
    monthly = next((d for d in dates if d != (dates[0] if dates else None)), None)
    if monthly:
        m = chain_summary(tok, monthly, spot)
        if m:
            oi["monthly"] = m

    stocks = tv["stocks"]
    ups_n = sum(1 for s in stocks if (s.get("chg_1d") or 0) > 0)
    breadth = {"advances": ups_n, "declines": len(stocks) - ups_n,
               "above_sma20": sum(1 for s in stocks if s.get("sma20") and s["close"] > s["sma20"]),
               "rsi_over_70": [s["symbol"] for s in stocks if (s.get("rsi") or 0) >= 70],
               "rsi_under_30": [s["symbol"] for s in stocks if s.get("rsi") is not None and s["rsi"] <= 30]}

    row = {
        "date": a.date, "as_of": as_of, "nifty": nifty, "indices": indices,
        "globals": tv.get("globals", []), "stocks": [
            {"symbol": s["symbol"], "close": s["close"], "chg_1d": s["chg_1d"], "chg_5d": s.get("chg_1w"), "chg_20d": s.get("chg_1m"),
             "rsi": s["rsi"], "sma20": s.get("sma20"), "sma50": s.get("sma50"), "sma200": s.get("sma200"),
             "dist_sma20_pct": round((s["close"] / s["sma20"] - 1) * 100, 2) if s.get("sma20") else None,
             "trend": "up" if (s.get("sma20") and s.get("sma50") and s["close"] > s["sma20"] > s["sma50"]) else "down" if (s.get("sma20") and s.get("sma50") and s["close"] < s["sma20"] < s["sma50"]) else "sideways",
             "hi_52w": s.get("hi_52w"), "lo_52w": s.get("lo_52w"), "atr": s.get("atr"),
             "weight_pct": s.get("weight_pct"), "points": s.get("points"), "rating": s.get("rating"),
             "sector": s.get("sector"), "vol_vs_avg": s.get("vol_vs_avg"), "ytd": s.get("ytd")}
            for s in stocks],
        "breadth": breadth, "technicals": {**tvi, "fetched_at": tv["fetched_at"], "source": tv["source"]},
        "contribution": tv["contribution"], "oi": oi,
    }

    nb = Notebook()
    out = nb.upsert("market_briefs", row, on_conflict="user_id,date")
    r = out[0] if isinstance(out, list) and out else {}
    print(f"brief for {r.get('date', a.date)} (data as of {as_of})")
    print(f"  Nifty {spot} ({nifty['chg_1d']:+.2f}%) O {nifty['open']} H {nifty['high']} L {nifty['low']} · {tvi['summary']['label']}")
    if nifty.get("pivots"):
        p = nifty["pivots"]
        print(f"  pivots for the session: S2 {p['s2']} S1 {p['s1']} P {p['pivot']} R1 {p['r1']} R2 {p['r2']}")
    for k in ("weekly", "monthly"):
        if oi.get(k):
            o = oi[k]
            print(f"  {k} {o['expiry']}: PCR {o['pcr']}, call wall {o['max_call']}, put wall {o['max_put']}, straddle {o['straddle']} (±{o['expected_move']})")
    print(f"  {len(stocks)} stocks, net {tv['contribution']['net_points']:+.0f} pts · globals {len(row['globals'])}")
    print(f"  https://erankitgate.github.io/trading-notebook/#/market/{a.date}")


if __name__ == "__main__":
    import urllib.parse
    main()
