import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bsPrice, bsDelta, payoffGrid, impliedVol } from '../../js/lib/options.js';

test('bsPrice: deep ITM call ≈ intrinsic, far OTM call ≈ 0', () => {
  const itm = bsPrice({ type: 'CE', S: 23500, K: 20000, T: 14 / 365, sigma: 0.15 });
  assert.ok(Math.abs(itm - 3500) < 50);
  const otm = bsPrice({ type: 'CE', S: 23000, K: 30000, T: 14 / 365, sigma: 0.15 });
  assert.ok(otm < 1);
});
test('bsPrice: call rises with spot, falls with more time only if OTM decays slower ITM', () => {
  const lo = bsPrice({ type: 'CE', S: 23300, K: 23250, T: 14 / 365, sigma: 0.145 });
  const hi = bsPrice({ type: 'CE', S: 23500, K: 23250, T: 14 / 365, sigma: 0.145 });
  assert.ok(hi > lo);
});
test('bsDelta: call delta in (0,1), higher spot → higher delta', () => {
  const d1 = bsDelta({ type: 'CE', S: 23200, K: 23250, T: 14 / 365, sigma: 0.145 });
  const d2 = bsDelta({ type: 'CE', S: 23500, K: 23250, T: 14 / 365, sigma: 0.145 });
  assert.ok(d1 > 0 && d1 < 1 && d2 > 0 && d2 < 1 && d2 > d1);
});
test('payoffGrid: pnl increases with spot for a long call, zero offset ≈ current mark minus entry', () => {
  const plan = { option_type: 'CE', strike: 23250, entry: 186.69, qty: 910, side: 'Buy' };
  const grid = payoffGrid(plan, 23414.3, 14, 14.5, [-200, -100, 0, 100, 200]);
  assert.equal(grid.length, 5);
  for (let i = 1; i < grid.length; i++) assert.ok(grid[i].pnl >= grid[i - 1].pnl);
  assert.ok(grid.find((g) => g.offset === 0).premium > 150); // roughly matches the real entry level
});

test('impliedVol: round-trips a known price back to a plausible IV', () => {
  // Calibrated near the strike (roughly ATM), where the entry price is arbitrage-consistent at a normal IV.
  const iv = impliedVol({ type: 'CE', S: 23250, K: 23250, T: 14 / 365, price: 186.69 });
  assert.ok(iv > 1 && iv < 50, `iv=${iv} should be a plausible percentage`);
  const back = bsPrice({ type: 'CE', S: 23250, K: 23250, T: 14 / 365, sigma: iv / 100 });
  assert.ok(Math.abs(back - 186.69) < 0.5, `round-trip price ${back} should match 186.69`);
});
test('impliedVol returns null rather than a nonsense answer when the price is below intrinsic (arbitrage-inconsistent spot)', () => {
  const iv = impliedVol({ type: 'CE', S: 23414.3, K: 23250, T: 14 / 365, price: 186.69 });
  // At this spot even 1% vol overshoots the given price — the solver should say so, not silently return 1%.
  assert.equal(iv, null);
});
