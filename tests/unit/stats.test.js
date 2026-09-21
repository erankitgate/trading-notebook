import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoPnl, tradeRisk, tradeR, tradeRR, dayNet, dayGross, mistakeCounts, repeatedMistakes, ruleBreakCounts, summary, equityCurve, bySetup, byUnderlying, byWeekday, filterRange, suggestQty, riskBudget, dayLimits } from '../../js/lib/stats.js';

const day = (date, trades = [], extra = {}) => ({ date, trades, mistakes: [], rules_broken: [], charges: 0, ...extra });
const t = (o) => ({ instrument: 'NIFTY 25000 CE', side: 'Buy', qty: 75, entry: 100, ...o });

test('autoPnl: (exit − entry) × qty for Buy, reversed for Sell', () => {
  assert.equal(autoPnl(t({ exit: 110, qty: 10 })), 100);
  assert.equal(autoPnl(t({ side: 'Sell', exit: 110, qty: 10 })), -100);
  assert.equal(autoPnl(t({ exit: null })), null);
  assert.equal(autoPnl({ side: 'Buy', qty: '10', entry: '100', exit: '110.5' }), 105);
});

test('risk and R-multiples', () => {
  const tr = t({ stop: 90, exit: 120, pnl: 1500 });
  assert.equal(tradeRisk(tr), 750); // 10 × 75
  assert.equal(tradeR(tr), 2);
  assert.equal(tradeRR(t({ stop: 90, target: 130 })), 3);
  assert.equal(tradeRisk(t({ risk: 500 })), 500); // explicit risk wins
  assert.equal(tradeR(t({ pnl: 100 })), null); // no stop → no R
});

test('day net subtracts charges', () => {
  const e = day('2026-09-01', [t({ pnl: 1000 }), t({ pnl: -300 })], { charges: 120 });
  assert.equal(dayGross(e), 700);
  assert.equal(dayNet(e), 580);
});

test('mistakes count once per day, case-insensitive', () => {
  const diary = [
    day('2026-09-01', [], { mistakes: [{ tag: 'Exited too early' }, { tag: 'exited too early' }] }),
    day('2026-09-03', [], { mistakes: [{ tag: ' EXITED TOO EARLY ' }] }),
    day('2026-09-04', [], { mistakes: [{ tag: 'Chased' }] }),
  ];
  const mc = mistakeCounts(diary);
  assert.equal(mc['exited too early'].count, 2);
  assert.deepEqual(mc['exited too early'].dates, ['2026-09-03', '2026-09-01']);
  assert.equal(mc.chased.count, 1);
  assert.deepEqual(repeatedMistakes(diary).map((m) => m.count), [2]);
});

test('rule breaks accept strings or {id,text} and respect since', () => {
  const diary = [
    day('2026-08-01', [], { rules_broken: ['No first 15 min'] }),
    day('2026-09-01', [], { rules_broken: [{ id: 'a', text: 'No first 15 min' }] }),
  ];
  assert.equal(ruleBreakCounts(diary)['no first 15 min'].count, 2);
  assert.equal(ruleBreakCounts(diary, '2026-08-15')['no first 15 min'].count, 1);
});

test('summary: win rate, profit factor, expectancy, drawdown, streaks, plan adherence', () => {
  const diary = [
    day('2026-09-01', [t({ pnl: 1000, stop: 90 }), t({ pnl: -500, stop: 90 })], { plan_followed: 'yes' }),
    day('2026-09-02', [t({ pnl: -800, stop: 95 })], { plan_followed: 'no', rules_broken: ['x'] }),
    day('2026-09-03', [t({ pnl: -200 })], { plan_followed: 'no' }),
    day('2026-09-04', [t({ pnl: 2000 })], { plan_followed: 'yes' }),
  ];
  const s = summary(diary, { capital: 100000 });
  assert.equal(s.days, 4); assert.equal(s.net, 1500); assert.equal(s.greenDays, 2); assert.equal(s.redDays, 2);
  assert.equal(s.trades, 5); assert.equal(s.wins, 2); assert.equal(s.losses, 3);
  assert.equal(s.winRate, 0.4);
  assert.equal(s.profitFactor, 2); // 3000 / 1500
  assert.equal(s.expectancy, 300); // 1500 / 5
  assert.equal(s.avgWin, 1500); assert.equal(s.avgLoss, 500);
  assert.equal(s.maxDrawdown, 1000); // peak 500 → trough −500 (dates 1→3)
  assert.equal(s.ddStart, '2026-09-01'); assert.equal(s.ddEnd, '2026-09-03');
  assert.equal(s.maxDrawdownPct, 0.01);
  assert.equal(s.returnPct, 0.015);
  assert.deepEqual(s.streak, { type: 'green', n: 1 }); assert.equal(s.longestRed, 2);
  assert.equal(s.plan.yes, 2); assert.equal(s.plan.no, 2); assert.equal(s.plan.netYes, 2500); assert.equal(s.plan.netNo, -1000);
  assert.equal(s.discipline, 0.75);
  assert.equal(s.overRisk, 1); // −800 on 375 risk
  assert.equal(s.best.net, 2000); assert.equal(s.worst.net, -800);
});

