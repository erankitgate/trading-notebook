/* Trading statistics. Pure functions over diary rows; no DOM, no I/O.
   A "day" is one diary_entries row. A trade is closed when it has a P&L. */

import { arr, key, num, round2, weekday, weekStart, monthKey, underlying, today, addDays } from './fmt.js';

/* ---------- per-trade ---------- */
export const tradePnl = (t) => (t.pnl == null ? null : Number(t.pnl) || 0);
export const isClosed = (t) => tradePnl(t) != null;

/** Planned rupee risk: explicit `risk`, else |entry − stop| × qty. */
export function tradeRisk(t) {
  const r = num(t.risk); if (r != null && r > 0) return r;
  const entry = num(t.entry), stop = num(t.stop), qty = num(t.qty);
  if (entry == null || stop == null || qty == null || qty === 0) return null;
  const risk = Math.abs(entry - stop) * Math.abs(qty);
  return risk > 0 ? round2(risk) : null;
}
/** R-multiple: P&L ÷ planned risk. Null when either is unknown. */
export function tradeR(t) {
  const risk = tradeRisk(t), pnl = tradePnl(t);
  return risk && pnl != null ? round2(pnl / risk) : null;
}
/** Planned reward:risk from entry/stop/target. */
export function tradeRR(t) {
  const entry = num(t.entry), stop = num(t.stop), target = num(t.target);
  if (entry == null || stop == null || target == null || entry === stop) return null;
  return round2(Math.abs(target - entry) / Math.abs(entry - stop));
}
/** Auto P&L when the user leaves it blank: (exit − entry) × qty for Buy, reversed for Sell. */
export function autoPnl(t) {
  const entry = num(t.entry), exit = num(t.exit), qty = num(t.qty);
  if (entry == null || exit == null || qty == null) return null;
  return round2((key(t.side) === 'sell' ? entry - exit : exit - entry) * qty);
}

/* ---------- per-day ---------- */
export const dayTrades = (e) => arr(e.trades);
export const dayGross = (e) => dayTrades(e).reduce((s, t) => s + (tradePnl(t) ?? 0), 0);
export const dayCharges = (e) => Number(e.charges) || 0;
export const dayNet = (e) => round2(dayGross(e) - dayCharges(e));
export const sortAsc = (diary) => [...diary].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
export const sortDesc = (diary) => sortAsc(diary).reverse();

/* ---------- mistakes & rules ---------- */
/** { key: { tag, count, dates(desc) } } — a mistake counts once per day. */
export function mistakeCounts(diary) {
  const m = {};
  for (const e of sortDesc(diary)) {
    const seen = new Set();
    for (const x of arr(e.mistakes)) {
      const k = key(x.tag); if (!k || seen.has(k)) continue; seen.add(k);
      (m[k] ||= { tag: x.tag, count: 0, dates: [] });
      m[k].count++; m[k].dates.push(e.date);
    }
  }
  return m;
}
export const repeatedMistakes = (diary) => Object.values(mistakeCounts(diary)).filter((x) => x.count >= 2).sort((a, b) => b.count - a.count || (a.dates[0] < b.dates[0] ? 1 : -1));
export function hasRepeatedMistake(e, counts) { return arr(e.mistakes).some((x) => counts[key(x.tag)]?.count >= 2); }

/** { key: { text, count, dates(desc) } } for rules broken, optionally since a date. */
export function ruleBreakCounts(diary, since) {
  const m = {};
  for (const e of sortDesc(diary)) {
    if (since && e.date < since) continue;
    const seen = new Set();
    for (const r of arr(e.rules_broken)) {
      const text = typeof r === 'string' ? r : r?.text; const k = key(text); if (!k || seen.has(k)) continue; seen.add(k);
      (m[k] ||= { text, count: 0, dates: [] });
      m[k].count++; m[k].dates.push(e.date);
    }
  }
  return m;
}

/* ---------- ranges ---------- */
export const RANGES = [['30d', 'Last 30 days'], ['90d', 'Last 90 days'], ['ytd', 'This year'], ['all', 'All time']];
export function filterRange(diary, range, ref = today()) {
  if (!range || range === 'all') return diary;
  const from = range === 'ytd' ? `${ref.slice(0, 4)}-01-01` : range === 'month' ? `${ref.slice(0, 7)}-01` : addDays(ref, -(parseInt(range, 10) - 1));
  return diary.filter((e) => e.date >= from && e.date <= ref);
}

