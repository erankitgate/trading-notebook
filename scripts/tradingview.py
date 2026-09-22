#!/usr/bin/env python3
"""Fetch TradingView's own technicals for Nifty and every Nifty 50 stock.

Uses TradingView's public scanner endpoint — the same numbers their Technicals / Pivots panels show:
oscillators, moving averages, the Buy/Sell/Neutral ratings, and pivots in all five methods.
Also computes each stock's index weight (free-float market cap) and its points contribution to the
day's Nifty move, so the 50 can be ranked by what actually pushed the index.

Usage: python3 scripts/tradingview.py [out.json]     (default: .tv.json, git-ignored)
"""
import json, sys, time, urllib.request, urllib.error, datetime as dt

SCAN = "https://scanner.tradingview.com/india/scan"
SCAN_GLOBAL = "https://scanner.tradingview.com/global/scan"

# One source, one timestamp — every global cue comes from the same pull as the Indian data,
# and each is the instrument a trader actually watches (NDX the Nasdaq 100, not the Composite).
GLOBALS = [
    ("NYMEX:CL1!", "Crude WTI ($)"), ("ICEEUR:BRN1!", "Brent ($)"), ("TVC:GOLD", "Gold ($)"),
    ("TVC:DXY", "Dollar index"), ("FX_IDC:USDINR", "USD/INR"), ("TVC:US10Y", "US 10Y yield (%)"),
    ("SP:SPX", "S&P 500"), ("NASDAQ:NDX", "Nasdaq 100"), ("DJ:DJI", "Dow"), ("CBOE:VIX", "US VIX"),
    ("TVC:NI225", "Nikkei"), ("TVC:HSI", "Hang Seng"),
]
INDIAN_INDICES = [("NSE:NIFTY", "Nifty 50"), ("NSE:BANKNIFTY", "Bank Nifty"), ("NSE:INDIAVIX", "India VIX")]
UA = {"User-Agent": "Mozilla/5.0", "Content-Type": "application/json", "Accept": "application/json"}
IST = dt.timezone(dt.timedelta(hours=5, minutes=30))

# TradingView rates a value from -1 (strong sell) to +1 (strong buy); these are their own buckets.
def rating(v):
    if v is None:
        return None
    if v <= -0.5: return "Strong sell"
    if v < -0.1:  return "Sell"
    if v <= 0.1:  return "Neutral"
    if v < 0.5:   return "Buy"
    return "Strong buy"

OSCILLATORS = [
    ("Relative Strength Index (14)", "RSI", "Rec.RSI"),
    ("Stochastic %K (14, 3, 3)", "Stoch.K", "Rec.Stoch.RSI"),
    ("Commodity Channel Index (20)", "CCI20", "Rec.CCI20"),
    ("Average Directional Index (14)", "ADX", "Rec.ADX"),
    ("Awesome Oscillator", "AO", None),
    ("Momentum (10)", "Mom", "Rec.Mom"),
    ("MACD Level (12, 26)", "MACD.macd", None),
    ("Stochastic RSI Fast (3, 3, 14, 14)", "Stoch.RSI.K", "Rec.Stoch.RSI"),
    ("Williams Percent Range (14)", "W.R", "Rec.WR"),
    ("Bull Bear Power", "BBPower", "Rec.BBPower"),
    ("Ultimate Oscillator (7, 14, 28)", "UO", "Rec.UO"),
]
MOVING_AVERAGES = [
    ("Exponential Moving Average (10)", "EMA10"), ("Simple Moving Average (10)", "SMA10"),
    ("Exponential Moving Average (20)", "EMA20"), ("Simple Moving Average (20)", "SMA20"),
    ("Exponential Moving Average (30)", "EMA30"), ("Simple Moving Average (30)", "SMA30"),
    ("Exponential Moving Average (50)", "EMA50"), ("Simple Moving Average (50)", "SMA50"),
    ("Exponential Moving Average (100)", "EMA100"), ("Simple Moving Average (100)", "SMA100"),
    ("Exponential Moving Average (200)", "EMA200"), ("Simple Moving Average (200)", "SMA200"),
    ("Ichimoku Base Line (9, 26, 52, 26)", "Ichimoku.BLine"),
    ("Volume Weighted Moving Average (20)", "VWMA"), ("Hull Moving Average (9)", "HullMA9"),
]
PIVOT_METHODS = [("Classic", "Classic"), ("Fibonacci", "Fibonacci"), ("Camarilla", "Camarilla"), ("Woodie", "Woodie"), ("DM", "Demark")]
PIVOT_LEVELS = ["R3", "R2", "R1", "Middle", "S1", "S2", "S3"]

