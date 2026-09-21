#!/usr/bin/env python3
"""Build the raw data for a market brief: Nifty/BankNifty levels, global cues, all Nifty 50 stocks.

Fetches daily candles from Yahoo Finance (no key needed), computes RSI(14), SMA20/50, ATR(14),
% changes, previous-day high/low and classic pivots, and writes one JSON file.
The narrative (summary + plan) is written by Claude on top of this data; see .claude/commands/brief.md.

Usage: python3 scripts/market_brief.py [out.json]      (default: .brief.json, git-ignored)
"""
import json, sys, time, urllib.request, urllib.error, datetime as dt

UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36"}

INDICES = [("^NSEI", "Nifty 50"), ("^NSEBANK", "Bank Nifty"), ("^INDIAVIX", "India VIX")]
GLOBALS = [
    ("CL=F", "Crude WTI ($)"), ("BZ=F", "Brent ($)"), ("GC=F", "Gold ($)"), ("DX-Y.NYB", "Dollar index"), ("USDINR=X", "USD/INR"),
    ("^TNX", "US 10Y yield (%)"), ("^GSPC", "S&P 500"), ("^IXIC", "Nasdaq"), ("^DJI", "Dow"), ("^VIX", "US VIX"),
    ("^N225", "Nikkei"), ("^HSI", "Hang Seng"), ("000001.SS", "Shanghai"), ("^KS11", "Kospi"), ("^STI", "Straits Times"),
]
NIFTY50 = [
    "ADANIENT", "ADANIPORTS", "APOLLOHOSP", "ASIANPAINT", "AXISBANK", "BAJAJ-AUTO", "BAJFINANCE", "BAJAJFINSV", "BEL", "BHARTIARTL",
    "CIPLA", "COALINDIA", "DRREDDY", "EICHERMOT", "ETERNAL", "GRASIM", "HCLTECH", "HDFCBANK", "HDFCLIFE", "HEROMOTOCO",
    "HINDALCO", "HINDUNILVR", "ICICIBANK", "INDIGO", "INFY", "ITC", "JIOFIN", "JSWSTEEL", "KOTAKBANK", "LT",
    "M&M", "MARUTI", "MAXHEALTH", "NESTLEIND", "NTPC", "ONGC", "POWERGRID", "RELIANCE", "SBILIFE", "SBIN",
    "SHRIRAMFIN", "SUNPHARMA", "TATACONSUM", "TATAMOTORS", "TATASTEEL", "TCS", "TECHM", "TITAN", "TRENT", "ULTRACEMCO", "WIPRO",
]
IST = dt.timezone(dt.timedelta(hours=5, minutes=30))


PAUSE = 0.9  # seconds between requests; Yahoo returns 429 when hammered


def fetch(symbol, rng="1y"):
    hosts = ["query1", "query2"]
    for attempt in range(6):
        url = f"https://{hosts[attempt % 2]}.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(symbol)}?range={rng}&interval=1d"
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=20) as r:
                d = json.load(r)["chart"]["result"][0]
            q = d["indicators"]["quote"][0]
            rows = [(t, o, h, l, c, v) for t, o, h, l, c, v in zip(d["timestamp"], q["open"], q["high"], q["low"], q["close"], q["volume"]) if c is not None]
            time.sleep(PAUSE)
            return rows, d["meta"]
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(8 * (attempt + 1))  # back off hard, then try the other host
                continue
            if attempt == 5:
                raise RuntimeError(f"{symbol}: {e}")
            time.sleep(2)
        except (urllib.error.URLError, KeyError, IndexError, json.JSONDecodeError, TimeoutError) as e:
            if attempt == 5:
                raise RuntimeError(f"{symbol}: {e}")
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"{symbol}: rate limited")


def sma(xs, n):
    return sum(xs[-n:]) / n if len(xs) >= n else None


def rsi(closes, n=14):
    if len(closes) < n + 1:
        return None
    gains = losses = 0.0
    for i in range(1, n + 1):
        d = closes[i] - closes[i - 1]
        gains += max(d, 0); losses += max(-d, 0)
    ag, al = gains / n, losses / n
    for i in range(n + 1, len(closes)):
        d = closes[i] - closes[i - 1]
        ag = (ag * (n - 1) + max(d, 0)) / n; al = (al * (n - 1) + max(-d, 0)) / n
    return 100.0 if al == 0 else round(100 - 100 / (1 + ag / al), 1)


def atr(rows, n=14):
    if len(rows) < n + 1:
        return None
    trs = []
    for i in range(1, len(rows)):
        _, _, h, l, c, _ = rows[i]; pc = rows[i - 1][4]
        trs.append(max(h - l, abs(h - pc), abs(l - pc)))
    a = sum(trs[:n]) / n
    for tr in trs[n:]:
        a = (a * (n - 1) + tr) / n
    return round(a, 2)