/* ---------- headline summary ---------- */
export function summary(diary, settings = {}) {
  const days = sortAsc(diary);
  const nets = days.map(dayNet);
  const net = round2(nets.reduce((s, n) => s + n, 0));
  const gross = round2(days.reduce((s, e) => s + dayGross(e), 0));
  const charges = round2(days.reduce((s, e) => s + dayCharges(e), 0));
  const greenDays = nets.filter((n) => n > 0).length, redDays = nets.filter((n) => n < 0).length;

  const trades = days.flatMap(dayTrades).filter(isClosed);
  const wins = trades.filter((t) => tradePnl(t) > 0), losses = trades.filter((t) => tradePnl(t) < 0);
  const sum = (xs) => xs.reduce((s, t) => s + tradePnl(t), 0);
  const grossWin = sum(wins), grossLoss = Math.abs(sum(losses));
  const rs = trades.map(tradeR).filter((r) => r != null);
  const overRisk = trades.filter((t) => { const r = tradeRisk(t); return r && tradePnl(t) < -r * 1.1; }).length;

  // streaks over days
  let cur = { type: null, n: 0 }, longestGreen = 0, longestRed = 0;
  for (const n of nets) {
    const type = n > 0 ? 'green' : n < 0 ? 'red' : null;
    if (type && type === cur.type) cur.n++; else cur = { type, n: type ? 1 : 0 };
    if (cur.type === 'green') longestGreen = Math.max(longestGreen, cur.n);
    if (cur.type === 'red') longestRed = Math.max(longestRed, cur.n);
  }

  // drawdown on the cumulative net curve
  let peak = 0, cum = 0, maxDD = 0, ddStart = null, ddEnd = null, peakDate = null;
  for (const e of days) {
    cum = round2(cum + dayNet(e));
    if (cum >= peak) { peak = cum; peakDate = e.date; }
    const dd = round2(peak - cum);
    if (dd > maxDD) { maxDD = dd; ddStart = peakDate; ddEnd = e.date; }
  }

  // plan adherence
  const plan = { yes: 0, partly: 0, no: 0, netYes: 0, netNo: 0, netPartly: 0 };
  for (const e of days) { if (e.plan_followed in plan) { plan[e.plan_followed]++; plan[`net${cap(e.plan_followed)}`] = round2(plan[`net${cap(e.plan_followed)}`] + dayNet(e)); } }
  const daysWithBreaks = days.filter((e) => arr(e.rules_broken).length).length;
  const mc = mistakeCounts(days);
  const daysWithRepeat = days.filter((e) => hasRepeatedMistake(e, mc)).length;

  let best = null, worst = null;
  days.forEach((e, i) => { const n = nets[i]; if (!best || n > best.net) best = { date: e.date, net: n }; if (!worst || n < worst.net) worst = { date: e.date, net: n }; });

  const capital = num(settings.capital);
  return {
    days: days.length, net, gross, charges, greenDays, redDays, flatDays: days.length - greenDays - redDays,
    dayWinRate: days.length ? greenDays / days.length : null,
    avgDay: days.length ? round2(net / days.length) : null,
    trades: trades.length, wins: wins.length, losses: losses.length,
    winRate: trades.length ? wins.length / trades.length : null,
    avgWin: wins.length ? round2(grossWin / wins.length) : null,
    avgLoss: losses.length ? round2(grossLoss / losses.length) : null,
    profitFactor: grossLoss > 0 ? round2(grossWin / grossLoss) : wins.length ? Infinity : null,
    expectancy: trades.length ? round2(sum(trades) / trades.length) : null,
    avgR: rs.length ? round2(rs.reduce((s, r) => s + r, 0) / rs.length) : null, rCount: rs.length,
    overRisk,
    avgTradesPerDay: days.length ? round2(trades.length / days.length) : null,
    maxDrawdown: maxDD, ddStart, ddEnd, maxDrawdownPct: capital ? maxDD / capital : null,
    returnPct: capital ? net / capital : null,
    best, worst, streak: cur, longestGreen, longestRed,
    plan, daysWithBreaks, daysWithRepeat,
    discipline: days.length ? 1 - daysWithBreaks / days.length : null,
  };
}
const cap = (s) => s[0].toUpperCase() + s.slice(1);

/* ---------- series & breakdowns ---------- */
/** Ascending [{ date, net, cum, peak, dd }]. */
export function equityCurve(diary) {
  let cum = 0, peak = 0;
  return sortAsc(diary).map((e) => {
    const net = dayNet(e); cum = round2(cum + net); peak = Math.max(peak, cum);
    return { date: e.date, net, cum, peak, dd: round2(peak - cum) };
  });
}

