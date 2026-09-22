/* Minimal Black-Scholes option pricer, used only to estimate "what if spot moves X points"
   for a plan already on the books — never for placing trades. Pure functions, no I/O. */

const norm = (x) => 0.5 * (1 + erf(x / Math.SQRT2));
// Abramowitz-Stegun erf approximation, good to ~1.5e-7 — plenty for a what-if grid.
function erf(x) {
  const sign = x < 0 ? -1 : 1; x = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

/** Theoretical price of a European call/put. S spot, K strike, T years to expiry, r risk-free (decimal), sigma IV (decimal). */
export function bsPrice({ type, S, K, T, r = 0.065, sigma }) {
  if (T <= 0) return type === 'CE' ? Math.max(S - K, 0) : Math.max(K - S, 0);
  if (!sigma || sigma <= 0) return type === 'CE' ? Math.max(S - K, 0) : Math.max(K - S, 0);
  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  return type === 'CE' ? S * norm(d1) - K * Math.exp(-r * T) * norm(d2) : K * Math.exp(-r * T) * norm(-d2) - S * norm(-d1);
}

/** Delta (0..1 for calls, -1..0 for puts) — how much the premium moves per point of spot. */
export function bsDelta({ type, S, K, T, r = 0.065, sigma }) {
  if (T <= 0 || !sigma) return type === 'CE' ? (S > K ? 1 : 0) : (S < K ? -1 : 0);
  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * Math.sqrt(T));
  return type === 'CE' ? norm(d1) : norm(d1) - 1;
}

const daysToYears = (days) => Math.max(days, 0) / 365;

/**
 * P&L / premium at a set of spot offsets from the current spot, for a plan already opened.
 * plan: {option_type, strike, entry (or fill), qty, side}. spot: current underlying price.
 * daysLeft: whole days to expiry. ivPct: implied vol as a percentage (e.g. 14.5).
 * offsets: point deltas to show, e.g. [-200,-100,-50,0,50,100,200].
 */
export function payoffGrid(plan, spot, daysLeft, ivPct, offsets) {
  const K = Number(plan.strike), sigma = (Number(ivPct) || 15) / 100, T = daysToYears(daysLeft);
  const entry = Number(plan.fill ?? plan.entry), qty = Number(plan.qty) || 0;
  const sign = plan.side === 'Sell' ? -1 : 1;
  return offsets.map((off) => {
    const S = spot + off;
    const premium = Math.max(0, bsPrice({ type: plan.option_type, S, K, T, sigma }));
    const pnl = sign * (premium - entry) * qty;
    return { offset: off, spot: S, premium: Math.round(premium * 100) / 100, pnl: Math.round(pnl * 100) / 100 };
  });
}

/** Premium implied by a target spot move today — used to translate a Nifty-point stop into a premium stop. */
export function premiumAt(plan, spot, daysLeft, ivPct) {
  return bsPrice({ type: plan.option_type, S: spot, K: Number(plan.strike), T: daysToYears(daysLeft), sigma: (Number(ivPct) || 15) / 100 });
}

/**
 * Back out the implied volatility (as a %) that reproduces `price` for this contract — bisection, ~40 steps.
 * Use this instead of guessing an IV: calibrate once from the price actually paid, then reuse that IV for
 * "what if spot moves" scenarios, so the grid agrees with reality at the entry point.
 */
export function impliedVol({ type, S, K, T, price }) {
  if (!price || price <= 0 || T <= 0) return null;
  const floor = bsPrice({ type, S, K, T, sigma: 0.001 }); // ~ discounted intrinsic: the no-arbitrage minimum
  if (price <= floor) return null; // the quoted price implies a spot the option couldn't have traded at — don't guess
  let lo = 0.001, hi = 3; // 0.1% .. 300%
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const p = bsPrice({ type, S, K, T, sigma: mid });
    if (p > price) hi = mid; else lo = mid;
  }
  return Math.round(((lo + hi) / 2) * 10000) / 100; // %
}
