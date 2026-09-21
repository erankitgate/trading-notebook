import { test } from 'node:test';
import assert from 'node:assert/strict';
import { money, pct, rmult, weekStart, addDays, underlying, lines, num, monthLabel, today } from '../../js/lib/fmt.js';
import { niceTicks } from '../../js/lib/charts.js';
import { esc } from '../../js/lib/dom.js';

test('money formats in Indian style with sign', () => {
  assert.equal(money(1250), '+₹1,250');
  assert.equal(money(-300.5), '-₹300.5');
  assert.equal(money(0), '+₹0');
  assert.equal(money(250000, { compact: true }), '+₹2.50L');
  assert.equal(money(-15000000, { compact: true }), '-₹1.50Cr');
  assert.equal(money(500, { sign: false }), '₹500');
});
test('pct / rmult', () => {
  assert.equal(pct(0.4), '40%'); assert.equal(pct(null), '–'); assert.equal(pct(0.1234, 1), '12.3%');
  assert.equal(rmult(1.5), '+1.50R'); assert.equal(rmult(-0.5), '-0.50R'); assert.equal(rmult(null), '–');
});
test('dates', () => {
  assert.equal(weekStart('2026-09-21'), '2026-09-21'); // Monday
  assert.equal(weekStart('2026-09-27'), '2026-09-21'); // Sunday
  assert.equal(addDays('2026-08-31', 1), '2026-09-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.match(today(), /^\d{4}-\d{2}-\d{2}$/);
  assert.match(monthLabel('2026-09'), /September 2026/);
});
test('underlying', () => {
  assert.equal(underlying('NIFTY 25000 CE 25 Sep'), 'NIFTY');
  assert.equal(underlying('Laurus 1900 PE'), 'LAURUS');
  assert.equal(underlying(''), '');
});
test('lines / num', () => {
  assert.deepEqual(lines(' a \n\n b\n'), ['a', 'b']);
  assert.equal(num(''), null); assert.equal(num('1.5'), 1.5); assert.equal(num('x'), null); assert.equal(num(0), 0);
});
test('esc escapes html', () => { assert.equal(esc('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;'); assert.equal(esc(null), ''); });
test('niceTicks includes zero and clean steps', () => {
  const { ticks } = niceTicks(-1200, 3400);
  assert.ok(ticks.includes(0)); assert.ok(ticks[0] <= -1200); assert.ok(ticks[ticks.length - 1] >= 3400); assert.ok(ticks.length <= 7);
  assert.ok(niceTicks(0, 0).ticks.length >= 2);
});