function groupBy(items, keyFn, labelFn = (k) => k) {
  const m = new Map();
  for (const it of items) { const k = keyFn(it); if (k == null) continue; if (!m.has(k)) m.set(k, { key: k, label: labelFn(k), items: [] }); m.get(k).items.push(it); }
  return [...m.values()];
}
function tradeStats(trades) {
  const closed = trades.filter(isClosed);
  const wins = closed.filter((t) => tradePnl(t) > 0);
  const rs = closed.map(tradeR).filter((r) => r != null);
  return {
    trades: closed.length, wins: wins.length, winRate: closed.length ? wins.length / closed.length : null,
    net: round2(closed.reduce((s, t) => s + tradePnl(t), 0)),
    avgR: rs.length ? round2(rs.reduce((s, r) => s + r, 0) / rs.length) : null,
  };
}
/** Per setup name (unlabelled trades grouped as "No setup"). */
export function bySetup(diary) {
  const trades = diary.flatMap((e) => dayTrades(e).map((t) => ({ ...t, _date: e.date })));
  return groupBy(trades, (t) => key(t.setup) || '(no setup)', (k) => (k === '(no setup)' ? 'No setup' : trades.find((t) => key(t.setup) === k).setup))
    .map((g) => ({ ...g, ...tradeStats(g.items) })).sort((a, b) => b.trades - a.trades);
}
export function byUnderlying(diary) {
  const trades = diary.flatMap(dayTrades);
  return groupBy(trades, (t) => underlying(t.instrument) || null).map((g) => ({ ...g, ...tradeStats(g.items) })).sort((a, b) => b.trades - a.trades);
}
export function byWeekday(diary) {
  return groupBy(diary, (e) => weekday(e.date)).map((g) => ({ ...g, days: g.items.length, net: round2(g.items.reduce((s, e) => s + dayNet(e), 0)) }))
    .map((g) => ({ ...g, avg: round2(g.net / g.days) })).sort((a, b) => a.key - b.key);
}
export function byMonth(diary) {
  return groupBy(diary, (e) => monthKey(e.date)).map((g) => ({ ...g, days: g.items.length, green: g.items.filter((e) => dayNet(e) > 0).length, net: round2(g.items.reduce((s, e) => s + dayNet(e), 0)) })).sort((a, b) => (a.key < b.key ? 1 : -1));
}
export function byWeek(diary) {
  return groupBy(diary, (e) => weekStart(e.date)).map((g) => ({ ...g, days: g.items.length, trades: g.items.flatMap(dayTrades).filter(isClosed).length, net: round2(g.items.reduce((s, e) => s + dayNet(e), 0)) })).sort((a, b) => (a.key < b.key ? 1 : -1));
}
/** Mistake tags ranked by frequency with the net P&L on days they occurred. */
export function mistakeTable(diary) {
  const mc = mistakeCounts(diary);
  return Object.values(mc).map((m) => ({ ...m, net: round2(diary.filter((e) => m.dates.includes(e.date)).reduce((s, e) => s + dayNet(e), 0)) })).sort((a, b) => b.count - a.count);
}

/* ---------- risk helpers ---------- */
/** Suggested quantity for a given entry/stop and rupee risk budget. */
export function suggestQty(entry, stop, riskBudget, lot = 1) {
  entry = num(entry); stop = num(stop); riskBudget = num(riskBudget);
  if (entry == null || stop == null || !riskBudget || entry === stop) return null;
  const perUnit = Math.abs(entry - stop);
  const q = Math.floor(riskBudget / perUnit / lot) * lot;
  return q > 0 ? q : 0;
}
export const riskBudget = (settings) => { const c = num(settings?.capital), p = num(settings?.risk_per_trade_pct); return c && p ? round2((c * p) / 100) : null; };

/** Status of a day against the limits in settings. */
export function dayLimits(e, settings) {
  const out = [];
  const net = dayNet(e), n = dayTrades(e).length;
  const maxLoss = num(settings?.daily_max_loss), maxTrades = num(settings?.max_trades_per_day);
  if (maxLoss && net <= -maxLoss) out.push({ kind: 'bad', text: `Daily loss limit hit: ${net} vs −${maxLoss}` });
  else if (maxLoss && net <= -maxLoss * 0.7) out.push({ kind: 'warn', text: `Within 30% of the daily loss limit (−${maxLoss})` });
  if (maxTrades && n > maxTrades) out.push({ kind: 'warn', text: `${n} trades taken, limit is ${maxTrades} — overtrading?` });
  const over = dayTrades(e).filter((t) => { const r = tradeRisk(t); return r && tradePnl(t) < -r * 1.1; });
  if (over.length) out.push({ kind: 'bad', text: `${over.length} trade${over.length > 1 ? 's' : ''} lost more than the planned risk — stop not honoured` });
  if (arr(e.rules_broken).length) out.push({ kind: 'bad', text: `${arr(e.rules_broken).length} rule${arr(e.rules_broken).length > 1 ? 's' : ''} broken` });
  return out;
}