test('summary on empty diary is all nulls/zeros, never NaN', () => {
  const s = summary([]);
  assert.equal(s.days, 0); assert.equal(s.net, 0); assert.equal(s.winRate, null); assert.equal(s.profitFactor, null); assert.equal(s.maxDrawdown, 0);
  assert.ok(!Object.values(s).some((v) => typeof v === 'number' && Number.isNaN(v)));
});

test('profit factor is Infinity with wins and no losses', () => {
  assert.equal(summary([day('2026-09-01', [t({ pnl: 10 })])]).profitFactor, Infinity);
});

test('equity curve is ascending and cumulative', () => {
  const c = equityCurve([day('2026-09-02', [t({ pnl: -100 })]), day('2026-09-01', [t({ pnl: 300 })])]);
  assert.deepEqual(c.map((p) => [p.date, p.cum, p.dd]), [['2026-09-01', 300, 0], ['2026-09-02', 200, 100]]);
});

test('breakdowns: setup, underlying, weekday', () => {
  const diary = [
    day('2026-09-01', [t({ pnl: 100, setup: 'ORB', stop: 90 }), t({ pnl: -50, setup: 'orb', stop: 90 }), t({ pnl: 30, instrument: 'BANKNIFTY 56000 PE' })]), // Tuesday
    day('2026-09-02', [t({ pnl: 200, setup: 'VWAP' })]), // Wednesday
  ];
  const s = bySetup(diary);
  assert.equal(s[0].label, 'ORB'); assert.equal(s[0].trades, 2); assert.equal(s[0].net, 50); assert.equal(s[0].winRate, 0.5);
  assert.ok(s.some((g) => g.label === 'No setup' && g.trades === 1));
  const u = byUnderlying(diary);
  assert.equal(u.find((g) => g.label === 'NIFTY').trades, 3); assert.equal(u.find((g) => g.label === 'BANKNIFTY').net, 30);
  const w = byWeekday(diary);
  assert.deepEqual(w.map((g) => [g.key, g.net]), [[2, 80], [3, 200]]);
});

test('filterRange', () => {
  const diary = [day('2026-09-21'), day('2026-08-01'), day('2026-01-05'), day('2025-12-31')];
  assert.equal(filterRange(diary, '30d', '2026-09-21').length, 1);
  assert.equal(filterRange(diary, '90d', '2026-09-21').length, 2);
  assert.equal(filterRange(diary, 'ytd', '2026-09-21').length, 3);
  assert.equal(filterRange(diary, 'all', '2026-09-21').length, 4);
});

test('position sizing', () => {
  assert.equal(riskBudget({ capital: 300000, risk_per_trade_pct: 1 }), 3000);
  assert.equal(suggestQty(100, 90, 3000), 300);
  assert.equal(suggestQty(100, 90, 3000, 75), 300);
  assert.equal(suggestQty(100, 96, 3000, 75), 750);
  assert.equal(suggestQty(100, 100, 3000), null);
});

test('day limits: loss limit, overtrading, stop not honoured, rules', () => {
  const cfg = { daily_max_loss: 1000, max_trades_per_day: 2 };
  const e = day('2026-09-01', [t({ pnl: -600, stop: 95 }), t({ pnl: -300 }), t({ pnl: -200 })], { rules_broken: [{ id: 'a', text: 'x' }] });
  const kinds = dayLimits(e, cfg).map((a) => a.kind);
  assert.deepEqual(kinds, ['bad', 'warn', 'bad', 'bad']);
  assert.deepEqual(dayLimits(day('2026-09-01', [t({ pnl: 100 })]), cfg), []);
});

