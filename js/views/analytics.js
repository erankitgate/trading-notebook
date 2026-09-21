/* Analytics: headline KPIs, equity curve, daily bars, calendar, breakdowns. */

import { esc } from '../lib/dom.js';
import { money, cls, pct, rmult, niceDate, today, monthKey, monthLabel, DOW, plural, addDays } from '../lib/fmt.js';
import { summary, filterRange, equityCurve, bySetup, byUnderlying, byWeekday, byMonth, byWeek, mistakeTable, ruleBreakCounts, dayNet, RANGES } from '../lib/stats.js';
import { lineChart, barChart, calendar, bindCharts } from '../lib/charts.js';
import { S, settings } from '../state.js';
import { empty } from './shared.js';

const fmtPF = (pf) => (pf == null ? '–' : pf === Infinity ? '∞' : pf.toFixed(2));
const kpi = (label, value, detail = '', c = '') => `<div class="kpi"><small>${label}</small><b class="${c}">${value}</b>${detail ? `<span class="d">${detail}</span>` : ''}</div>`;

export function render(ctx) {
  ctx.setNav('analytics');
  const range = ctx.query.get('r') || '90d';
  const cal = ctx.query.get('m') || monthKey(S.diary[0]?.date || today());
  const cfg = settings();
  const diary = filterRange(S.diary, range), s = summary(diary, cfg);

  let h = `<div class="head-row"><div><h1>Analytics</h1><p class="sub">Numbers over ${plural(s.days, 'trading day')} and ${plural(s.trades, 'closed trade')}.</p></div>
    <div class="chips" role="group" aria-label="Date range">${RANGES.map(([v, l]) => `<a class="chip" href="#/analytics?r=${v}&m=${cal}" aria-pressed="${v === range}">${l}</a>`).join('')}</div></div>`;

  if (!diary.length) { ctx.app.innerHTML = h + `<div class="block">${empty('No diary days in this range yet.', '<a class="btn small" href="#/diary/new">Log a day</a>')}</div>`; return; }

  /* KPIs */
  h += `<div class="block kpis">
    ${kpi('Net P&amp;L', money(s.net, { compact: true }), s.charges ? `gross ${money(s.gross, { compact: true })} · charges ₹${s.charges.toLocaleString('en-IN')}` : '', cls(s.net))}
    ${kpi('Return on capital', s.returnPct != null ? pct(s.returnPct, 1) : '–', cfg.capital ? `on ₹${Number(cfg.capital).toLocaleString('en-IN')}` : 'set capital in Settings', s.returnPct != null ? cls(s.returnPct) : '')}
    ${kpi('Green days', `${s.greenDays} / ${s.days}`, `${pct(s.dayWinRate)} · avg day ${money(s.avgDay)}`)}
    ${kpi('Trade win rate', pct(s.winRate), `${s.wins} won · ${s.losses} lost`)}
    ${kpi('Profit factor', fmtPF(s.profitFactor), 'gross wins ÷ gross losses', s.profitFactor == null ? '' : s.profitFactor >= 1.5 ? 'pos' : s.profitFactor < 1 ? 'neg' : '')}
    ${kpi('Expectancy / trade', money(s.expectancy ?? 0), s.trades ? `avg win ${money(s.avgWin ?? 0)} · avg loss ${money(-(s.avgLoss ?? 0))}` : '', s.expectancy == null ? '' : cls(s.expectancy))}
    ${kpi('Avg R', rmult(s.avgR), s.rCount ? `${s.rCount} trades with a stop` : 'set a stop to get R', s.avgR == null ? '' : cls(s.avgR))}
    ${kpi('Max drawdown', s.maxDrawdown ? money(-s.maxDrawdown, { compact: true }) : '–', s.ddStart ? `${niceDate(s.ddStart, { day: 'numeric', month: 'short' })} → ${niceDate(s.ddEnd, { day: 'numeric', month: 'short' })}${s.maxDrawdownPct != null ? ` · ${pct(s.maxDrawdownPct, 1)}` : ''}` : '', s.maxDrawdown ? 'neg' : '')}
    ${kpi('Best day', s.best ? money(s.best.net) : '–', s.best ? niceDate(s.best.date) : '', 'pos')}
    ${kpi('Worst day', s.worst ? money(s.worst.net) : '–', s.worst ? niceDate(s.worst.date) : '', 'neg')}
    ${kpi('Trades / day', s.avgTradesPerDay ?? '–', cfg.max_trades_per_day ? `limit ${cfg.max_trades_per_day}` : '', s.avgTradesPerDay > (cfg.max_trades_per_day || 99) ? 'neg' : '')}
    ${kpi('Streaks', `${s.longestGreen}🟢 / ${s.longestRed}🔴`, `longest runs · now ${s.streak.n} ${s.streak.type || ''}`)}
  </div>`;

  /* discipline block */
  const p = s.plan, answered = p.yes + p.partly + p.no;
  h += `<div class="block"><h2>Discipline</h2><div class="kpis">
    ${kpi('Days with no rule broken', pct(s.discipline), `${s.daysWithBreaks} of ${s.days} days broke a rule`, s.discipline == null ? '' : s.discipline >= 0.8 ? 'pos' : 'neg')}
    ${kpi('Stop not honoured', s.overRisk, 'trades that lost > planned risk', s.overRisk ? 'neg' : 'pos')}
    ${kpi('Days with a repeated mistake', s.daysWithRepeat, '', s.daysWithRepeat ? 'neg' : 'pos')}
    ${kpi('Plan followed', answered ? `${p.yes} yes · ${p.partly} partly · ${p.no} no` : '–', answered ? `avg day: followed ${money(p.yes ? p.netYes / p.yes : 0)} vs not ${money(p.no ? p.netNo / p.no : 0)}` : 'answer “Did I follow the plan?” daily')}
  </div></div>`;

  /* equity + daily bars */
  const curve = equityCurve(diary);
  h += `<div class="chart-title"><h3>Equity curve (net, cumulative)</h3></div>${lineChart(curve, { label: 'Equity curve' })}`;
  const daily = curve.map((c) => ({ date: c.date, value: c.net, href: `#/diary/${c.date}` }));
  h += `<div class="chart-title"><h3>Daily net P&amp;L</h3><span class="legend"><span><i class="pos"></i>green day</span><span><i class="neg"></i>red day</span></span></div>${barChart(daily.slice(-60), { label: 'Daily P&L' })}`;

  /* calendar */
  const byDate = Object.fromEntries(S.diary.map((e) => [e.date, dayNet(e)]));
  const [cy, cm] = cal.split('-').map(Number);
  const prevM = `${cm === 1 ? cy - 1 : cy}-${String(cm === 1 ? 12 : cm - 1).padStart(2, '0')}`, nextM = `${cm === 12 ? cy + 1 : cy}-${String(cm === 12 ? 1 : cm + 1).padStart(2, '0')}`;
  const mNet = S.diary.filter((e) => monthKey(e.date) === cal).reduce((t, e) => t + dayNet(e), 0);
  h += `<div class="chart-title"><h3>${monthLabel(cal)} <span class="${cls(mNet)}">${money(mNet)}</span></h3><span class="cal-nav"><a class="chip" href="#/analytics?r=${range}&m=${prevM}">‹</a><a class="chip" href="#/analytics?r=${range}&m=${nextM}">›</a></span></div>${calendar(cal, byDate, { todayIso: today() })}`;

  /* breakdowns */
  const wd = byWeekday(diary).filter((g) => g.days);
  if (wd.length > 1) h += `<div class="chart-title"><h3>Average day by weekday</h3></div>${barChart(wd.map((g) => ({ label: DOW[g.key], value: g.avg, days: g.days })), { labelKey: 'label', height: 160, label: 'Average by weekday', fmtLabel: (it) => `${it.label} (${plural(it.days, 'day')})` })}`;

  const table = (title, rows, cols) => `<div class="block"><h2>${title}</h2><div class="table-wrap"><table><thead><tr>${cols.map((c) => `<th class="${c.r ? 'r' : ''}">${c.h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td class="${c.r ? 'r' : ''}">${c.v(r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
  const setups = bySetup(diary).filter((g) => g.trades);
  if (setups.length) h += table('By setup', setups, [{ h: 'Setup', v: (g) => esc(g.label) }, { h: 'Trades', r: 1, v: (g) => g.trades }, { h: 'Win rate', r: 1, v: (g) => pct(g.winRate) }, { h: 'Avg R', r: 1, v: (g) => `<span class="${g.avgR == null ? '' : cls(g.avgR)}">${rmult(g.avgR)}</span>` }, { h: 'Net', r: 1, v: (g) => `<span class="${cls(g.net)}">${money(g.net)}</span>` }]);
  const und = byUnderlying(diary).filter((g) => g.trades);
  if (und.length > 1) h += table('By underlying', und, [{ h: 'Underlying', v: (g) => esc(g.label) }, { h: 'Trades', r: 1, v: (g) => g.trades }, { h: 'Win rate', r: 1, v: (g) => pct(g.winRate) }, { h: 'Avg R', r: 1, v: (g) => rmult(g.avgR) }, { h: 'Net', r: 1, v: (g) => `<span class="${cls(g.net)}">${money(g.net)}</span>` }]);
  const mt = mistakeTable(diary);
  if (mt.length) h += table('Mistakes, ranked', mt, [{ h: 'Mistake', v: (m) => `${esc(m.tag)}${m.count >= 2 ? ' <span class="mini-flag">repeat</span>' : ''}` }, { h: 'Days', r: 1, v: (m) => m.count }, { h: 'Last', r: 1, v: (m) => niceDate(m.dates[0], { day: 'numeric', month: 'short' }) }, { h: 'Net on those days', r: 1, v: (m) => `<span class="${cls(m.net)}">${money(m.net)}</span>` }]);
  const rb = Object.values(ruleBreakCounts(diary)).sort((a, b) => b.count - a.count);
  if (rb.length) h += table('Rules broken', rb, [{ h: 'Rule', v: (r) => esc(r.text) }, { h: 'Times', r: 1, v: (r) => r.count }, { h: 'Last', r: 1, v: (r) => niceDate(r.dates[0], { day: 'numeric', month: 'short' }) }]);
  const weeks = byWeek(diary).slice(0, 12);
  if (weeks.length > 1) h += table('By week', weeks, [{ h: 'Week of', v: (w) => `<a href="#/reviews/${w.key}">${niceDate(w.key, { day: 'numeric', month: 'short' })}</a>` }, { h: 'Days', r: 1, v: (w) => w.days }, { h: 'Trades', r: 1, v: (w) => w.trades }, { h: 'Net', r: 1, v: (w) => `<span class="${cls(w.net)}">${money(w.net)}</span>` }]);
  const months = byMonth(diary);
  if (months.length > 1) h += table('By month', months, [{ h: 'Month', v: (m) => monthLabel(m.key) }, { h: 'Days', r: 1, v: (m) => `${m.green}/${m.days} green` }, { h: 'Net', r: 1, v: (m) => `<span class="${cls(m.net)}">${money(m.net)}</span>` }]);

  ctx.app.innerHTML = h;
  bindCharts(ctx.app);
}
