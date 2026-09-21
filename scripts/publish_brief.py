#!/usr/bin/env python3
"""Publish a market brief: numbers from .brief.json + the written report (markdown) + option-chain summary.

Usage:
    python3 scripts/publish_brief.py --date 2026-09-22 --report report.md [--data .brief.json] [--oi oi.json]

The report's first paragraph under "## The one-line read" becomes `summary`; bullets under
"## Plan for the session" become `plan`. Everything else is rendered from `report` on the site.
"""
import argparse, json, re, sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from notebook_api import Notebook


def section(md, title):
    m = re.search(rf"^##\s+{re.escape(title)}[^\n]*\n(.*?)(?=^##\s|\Z)", md, re.S | re.M)
    return m.group(1).strip() if m else ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", required=True, help="session the brief is for, YYYY-MM-DD")
    ap.add_argument("--report", required=True)
    ap.add_argument("--data", default=".brief.json")
    ap.add_argument("--oi", default=None, help="optional JSON with option-chain summary")
    a = ap.parse_args()

    md = pathlib.Path(a.report).read_text()
    data = json.loads(pathlib.Path(a.data).read_text())
    summary = section(md, "The one-line read")
    plan = [re.sub(r"^\d+\.\s*", "", l).strip() for l in section(md, "Plan for the session").splitlines() if re.match(r"^\s*(\d+\.|[-*])\s+", l)]
    idx = data.get("indices", [])
    nifty = next((x for x in idx if x["symbol"] == "^NSEI"), {})
    row = {
        "date": a.date, "as_of": data.get("as_of"), "summary": summary, "plan": plan, "report": md,
        "nifty": nifty, "indices": [x for x in idx if x["symbol"] != "^NSEI"],
        "globals": data.get("globals", []), "stocks": data.get("stocks", []), "breadth": data.get("breadth", {}),
        "oi": json.loads(pathlib.Path(a.oi).read_text()) if a.oi else {},
    }
    nb = Notebook()
    out = nb.upsert("market_briefs", row, on_conflict="user_id,date")
    r = out[0] if isinstance(out, list) and out else {}
    print(f"published brief for {r.get('date', a.date)} (as of {r.get('as_of')}): {len(row['stocks'])} stocks, {len(plan)} plan bullets, report {len(md)} chars")
    print(f"https://erankitgate.github.io/trading-notebook/#/market/{a.date}")


if __name__ == "__main__":
    main()
