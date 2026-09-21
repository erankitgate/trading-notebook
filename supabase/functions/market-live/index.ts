// market-live: read-only proxy to the Upstox analytics API for the signed-in owner.
// The Upstox token is an edge-function secret (UPSTOX_TOKEN); the browser never sees it.
// Every request must carry a valid Supabase user JWT (Authorization: Bearer <access_token>).
import { createClient } from "npm:@supabase/supabase-js@2";

const UPSTOX = "https://api.upstox.com";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// op → Upstox path builder (GET only). Anything not listed is refused.
const OPS: Record<string, (q: URLSearchParams) => string | null> = {
  ltp: (q) => q.get("keys") ? `/v2/market-quote/ltp?instrument_key=${encodeURIComponent(q.get("keys")!)}` : null,
  quote: (q) => q.get("keys") ? `/v2/market-quote/quotes?instrument_key=${encodeURIComponent(q.get("keys")!)}` : null,
  ohlc: (q) => q.get("keys") ? `/v2/market-quote/ohlc?instrument_key=${encodeURIComponent(q.get("keys")!)}&interval=1d` : null,
  chain: (q) => q.get("key") && q.get("expiry") ? `/v2/option/chain?instrument_key=${encodeURIComponent(q.get("key")!)}&expiry_date=${q.get("expiry")}` : null,
  expiries: (q) => q.get("key") ? `/v2/option/contract?instrument_key=${encodeURIComponent(q.get("key")!)}` : null,
  intraday: (q) => q.get("key") ? `/v3/historical-candle/intraday/${encodeURIComponent(q.get("key")!)}/minutes/${q.get("interval") || "5"}` : null,
  daily: (q) => q.get("key") && q.get("to") && q.get("from") ? `/v3/historical-candle/${encodeURIComponent(q.get("key")!)}/days/1/${q.get("to")}/${q.get("from")}` : null,
  status: () => `/v2/market/status/NSE`,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET") return json({ error: "GET only" }, 405);

  // 1) who is asking? must be a signed-in user of this project
  const auth = req.headers.get("Authorization") ?? "";
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: { user }, error } = await sb.auth.getUser();
  if (error || !user) return json({ error: "sign in first" }, 401);

  // 2) which read-only call?
  const url = new URL(req.url);
  const op = url.searchParams.get("op") ?? "";
  const path = OPS[op]?.(url.searchParams);
  if (!path) return json({ error: `unknown or incomplete op '${op}'` }, 400);

  // 3) the token
  const token = Deno.env.get("UPSTOX_TOKEN");
  if (!token) return json({ error: "live data not configured (UPSTOX_TOKEN secret missing)" }, 503);

  const r = await fetch(UPSTOX + path, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  const body = await r.text();
  return new Response(body, { status: r.status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });
});
