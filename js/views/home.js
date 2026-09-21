/* Front page: red box, today's risk strip, 30-day stats, plan for next session, index. */

import { esc, li } from '../lib/dom.js';
import { money, cls, pct, rmult, niceDate, today, plural, num, arr } from '../lib/fmt.js';
import { summary, filterRange, equityCurve, dayNet, dayTrades, dayLimits } from '../lib/stats.js';
import { sparkline } from '../lib/charts.js';
import { S, settings, entryByDate } from '../state.js';
import { diaryList, flagsHtml, bindFlags, planHtml, alertsHtml } from './shared.js';

export function render(ctx) {
  ctx.setNav('home');
  const cfg = settings(), t = today(), todayEntry = entryByDate(t);
  const last30 = filterRange(S.diary, '30d'), s30 = summary(last30, cfg), sAll = summary(S.diary, cfg);
  const curve = equityCurve(last30).map((p) => p.cum);
  const latest = S.diary[0];

  let h = `<div class="head-row"><div><h1>My Trading Notebook</h1><p class="sub">Every trade, every mistake, every lesson — one page per day.</p></div>
    <a class="btn" href="${todayEntry ? `#/diary/${t}` : '#/diary/new'}">${todayEntry ? "Open today's page" : "+ Log today's trades"}</a></div>`;

  h += flagsHtml();

  /* today strip */
  h += '<div class="today">';
  if (todayEntry) {
    const net = dayNet(todayEntry), n = dayTrades(todayEntry).length, maxLoss = num(cfg.daily_max_loss), maxT = num(cfg.max_trades_per_day);
    h += `<div class="row"><b>Today · ${niceDate(t)}</b><b class="${cls(net)} num">${money(net)}</b></div>`;
    if (maxLoss) { const used = net < 0 ? Math.min(1, -net / maxLoss) : 0; h += `<div class="row small muted"><span>Loss budget used</span><span>${money(Math.min(0, net), { sign: false })} of ₹${maxLoss.toLocaleString('en-IN')}</span></div><div class="meter ${used >= 1 ? 'bad' : used >= 0.7 ? 'warn' : ''}"><i style="width:${Math.round(used * 100)}%"></i></div>`; }
    if (maxT) h += `<div class="row small muted"><span>Trades</span><span>${n} of ${maxT}</span></div>`;
    h += alertsHtml(dayLimits(todayEntry, cfg));
  } else {
    h += `<div class="row"><b>Today · ${niceDate(t)}</b><span class="muted small">No page yet</span></div>`;
    if (num(cfg.daily_max_loss) || num(cfg.max_trades_per_day)) h += `<div class="small muted">Limits for today: ${num(cfg.daily_max_loss) ? `max loss ₹${num(cfg.daily_max_loss).toLocaleString('en-IN')}` : ''}${num(cfg.daily_max_loss) && num(cfg.max_trades_per_day) ? ' · ' : ''}${num(cfg.max_trades_per_day) ? `max ${plural(num(cfg.max_trades_per_day), 'trade')}` : ''}</div>`;
    else h += '<div class="small muted">Set a daily loss limit and max trades in <a href="#/settings">Settings</a> to see a risk meter here.</div>';
  }
  if (sAll.streak.n >= 2) h += `<div class="streak ${sAll.streak.type === 'green' ? 'pos' : 'neg'}">${sAll.streak.n} ${sAll.streak.type} days in a row${sAll.streak.type === 'red' && sAll.streak.n >= 3 ? ' — consider half size today' : ''}</div>`;
  h += '</div>';

  /* 30-day stats */
  h += `<div class="stats">
    <div class="stat"><small>Net P&amp;L · 30 days</small><b class="${cls(s30.net)}">${money(s30.net, { compact: true })}</b>${curve.length > 1 ? sparkline(curve) : `<span class="d">${plural(s30.days, 'day')}</span>`}</div>
    <div class="stat"><small>Green days</small><b>${s30.greenDays}${s30.days ? ` / ${s30.days}` : ''}</b><span class="d">${s30.dayWinRate != null ? pct(s30.dayWinRate) + ' of days' : 'no days yet'}</span></div>
    <div class="stat"><small>Profit factor</small><b>${s30.profitFactor == null ? '–' : s30.profitFactor === Infinity ? '∞' : s30.profitFactor.toFixed(2)}</b><span class="d">${s30.trades ? `win rate ${pct(s30.winRate)} · ${plural(s30.trades, 'trade')}` : 'no closed trades'}</span></div>
    <div class="stat"><small>Avg R per trade</small><b class="${s30.avgR == null ? '' : cls(s30.avgR)}">${rmult(s30.avgR)}</b><span class="d">${s30.rCount ? `${s30.rCount} with a stop set` : 'set stops to see R'}</span></div>
    <div class="stat"><small>Max drawdown</small><b class="${s30.maxDrawdown ? 'neg' : ''}">${s30.maxDrawdown ? money(-s30.maxDrawdown, { compact: true }) : '–'}</b><span class="d">${s30.maxDrawdownPct != null ? pct(s30.maxDrawdownPct, 1) + ' of capital' : '30 days'}</span></div>
    <div class="stat"><small>Discipline</small><b class="${s30.discipline == null ? '' : s30.discipline >= 0.8 ? 'pos' : 'neg'}">${pct(s30.discipline)}</b><span class="d">days with no rule broken</span></div>
  </div>`;

  /* plan for next session */
  if (latest && (arr(latest.next_day_strategy).length || arr(latest.watchlist).length)) h += `<div class="block"><h2>Plan for next session</h2>${planHtml(latest)}</div>`;

  /* index */
  const openSetups = S.setups.filter((x) => x.active !== false).length;
  h += `<div class="block"><h2>Index</h2><ol class="toc">
    <li><a href="#/diary"><span class="n">1</span><span><span class="t">Daily trade diary</span><span class="d">Trades, mistakes, yesterday's plan and tomorrow's strategy</span></span><span class="c">${plural(S.diary.length, 'day')}</span></a></li>
    <li><a href="#/analytics"><span class="n">2</span><span><span class="t">Analytics</span><span class="d">Equity curve, win rate, R-multiples, drawdown, by setup and weekday</span></span><span class="c">${plural(sAll.trades, 'trade')}</span></a></li>
    <li><a href="#/playbook"><span class="n">3</span><span><span class="t">Playbook &amp; rules</span><span class="d">Your setups with their stats, and the hard rules you track</span></span><span class="c">${openSetups} setups · ${S.rules.filter((r) => r.active).length} rules</span></a></li>
    <li><a href="#/learn"><span class="n">4</span><span><span class="t">Daily learning</span><span class="d">New things learned, with links to the full guides</span></span><span class="c">${plural(S.learn.length, 'note')}</span></a></li>
    <li><a href="#/reviews"><span class="n">5</span><span><span class="t">Weekly reviews</span><span class="d">What worked, what didn't, the one thing to fix next week</span></span><span class="c">${plural(S.reviews.length, 'review')}</span></a></li>
  </ol></div>`;

  if (S.diary.length) h += `<div class="block"><h2>Recent days</h2>${diaryList(S.diary.slice(0, 5))}</div>`;
  else h += `<div class="block empty-box"><strong>Your notebook is empty.</strong> Start with <a href="#/settings">Settings</a> (capital, risk per trade, daily loss limit), add your <a href="#/playbook">rules and setups</a>, then log your first day.</div>`;

  ctx.app.innerHTML = h;
  bindFlags(ctx.app, ctx);
}