# TradingView tickers. Most are NSE:<symbol>; the exceptions are spelled out.
# (Tata Motors demerged into TMPV/TMCV; Mahindra only resolves on BSE in the scanner.)
NIFTY50 = [
    "ADANIENT", "ADANIPORTS", "APOLLOHOSP", "ASIANPAINT", "AXISBANK", "BAJAJ_AUTO", "BAJFINANCE", "BAJAJFINSV", "BEL", "BHARTIARTL",
    "CIPLA", "COALINDIA", "DRREDDY", "EICHERMOT", "ETERNAL", "GRASIM", "HCLTECH", "HDFCBANK", "HDFCLIFE", "HEROMOTOCO",
    "HINDALCO", "HINDUNILVR", "ICICIBANK", "INDIGO", "INFY", "ITC", "JIOFIN", "JSWSTEEL", "KOTAKBANK", "LT",
    "BSE:M_M", "MARUTI", "MAXHEALTH", "NESTLEIND", "NTPC", "ONGC", "POWERGRID", "RELIANCE", "SBILIFE", "SBIN",
    "SHRIRAMFIN", "SUNPHARMA", "TATACONSUM", "TMPV", "TMCV", "TATASTEEL", "TCS", "TECHM", "TITAN", "TRENT", "ULTRACEMCO", "WIPRO",
]
PRETTY = {"BAJAJ_AUTO": "BAJAJ-AUTO", "M_M": "M&M", "TMPV": "TATAMOTORS PV", "TMCV": "TATAMOTORS CV"}


def scan(tickers, columns, url=SCAN):
    body = json.dumps({"symbols": {"tickers": tickers, "query": {"types": []}}, "columns": columns}).encode()
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, data=body, headers=UA), timeout=30) as r:
                return json.load(r).get("data", [])
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError) as e:
            if attempt == 3:
                raise RuntimeError(f"tradingview scan failed: {e}")
            time.sleep(2 * (attempt + 1))


def index_technicals():
    """Oscillators, moving averages, ratings and every pivot method for NIFTY."""
    osc_cols = [f for _, f, _ in OSCILLATORS]
    ma_cols = [f for _, f in MOVING_AVERAGES]
    pivot_cols = [f"Pivot.M.{tv}.{lvl}" for _, tv in PIVOT_METHODS for lvl in PIVOT_LEVELS]
    day_pivots = [f"Pivot.M.Classic.{lvl}|1D" for lvl in PIVOT_LEVELS]
    base = ["close", "change", "change_abs", "high", "low", "open", "volume",
            "Recommend.All", "Recommend.MA", "Recommend.Other", "ATR", "Volatility.D"]
    cols = base + osc_cols + ma_cols + pivot_cols + day_pivots
    row = scan(["NSE:NIFTY"], cols)
    if not row:
        raise RuntimeError("no data for NSE:NIFTY")
    d = dict(zip(cols, row[0]["d"]))

    out = {
        "close": d.get("close"), "change_pct": d.get("change"), "change_abs": d.get("change_abs"),
        "high": d.get("high"), "low": d.get("low"), "open": d.get("open"), "atr": d.get("ATR"),
        "summary": {"all": d.get("Recommend.All"), "ma": d.get("Recommend.MA"), "osc": d.get("Recommend.Other"),
                    "label": rating(d.get("Recommend.All")), "ma_label": rating(d.get("Recommend.MA")), "osc_label": rating(d.get("Recommend.Other"))},
        "oscillators": [], "moving_averages": [], "pivots": {}, "pivots_daily": {},
    }
    close = d.get("close")
    for name, field, rec in OSCILLATORS:
        v = d.get(field)
        out["oscillators"].append({"name": name, "value": None if v is None else round(v, 2), "action": rating(d.get(rec)) if rec and d.get(rec) is not None else None})
    for name, field in MOVING_AVERAGES:
        v = d.get(field)
        # TradingView's own rule for a MA row: price above = Buy, below = Sell.
        action = None if v is None or close is None else ("Buy" if close > v else "Sell" if close < v else "Neutral")
        out["moving_averages"].append({"name": name, "value": None if v is None else round(v, 2), "action": action})
    for label, tv in PIVOT_METHODS:
        out["pivots"][label] = {lvl: (None if d.get(f"Pivot.M.{tv}.{lvl}") is None else round(d[f"Pivot.M.{tv}.{lvl}"], 2)) for lvl in PIVOT_LEVELS}
    out["pivots_daily"]["Classic"] = {lvl: (None if d.get(f"Pivot.M.Classic.{lvl}|1D") is None else round(d[f"Pivot.M.Classic.{lvl}|1D"], 2)) for lvl in PIVOT_LEVELS}
    return out