import { ruleCompliance, complianceSeries, perRuleCompliance, balanceSeries, accountSummary } from '../../js/lib/stats.js';

test('rule compliance: tick-list, no-trade day = 100%, legacy rules_broken fallback', () => {
  const chk = [{ id: 'a', text: 'A', followed: true }, { id: 'b', text: 'B', followed: false }, { id: 'c', text: 'C', followed: true }];
  assert.deepEqual(ruleCompliance(day('2026-09-01', [t({ pnl: 1 })], { rules_check: chk })), { followed: 2, total: 3, pct: 2 / 3 });
  assert.deepEqual(ruleCompliance(day('2026-09-02', [], { rules_check: chk })), { followed: 3, total: 3, pct: 1 }); // no trades
  assert.deepEqual(ruleCompliance(day('2026-09-03', [t({ pnl: 1 })], { rules_broken: [{ id: 'a', text: 'A' }] }), 9), { followed: 8, total: 9, pct: 8 / 9 });
  assert.equal(ruleCompliance(day('2026-09-04', [t({ pnl: 1 })])), null);
  assert.deepEqual(ruleCompliance(day('2026-09-05', []), 0), { followed: 0, total: 0, pct: 1 });
});

test('compliance series is ascending and windowed', () => {
  const chk = [{ id: 'a', text: 'A', followed: false }];
  const diary = [day('2026-09-21', [t({ pnl: 1 })], { rules_check: chk }), day('2026-08-01', [t({ pnl: 1 })], { rules_check: chk }), day('2026-09-10', [])];
  const s = complianceSeries(diary, 30, '2026-09-21', 1);
  assert.deepEqual(s.map((x) => [x.date, x.pct]), [['2026-09-10', 1], ['2026-09-21', 0]]);
});

test('per-rule compliance', () => {
  const rules = [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }];
  const diary = [
    day('2026-09-01', [t({ pnl: 1 })], { rules_check: [{ id: 'a', text: 'A', followed: true }, { id: 'b', text: 'B', followed: false }] }),
    day('2026-09-02', []), // no trades → both followed
    day('2026-09-03', [t({ pnl: 1 })], { rules_broken: [{ id: 'b', text: 'B' }] }), // legacy: only B has information
  ];
  const per = perRuleCompliance(diary, rules);
  assert.deepEqual(per.map((r) => [r.id, r.followed, r.days]), [['a', 2, 2], ['b', 1, 3]]);
});

test('balance series: start capital + diary P&L, reported balances override and carry forward', () => {
  const cfg = { capital: 100000, start_date: '2026-09-01' };
  const diary = [day('2026-09-02', [t({ pnl: 500 })]), day('2026-09-03', [t({ pnl: -200 })]), day('2026-08-30', [t({ pnl: 9999 })])]; // Aug day ignored (before start)
  let s = balanceSeries(diary, [], cfg);
  assert.deepEqual(s.map((p) => [p.date, p.balance]), [['2026-09-01', 100000], ['2026-09-02', 100500], ['2026-09-03', 100300]]);
  s = balanceSeries(diary, [{ date: '2026-09-02', amount: 100450 }], cfg); // broker says 100450 (charges) → carry forward
  assert.deepEqual(s.map((p) => [p.date, p.balance, p.reported]), [['2026-09-01', 100000, false], ['2026-09-02', 100450, true], ['2026-09-03', 100250, false]]);
  const a = accountSummary(diary, [{ date: '2026-09-02', amount: 100450 }], cfg);
  assert.equal(a.balance, 100250); assert.equal(a.net, 250); assert.equal(a.returnPct, 0.0025);
});

test('new range codes', () => {
  const diary = [day('2026-09-21'), day('2026-09-16'), day('2026-08-25'), day('2026-07-01'), day('2025-10-01'), day('2025-09-01')];
  const n = (r) => filterRange(diary, r, '2026-09-21').length;
  assert.equal(n('today'), 1); assert.equal(n('1w'), 2); assert.equal(n('1m'), 3); assert.equal(n('3m'), 4); assert.equal(n('1y'), 5); assert.equal(n('all'), 6);
});
