/* Front page: account hero, red box, today's risk strip, range stats, rules compliance, market teaser, plan, index. */

import { esc, toast, busy } from '../lib/dom.js';
import { money, cls, pct, rmult, niceDate, today, plural, num, arr } from '../lib/fmt.js';
import { summary, filterRange, equityCurve, dayNet, dayTrades, dayLimits, accountSummary, complianceSeries, perRuleCompliance, RANGES, ruleCompliance } from '../lib/stats.js';
import { sparkline, barChart, lineChart, bindCharts, PCT_DOMAIN } from '../lib/charts.js';
import { explain } from '../api.js';
import { S, settings, entryByDate, activeRules } from '../state.js';
import { dayGross, dayCharges } from '../lib/stats.js';
import { diaryList, flagsHtml, bindFlags, planHtml, alertsHtml } from './shared.js';
import { briefTeaser } from './market.js';
import * as live from './live.js';
import * as gate from './checklistGate.js';

const fmtPF = (pf) => (pf == null ? '–' : pf === Infinity ? '∞' : pf.toFixed(2));
const tile = (label, value, detail = '', tone = '') => `<div class="stat ${tone}"><small>${label}</small><b>${value}</b>${detail ? `<span class="d">${detail}</span>` : ''}</div>`;
const pctTone = (p) => (p == null ? '' : p >= 0.8 ? 'good' : p >= 0.5 ? 'warn' : 'bad');
const barCls = (p) => (p >= 80 ? 'ok' : p >= 50 ? 'mid' : 'low');

