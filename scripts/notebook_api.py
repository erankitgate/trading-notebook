#!/usr/bin/env python3
"""Talk to the notebook's Supabase project as the owner, through the same RLS-protected REST API the site uses.

Auth: stateless. The owner's password comes from the NOTEBOOK_PASSWORD environment variable for that one run;
nothing is stored anywhere. (Claude's daily commands write through the Supabase MCP instead.)

    from notebook_api import Notebook
    nb = Notebook()
    nb.upsert('market_briefs', {...}, on_conflict='user_id,date')
    nb.select('diary_entries', 'select=date,title&order=date.desc&limit=5')
"""
import json, os, re, sys, urllib.request, urllib.error, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
EMAIL = "erankitgate@gmail.com"



def _cfg():
    src = (ROOT / "config.js").read_text()
    return re.search(r'supabaseUrl:\s*"([^"]+)"', src).group(1), re.search(r'supabaseAnonKey:\s*"([^"]+)"', src).group(1)


class Notebook:
    def __init__(self):
        self.url, self.anon = _cfg()
        self.access = None
        self.user_id = None
        self._login()

    def _auth(self, grant, body):
        req = urllib.request.Request(f"{self.url}/auth/v1/token?grant_type={grant}", data=json.dumps(body).encode(), method="POST",
                                     headers={"apikey": self.anon, "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.load(r)

    def _login(self):
        pw = os.environ.get("NOTEBOOK_PASSWORD")
        if not pw:
            sys.exit("Set NOTEBOOK_PASSWORD='<your notebook password>' for this run (it is not stored).")
        sess = self._auth("password", {"email": EMAIL, "password": pw})
        self.access = sess["access_token"]
        self.user_id = sess["user"]["id"]

    def _req(self, method, path, body=None, prefer=None):
        headers = {"apikey": self.anon, "Authorization": f"Bearer {self.access}", "Content-Type": "application/json", "Accept": "application/json"}
        if prefer:
            headers["Prefer"] = prefer
        req = urllib.request.Request(f"{self.url}/rest/v1/{path}", data=json.dumps(body).encode() if body is not None else None, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                raw = r.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as e:
            sys.exit(f"{method} {path} -> HTTP {e.code}: {e.read().decode()[:400]}")

    def select(self, table, query=""):
        return self._req("GET", f"{table}?{query}")

    def upsert(self, table, row, on_conflict):
        row = {**row, "user_id": self.user_id}
        return self._req("POST", f"{table}?on_conflict={on_conflict}", [row], prefer="resolution=merge-duplicates,return=representation")

    def update(self, table, match_query, patch):
        return self._req("PATCH", f"{table}?{match_query}", patch, prefer="return=representation")


if __name__ == "__main__":
    nb = Notebook()
    print("signed in as", nb.user_id)
    print(json.dumps(nb.select("settings", "select=capital,start_date,max_trades_per_day"), indent=1))
