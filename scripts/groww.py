#!/usr/bin/env python3
"""Read-only Groww market data. Credentials live in the macOS Keychain, never in files.

    security add-generic-password -U -a "$USER" -s trading-notebook-groww-key    -w '<api key>'
    security add-generic-password -U -a "$USER" -s trading-notebook-groww-secret -w '<api secret>'

Usage:
    python3 scripts/groww.py quote NSE NIFTY            # index/stock quote (LTP, OHLC, day change)
    python3 scripts/groww.py ltp NSE RELIANCE TCS INFY  # last prices
    python3 scripts/groww.py candles NSE NIFTY 5 2026-09-21   # 5-minute candles for a day

This module exposes only data calls. There is deliberately no order/portfolio code here.
"""
import json, subprocess, sys, datetime as dt

SEGMENT_CASH = "CASH"


def _keychain(service):
    try:
        return subprocess.run(["security", "find-generic-password", "-s", service, "-w"], capture_output=True, text=True, check=True).stdout.strip()
    except subprocess.CalledProcessError:
        sys.exit(f"Groww credential '{service}' not found in Keychain (see docstring).")


def client():
    from growwapi import GrowwAPI
    token = GrowwAPI.get_access_token(api_key=_keychain("trading-notebook-groww-key"), secret=_keychain("trading-notebook-groww-secret"))
    return GrowwAPI(token)


def quote(g, exchange, symbol):
    return g.get_quote(exchange=exchange, segment=SEGMENT_CASH, trading_symbol=symbol)


def ltp(g, exchange, symbols):
    return g.get_ltp(segment=SEGMENT_CASH, exchange_trading_symbols=[f"{exchange}_{s}" for s in symbols])


def candles(g, exchange, symbol, minutes, day):
    start, end = f"{day} 09:15:00", f"{day} 15:30:00"
    return g.get_historical_candle_data(trading_symbol=symbol, exchange=exchange, segment=SEGMENT_CASH, start_time=start, end_time=end, interval_in_minutes=int(minutes))


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a:
        sys.exit(__doc__)
    g = client()
    if a[0] == "quote":
        print(json.dumps(quote(g, a[1], a[2]), indent=1, default=str))
    elif a[0] == "ltp":
        print(json.dumps(ltp(g, a[1], a[2:]), indent=1, default=str))
    elif a[0] == "candles":
        print(json.dumps(candles(g, a[1], a[2], a[3], a[4] if len(a) > 4 else dt.date.today().isoformat()), indent=1, default=str))
    else:
        sys.exit(__doc__)
