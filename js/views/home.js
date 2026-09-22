/* Front page: a dashboard, not a dump — quick status + links to the full pages that hold the detail. */

import { esc, toast, busy } from '../lib/dom.js';
import { money, cls, pct, niceDate, today, plural, num, arr } from '../lib/fmt.js';
import { summary, filterRange, dayNet, dayTrades, dayGross, dayCharges, dayLimits, accountSummary, complianceSeries, ruleCompliance } from '../lib/stats.js';
import { sparkline, bindCharts } from '../lib/charts.js';
import { explain } from '../api.js';
import { S, settings, entryByDate, activeRules } from '../state.js';
import { diaryList, flagsHtml, bindFlags, planHtml, alertsHtml } from './shared.js';
import { briefTeaser } from './market.js';
import * as live from './live.js';
import * as gate from './checklistGate.js';

const fmtPF = (pf) => (pf == null ? '–' : pf === Infinity ? '∞' : pf.toFixed(2));
const miniStat = (label, value, tone = '') => `<div class="kpi ${tone}"><small>${label}</small><b>${value}</b></div>`;
const sectionLink = (href, n, title, desc, count) => `<a class="section-link" href="${href}"><span><span class="n muted" style="font-weight:800;margin-right:8px">${n}</span><span class="t">${title}<span class="d">${desc}</span></span></span><span class="c">${count}</span></a>`;

export function render(ctx) {
  ctx.setNav('home');
  const cfg = settings(), t = today(), todayEntry = entryByDate(t);
  const acct = accountSummary(S.diary, S.capital, cfg);
  const month = filterRange(S.diary, '1m'), sMonth = summary(month, cfg), sAll = summary(S.diary, cfg);
  const rules = activeRules();
  const comp = complianceSeries(S.diary, 30, t, rules.length);
  const compAvg = comp.length ? comp.reduce((a, c) => a + c.pct, 0) / comp.length : null;
  const latest = S.diary[0];

  let h = `<div class="head-row"><div><h1>My Trading Notebook</h1><p class="sub">Every trade, every rule, every lesson — one page per day.</p></div>
    <a class="btn" id="logTradeBtn" href="${todayEntry ? `#/diary/${t}` : '#/diary/new'}">${todayEntry ? "Open today's page" : "+ Log today's trades"}</a></div>`;
  h += '<div id="gateBox"></div>';

  /* account hero — compact: balance, today, rules%, quick update */
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

  /* live positions — one line each, link to the full board */
  h += '<section class="block live-panel" id="livePanel" aria-label="Live positions"></section>';

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

  /* this month, at a glance — full detail lives in Analytics */
  h += `<div class="block"><div class="section-head"><h2>This month</h2><a class="btn small ghost" href="#/analytics">Full analytics →</a></div>
    <div class="mini-stats">
      ${miniStat('Net P&amp;L', `<span class="${cls(sMonth.net)}">${money(sMonth.net, { compact: true })}</span>`, sMonth.days ? (sMonth.net >= 0 ? 'good' : 'bad') : '')}
      ${miniStat('Win rate', pct(sMonth.winRate))}
      ${miniStat('Profit factor', fmtPF(sMonth.profitFactor))}
      ${miniStat('Rules followed', `<span class="${compAvg >= 0.8 ? 'pos' : compAvg >= 0.5 ? 'warn' : 'neg'}">${pct(compAvg)}</span>`, compAvg == null ? '' : compAvg >= 0.8 ? 'good' : 'bad')}
    </div></div>`;

  /* market brief teaser */
  if (S.briefs.length) h += `<div class="block">${briefTeaser(S.briefs[0])}</div>`;

  /* yesterday recap */
  const prevDay = S.diary.find((e) => e.date < t);
  if (prevDay) { const gross = dayGross(prevDay), ch = dayCharges(prevDay), net = dayNet(prevDay); h += `<div class="block"><div class="section-head"><h2>Yesterday's recap — ${niceDate(prevDay.date, { weekday: 'short', day: 'numeric', month: 'short' })}</h2><span class="big ${cls(net)}">${money(net)}</span></div>
    ${prevDay.title ? `<p class="sub small">${esc(prevDay.title)}</p>` : ''}
    <div class="mini">${ch ? `<span>gross <b class="num">${money(gross)}</b></span>` : ''}<span>${plural(dayTrades(prevDay).length, 'trade')}</span><span>${plural(arr(prevDay.mistakes).length, 'mistake')}</span><span>${plural(arr(prevDay.rules_broken).length, 'rule')} broken</span></div>
    <a class="btn small ghost mt" href="#/diary/${esc(prevDay.date)}">Open that day</a></div>`; }

  /* plan for next session */
  if (latest && (arr(latest.next_day_strategy).length || arr(latest.watchlist).length)) h += `<div class="block"><h2>Plan for next session</h2>${planHtml(latest)}</div>`;

  /* the rest of the site */
  h += `<div class="block"><h2>Go to</h2>
    ${sectionLink('#/diary', 1, 'Daily trade diary', "Trades, rules, mistakes, yesterday's plan and tomorrow's strategy", plural(S.diary.length, 'day'))}
    ${sectionLink('#/live', 2, 'Live', 'Index tape, plans against live prices, option payoff scenarios', S.plans.filter((p) => p.status === 'live').length ? `${S.plans.filter((p) => p.status === 'live').length} in trade` : 'view')}
    ${sectionLink('#/market', 3, 'Market brief', 'Sentiment, news, Nifty levels, global cues, all 50 stocks', S.briefs.length ? niceDate(S.briefs[0].date, { day: 'numeric', month: 'short' }) : 'none yet')}
    ${sectionLink('#/analytics', 4, 'Analytics', 'Balance curve, win rate, R-multiples, drawdown, rules followed', plural(sAll.trades, 'trade'))}
    ${sectionLink('#/playbook', 5, 'Playbook &amp; rules', 'Your setups with their stats, and the rules you tick every day', `${S.setups.filter((x) => x.active !== false).length} setups · ${rules.length} rules`)}
    ${sectionLink('#/learn', 6, 'Daily learning', 'New things learned, with links to the full guides', plural(S.learn.length, 'note'))}
    ${sectionLink('#/reviews', 7, 'Weekly reviews', "What worked, what didn't, the one thing to fix next week", plural(S.reviews.length, 'review'))}
  </div>`;

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