def pct(a, b):
    return round((a / b - 1) * 100, 2) if a is not None and b else None


def analyse(symbol, label, rows, meta):
    closes = [r[4] for r in rows]
    last = rows[-1]; prev = rows[-2] if len(rows) > 1 else last
    c = round(last[4], 2)
    s20, s50, s200 = sma(closes, 20), sma(closes, 50), sma(closes, 200)
    r = rsi(closes)
    trend = "up" if s20 and s50 and c > s20 > s50 else "down" if s20 and s50 and c < s20 < s50 else "sideways"
    return {
        "symbol": symbol, "name": label, "date": dt.datetime.fromtimestamp(last[0], IST).strftime("%Y-%m-%d"),
        "close": c, "open": round(last[1], 2), "high": round(last[2], 2), "low": round(last[3], 2), "prev_close": round(prev[4], 2),
        "chg_1d": pct(c, prev[4]), "chg_5d": pct(c, closes[-6]) if len(closes) > 5 else None, "chg_20d": pct(c, closes[-21]) if len(closes) > 20 else None,
        "rsi": r, "sma20": round(s20, 2) if s20 else None, "sma50": round(s50, 2) if s50 else None, "sma200": round(s200, 2) if s200 else None,
        "dist_sma20_pct": pct(c, s20), "atr": atr(rows), "trend": trend,
        "hi_52w": round(max(r_[2] for r_ in rows[-252:]), 2), "lo_52w": round(min(r_[3] for r_ in rows[-252:]), 2),
        "volume": last[5], "avg_volume_20": round(sum((r_[5] or 0) for r_ in rows[-20:]) / min(20, len(rows))),
        "currency": meta.get("currency"),
    }


def pivots(x):
    h, l, c = x["high"], x["low"], x["close"]
    p = (h + l + c) / 3
    return {"pdh": h, "pdl": l, "pivot": round(p, 1), "r1": round(2 * p - l, 1), "r2": round(p + (h - l), 1), "r3": round(h + 2 * (p - l), 1),
            "s1": round(2 * p - h, 1), "s2": round(p - (h - l), 1), "s3": round(l - 2 * (h - p), 1)}


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else ".brief.json"
    out = {"generated_at": dt.datetime.now(IST).isoformat(timespec="seconds"), "indices": [], "globals": [], "stocks": [], "failed": []}
    for sym, label in INDICES:
        try:
            rows, meta = fetch(sym); x = analyse(sym, label, rows, meta)
            if sym != "^INDIAVIX":
                x["pivots"] = pivots(x)
            out["indices"].append(x)
        except Exception as e:
            out["failed"].append(str(e))
    for sym, label in GLOBALS:
        try:
            rows, meta = fetch(sym, "6mo"); out["globals"].append(analyse(sym, label, rows, meta))
        except Exception as e:
            out["failed"].append(str(e))
    for s in NIFTY50:
        try:
            rows, meta = fetch(f"{s}.NS"); out["stocks"].append(analyse(s, s, rows, meta))
        except Exception as e:
            out["failed"].append(str(e))
    out["stocks"].sort(key=lambda x: -(x["chg_1d"] or 0))
    n = out["indices"][0] if out["indices"] else None
    out["as_of"] = n["date"] if n else None
    up = sum(1 for x in out["stocks"] if (x["chg_1d"] or 0) > 0)
    out["breadth"] = {"advances": up, "declines": len(out["stocks"]) - up, "above_sma20": sum(1 for x in out["stocks"] if x["dist_sma20_pct"] and x["dist_sma20_pct"] > 0),
                      "rsi_over_70": [x["symbol"] for x in out["stocks"] if x["rsi"] and x["rsi"] >= 70], "rsi_under_30": [x["symbol"] for x in out["stocks"] if x["rsi"] and x["rsi"] <= 30]}
    with open(out_path, "w") as f:
        json.dump(out, f, indent=1)
    print(f"as of {out['as_of']}: {len(out['indices'])} indices, {len(out['globals'])} globals, {len(out['stocks'])} stocks, {len(out['failed'])} failed -> {out_path}")
    for f_ in out["failed"]:
        print("  failed:", f_)
    if n:
        print(f"  Nifty {n['close']} ({n['chg_1d']:+.2f}%) RSI {n['rsi']} | PDH {n['high']} PDL {n['low']} | pivot {n['pivots']['pivot']} R1 {n['pivots']['r1']} S1 {n['pivots']['s1']}")


if __name__ == "__main__":
    import urllib.parse  # noqa: E402  (used in fetch)
    main()