def constituents(index_close, index_chg_pct):
    """Every Nifty 50 stock with its free-float weight and points contribution to today's index move."""
    cols = ["close", "change", "change_abs", "market_cap_basic", "float_shares_percent_current",
            "RSI", "Recommend.All", "Recommend.MA", "Recommend.Other", "volume", "average_volume_10d_calc",
            "sector", "SMA20", "SMA50", "SMA200", "ATR", "High.1M", "Low.1M", "price_52_week_high", "price_52_week_low",
            "change|1W", "change|1M", "Perf.YTD"]
    rows = scan([s if ":" in s else f"NSE:{s}" for s in NIFTY50], cols)
    stocks = []
    for r in rows:
        d = dict(zip(cols, r["d"]))
        sym = r["s"].split(":")[1]
        sym = PRETTY.get(sym, sym)
        mcap, flt = d.get("market_cap_basic"), d.get("float_shares_percent_current")
        stocks.append({
            "symbol": sym, "close": d.get("close"), "chg_1d": d.get("change"), "chg_abs": d.get("change_abs"),
            "free_float_mcap": (mcap * flt / 100) if mcap and flt else None, "mcap": mcap,
            "rsi": None if d.get("RSI") is None else round(d["RSI"], 1),
            "rating": rating(d.get("Recommend.All")), "rating_value": d.get("Recommend.All"),
            "ma_rating": rating(d.get("Recommend.MA")), "osc_rating": rating(d.get("Recommend.Other")),
            "volume": d.get("volume"), "avg_volume_10d": d.get("average_volume_10d_calc"),
            "sector": d.get("sector"), "sma20": d.get("SMA20"), "sma50": d.get("SMA50"), "sma200": d.get("SMA200"),
            "atr": d.get("ATR"), "hi_52w": d.get("price_52_week_high"), "lo_52w": d.get("price_52_week_low"),
            "chg_1w": d.get("change|1W"), "chg_1m": d.get("change|1M"), "ytd": d.get("Perf.YTD"),
        })
    total_ff = sum(s["free_float_mcap"] for s in stocks if s["free_float_mcap"]) or 1
    for s in stocks:
        s["weight_pct"] = round(s["free_float_mcap"] / total_ff * 100, 3) if s["free_float_mcap"] else None
        # points the stock added to / took off the index today
        s["points"] = round((s["weight_pct"] or 0) / 100 * (s["chg_1d"] or 0) / 100 * (index_close or 0), 2)
        s["vol_vs_avg"] = round(s["volume"] / s["avg_volume_10d"], 2) if s.get("volume") and s.get("avg_volume_10d") else None
    stocks.sort(key=lambda s: -(s["points"] or 0))
    return stocks


def quotes(tickers_named, url=SCAN_GLOBAL):
    """close / change / RSI / trend for a named list of tickers, all from one call."""
    cols = ["close", "change", "change_abs", "RSI", "SMA20", "SMA50", "SMA200", "change|1W", "change|1M", "update_mode", "Recommend.All"]
    rows = {r["s"]: dict(zip(cols, r["d"])) for r in scan([t for t, _ in tickers_named], cols, url)}
    out = []
    for ticker, name in tickers_named:
        d = rows.get(ticker)
        if not d:
            continue
        c, s20, s50 = d.get("close"), d.get("SMA20"), d.get("SMA50")
        out.append({
            "symbol": ticker, "name": name, "close": c, "chg_1d": d.get("change"), "chg_abs": d.get("change_abs"),
            "chg_5d": d.get("change|1W"), "chg_20d": d.get("change|1M"),
            "rsi": None if d.get("RSI") is None else round(d["RSI"], 1),
            "sma20": s20, "sma50": s50, "sma200": d.get("SMA200"),
            "dist_sma20_pct": round((c / s20 - 1) * 100, 2) if c and s20 else None,
            "trend": "up" if (c and s20 and s50 and c > s20 > s50) else "down" if (c and s20 and s50 and c < s20 < s50) else "sideways",
            "rating": rating(d.get("Recommend.All")), "live": d.get("update_mode"),
        })
    return out


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else ".tv.json"
    idx = index_technicals()
    stocks = constituents(idx["close"], idx["change_pct"])
    globals_ = quotes(GLOBALS)
    indices = quotes(INDIAN_INDICES, SCAN)
    ups = [s for s in stocks if (s["points"] or 0) > 0]
    downs = [s for s in stocks if (s["points"] or 0) < 0]
    out = {
        "source": "TradingView scanner", "fetched_at": dt.datetime.now(IST).isoformat(timespec="seconds"),
        "index": idx, "stocks": stocks, "globals": globals_, "indices": indices,
        "contribution": {
            "points_up": round(sum(s["points"] for s in ups), 2), "points_down": round(sum(s["points"] for s in downs), 2),
            "net_points": round(sum(s["points"] or 0 for s in stocks), 2),
            "top_contributors": ups[:8], "top_draggers": list(reversed(downs[-8:])),
            "advances": len(ups), "declines": len(downs),
        },
    }
    with open(out_path, "w") as f:
        json.dump(out, f, indent=1)
    s = idx["summary"]
    print(f"Nifty {idx['close']} ({idx['change_pct']:+.2f}%) — TradingView says: {s['label']} (MAs {s['ma_label']}, oscillators {s['osc_label']})")
    print(f"  {len(stocks)} stocks · {out['contribution']['advances']} up / {out['contribution']['declines']} down · net {out['contribution']['net_points']:+.0f} pts")
    print("  pushing up:  " + ", ".join(f"{x['symbol']} {x['points']:+.1f}" for x in out["contribution"]["top_contributors"][:5]))
    print("  dragging:    " + ", ".join(f"{x['symbol']} {x['points']:+.1f}" for x in out["contribution"]["top_draggers"][:5]))
    print(f"  globals: " + ", ".join(f"{g['name'].split(' (')[0]} {g['close']} ({g['chg_1d']:+.2f}%)" for g in globals_[:5]))
    print(f"  -> {out_path}")


if __name__ == "__main__":
    main()