export function render(ctx) {
  ctx.setNav('home');
  const cfg = settings(), t = today(), todayEntry = entryByDate(t);
  const range = ctx.query.get('r') || '1m';
  const acct = accountSummary(S.diary, S.capital, cfg);
  const inRange = filterRange(S.diary, range), s = summary(inRange, cfg), sAll = summary(S.diary, cfg);
  const rules = activeRules();
  const comp = complianceSeries(S.diary, 30, t, rules.length);
  const compAvg = comp.length ? comp.reduce((a, c) => a + c.pct, 0) / comp.length : null;
  const latest = S.diary[0];

  let h = `<div class="head-row"><div><h1>My Trading Notebook</h1><p class="sub">Every trade, every rule, every lesson — one page per day.</p></div>
    <a class="btn" id="logTradeBtn" href="${todayEntry ? `#/diary/${t}` : '#/diary/new'}">${todayEntry ? "Open today's page" : "+ Log today's trades"}</a></div>`;
  h += '<div id="gateBox"></div>';

  /* account hero */
  const bal = acct.balance, since = acct.startDate ? niceDate(acct.startDate, { day: 'numeric', month: 'short', year: 'numeric' }) : null;
  h += `<section class="hero" aria-label="Account"><div>
      <div class="lbl">Account balance</div>
      <div class="bal num">${bal != null ? money(bal, { sign: false }) : '—'}</div>
      ${acct.net != null ? `<div class="delta ${cls(acct.net)} num">${money(acct.net)} · ${pct(acct.returnPct, 2)} since ${since || 'start'}</div>` : '<div class="delta">Set your capital in Settings</div>'}
      <div class="meta">Starting capital ${acct.start != null ? money(acct.start, { sign: false }) : '—'}${since ? ` on ${since}` : ''}${acct.lastReported ? ` · last reported ${niceDate(acct.lastReported.date, { day: 'numeric', month: 'short' })}` : ''}</div>
      ${acct.series.length > 1 ? sparkline(acct.series.map((p) => p.balance), { w: 220, h: 36 }) : ''}
    </div><div class="side">
      <div><small>Today</small><b class="${todayEntry ? cls(dayNet(todayEntry)) : ''} num">${todayEntry ? money(dayNet(todayEntry)) : '—'}</b></div>
      <div><small>Rules followed · 30 days</small><b class="${compAvg == null ? '' : compAvg >= 0.8 ? 'pos' : compAvg >= 0.5 ? 'warn' : 'neg'}">${pct(compAvg)}</b></div>
      <form id="balForm"><input name="amount" type="number" step="any" inputmode="decimal" placeholder="Today's balance ₹" aria-label="Today's account balance"><button class="btn small" type="submit">Update</button></form>
    </div></section>`;

  h += '<section class="block live-panel" id="livePanel" aria-label="Live market"></section>';
  /* prominent balance progress chart */
  if (acct.series.length > 1) {
    h += `<div class="balance-card"><div class="section-head"><h2>Balance progress</h2><span class="${cls(acct.net || 0)}">${acct.net != null ? `${money(acct.net)} (${pct(acct.returnPct, 2)})` : ''} since ${since || 'start'}</span></div>
      ${lineChart(acct.series.map((p) => ({ date: p.date, balance: p.balance, tip: `${niceDate(p.date)}: ${money(p.balance, { sign: false })}${p.reported ? ' (reported)' : ''}` })), { valueKey: 'balance', label: 'Account balance', zero: false, fmtValue: (v, o) => money(v, { sign: false, ...(o || {}) }) })}</div>`;
  }

  h += flagsHtml();

  /* today strip */
  h += '<div class="today">';
  if (todayEntry) {
    const net = dayNet(todayEntry), n = dayTrades(todayEntry).length, maxLoss = num(cfg.daily_max_loss), maxT = num(cfg.max_trades_per_day), rc = ruleCompliance(todayEntry, rules.length);
    h += `<div class="row"><b>Today · ${niceDate(t)}</b><b class="${cls(net)} num">${money(net)}</b></div>`;
    if (maxLoss) { const used = net < 0 ? Math.min(1, -net / maxLoss) : 0; h += `<div class="row small muted"><span>Loss budget used</span><span>${money(Math.min(0, net), { sign: false })} of ₹${maxLoss.toLocaleString('en-IN')}</span></div><div class="meter ${used >= 1 ? 'bad' : used >= 0.7 ? 'warn' : ''}"><i style="width:${Math.round(used * 100)}%"></i></div>`; }
    h += `<div class="row small muted"><span>Trades ${n}${maxT ? ` of ${maxT}` : ''}</span>${rc ? `<span>Rules ${rc.followed}/${rc.total} followed</span>` : ''}</div>`;
    h += alertsHtml(dayLimits(todayEntry, cfg));
  } else {
    h += `<div class="row"><b>Today · ${niceDate(t)}</b><span class="muted small">No page yet</span></div>`;
    h += `<div class="small muted">Limits: ${num(cfg.daily_max_loss) ? `max loss ₹${num(cfg.daily_max_loss).toLocaleString('en-IN')} · ` : ''}${num(cfg.max_trades_per_day) ? `max ${plural(num(cfg.max_trades_per_day), 'trade')}` : ''}${rules.length ? ` · ${rules.length} rules` : ''}</div>`;
  }
  if (sAll.streak.n >= 2) h += `<div class="streak ${sAll.streak.type === 'green' ? 'pos' : 'neg'}">${sAll.streak.n} ${sAll.streak.type} days in a row${sAll.streak.type === 'red' && sAll.streak.n >= 3 ? ' — consider half size today' : ''}</div>`;
  h += '</div>';

  /* range stats */
  h += `<div class="ranges"><span class="lbl">P&amp;L</span>${RANGES.map(([v, l]) => `<a class="chip accent" href="#/?r=${v}" aria-pressed="${v === range}">${l}</a>`).join('')}</div>`;
  const curve = equityCurve(inRange).map((p) => p.cum);
  h += `<div class="stats">
    ${tile(`Net P&amp;L · ${RANGES.find((r) => r[0] === range)?.[1] || range}`, `<span class="${cls(s.net)} num">${money(s.net, { compact: true })}</span>`, s.charges ? `gross ${money(s.gross, { compact: true })} · charges ₹${s.charges.toLocaleString('en-IN')}` : plural(s.days, 'day'), s.days ? (s.net >= 0 ? 'good' : 'bad') : '')}
    ${tile('Green days', `${s.greenDays}${s.days ? ` / ${s.days}` : ''}`, s.dayWinRate != null ? `${pct(s.dayWinRate)} · avg ${money(s.avgDay)}` : 'no days yet', pctTone(s.dayWinRate))}
    ${tile('Win rate · trades', pct(s.winRate), s.trades ? `${s.wins} won · ${s.losses} lost · PF ${fmtPF(s.profitFactor)}` : 'no closed trades', pctTone(s.winRate))}
    ${tile('Avg R per trade', `<span class="${s.avgR == null ? '' : cls(s.avgR)}">${rmult(s.avgR)}</span>`, s.rCount ? `${s.rCount} with a stop set` : 'set stops to see R', s.avgR == null ? '' : s.avgR > 0 ? 'good' : 'bad')}
    ${tile('Expectancy / trade', `<span class="${s.expectancy == null ? '' : cls(s.expectancy)}">${money(s.expectancy ?? 0)}</span>`, s.trades ? `avg win ${money(s.avgWin ?? 0)} · loss ${money(-(s.avgLoss ?? 0))}` : '', s.expectancy == null ? '' : s.expectancy >= 0 ? 'good' : 'bad')}
    ${tile('Max drawdown', `<span class="${s.maxDrawdown ? 'neg' : ''}">${s.maxDrawdown ? money(-s.maxDrawdown, { compact: true }) : '–'}</span>`, s.maxDrawdownPct != null ? `${pct(s.maxDrawdownPct, 1)} of capital` : '', s.maxDrawdown ? 'bad' : '')}
    ${tile('Discipline', `<span class="${pctTone(s.discipline) === 'good' ? 'pos' : pctTone(s.discipline) === 'bad' ? 'neg' : ''}">${pct(s.discipline)}</span>`, 'days with no rule broken', pctTone(s.discipline))}
    ${tile('Cumulative', curve.length > 1 ? sparkline(curve, { w: 130, h: 34 }) : '–', 'equity in range', 'info')}
  </div>`;

  /* rules compliance */
  h += `<div class="block"><div class="section-head"><h2>Rules followed — last 30 days</h2>${compAvg != null ? `<span class="big ${compAvg >= 0.8 ? 'pos' : compAvg >= 0.5 ? 'warn' : 'neg'}">${pct(compAvg)}</span>` : ''}</div>`;
  if (comp.length) {
    h += barChart(comp.map((c) => ({ date: c.date, value: Math.round(c.pct * 100), cls: barCls(c.pct * 100), href: `#/diary/${c.date}`, tip: `${niceDate(c.date)}: ${c.followed}/${c.total} rules · ${Math.round(c.pct * 100)}%` })), { height: 170, label: 'Rules followed per day', domain: PCT_DOMAIN });
    h += '<p class="small muted">100% = every rule followed, or no trade taken that day. Tick the rules on each diary page.</p>';
  } else h += '<p class="sub small">Tick the rules you followed on each diary page and the bars appear here. A day with no trade counts as 100%.</p>';
  if (rules.length) {
    const per = perRuleCompliance(filterRange(S.diary, '1m'), rules);
    h += `<ol class="rulelist">${per.map((r, i) => `<li><span class="n">${i + 1}</span><span>${esc(r.text)}<div class="bar"><i class="${r.pct == null ? '' : barCls(r.pct * 100)}" style="width:${r.pct == null ? 0 : Math.round(r.pct * 100)}%"></i></div></span><span class="pct ${r.pct == null ? 'muted' : r.pct >= 0.8 ? 'pos' : r.pct >= 0.5 ? 'warn' : 'neg'}">${r.pct == null ? '—' : pct(r.pct)}</span></li>`).join('')}</ol>`;
  } else h += '<p class="small"><a href="#/playbook">Add your rules in the Playbook</a> to start tracking them.</p>';
  h += '</div>';

  /* market teaser: tomorrow/today's analysis */
  if (S.briefs.length) h += `<div class="block">${briefTeaser(S.briefs[0])}</div>`;

  /* yesterday recap */
  const prevDay = S.diary.find((e) => e.date < t);
  if (prevDay) { const gross = dayGross(prevDay), ch = dayCharges(prevDay), net = dayNet(prevDay); h += `<div class="block"><div class="section-head"><h2>Yesterday's recap — ${niceDate(prevDay.date, { weekday: 'short', day: 'numeric', month: 'short' })}</h2><span class="big ${cls(net)}">${money(net)}</span></div>
    ${prevDay.title ? `<p class="sub small">${esc(prevDay.title)}</p>` : ''}
    <div class="mini">${ch ? `<span>gross <b class="num">${money(gross)}</b></span>` : ''}<span>${plural(dayTrades(prevDay).length, 'trade')}</span><span>${plural(arr(prevDay.mistakes).length, 'mistake')}</span><span>${plural(arr(prevDay.rules_broken).length, 'rule')} broken</span></div>
    <a class="btn small ghost mt" href="#/diary/${esc(prevDay.date)}">Open that day</a></div>`; }

  /* plan for next session */
  if (latest && (arr(latest.next_day_strategy).length || arr(latest.watchlist).length)) h += `<div class="block"><h2>Plan for next session</h2>${planHtml(latest)}</div>`;

  /* index */
  h += `<div class="block"><h2>Index</h2><ol class="toc">
    <li><a href="#/diary"><span class="n">1</span><span><span class="t">Daily trade diary</span><span class="d">Trades, rules, mistakes, yesterday's plan and tomorrow's strategy</span></span><span class="c">${plural(S.diary.length, 'day')}</span></a></li>
    <li><a href="#/market"><span class="n">2</span><span><span class="t">Market brief</span><span class="d">Nifty levels, global cues, all 50 stocks, plan for the next session</span></span><span class="c">${S.briefs.length ? niceDate(S.briefs[0].date, { day: 'numeric', month: 'short' }) : 'none yet'}</span></a></li>
    <li><a href="#/analytics"><span class="n">3</span><span><span class="t">Analytics</span><span class="d">Balance curve, win rate, R-multiples, drawdown, by setup and weekday</span></span><span class="c">${plural(sAll.trades, 'trade')}</span></a></li>
    <li><a href="#/playbook"><span class="n">4</span><span><span class="t">Playbook &amp; rules</span><span class="d">Your setups with their stats, and the rules you tick every day</span></span><span class="c">${S.setups.filter((x) => x.active !== false).length} setups · ${rules.length} rules</span></a></li>
    <li><a href="#/learn"><span class="n">5</span><span><span class="t">Daily learning</span><span class="d">New things learned, with links to the full guides</span></span><span class="c">${plural(S.learn.length, 'note')}</span></a></li>
    <li><a href="#/reviews"><span class="n">6</span><span><span class="t">Weekly reviews</span><span class="d">What worked, what didn't, the one thing to fix next week</span></span><span class="c">${plural(S.reviews.length, 'review')}</span></a></li>
  </ol></div>`;

  if (S.diary.length) h += `<div class="block"><h2>Recent days</h2>${diaryList(S.diary.slice(0, 5))}</div>`;
  else h += '<div class="block empty-box"><strong>Your notebook is empty.</strong> Start with <a href="#/settings">Settings</a>, add your <a href="#/playbook">rules and setups</a>, then log your first day.</div>';

  ctx.app.innerHTML = h;
  gate.mount(ctx.app.querySelector('#gateBox'), t);
  bindFlags(ctx.app, ctx);
  bindCharts(ctx.app);
  live.mount(ctx.app.querySelector('#livePanel'), ctx, { date: S.briefs[0] && S.briefs[0].date >= t ? S.briefs[0].date : t, compact: true });
  if (!todayEntry) { const btn = ctx.app.querySelector('#logTradeBtn'); btn.onclick = (ev) => { if (!gate.requireChecklist(t)) ev.preventDefault(); }; }
  const bf = ctx.app.querySelector('#balForm');
  bf.onsubmit = (ev) => {
    ev.preventDefault();
    const amount = num(bf.amount.value); if (amount == null || amount <= 0) { toast('Enter today\'s balance in rupees', 'bad'); bf.amount.focus(); return; }
    busy(bf.querySelector('button'), '…', async () => {
      try { await ctx.api.logBalance({ date: t, amount }, S.user.id); toast('Balance updated'); ctx.reload(); } catch (e) { toast(explain(e), 'bad'); }
    });
  };
}
