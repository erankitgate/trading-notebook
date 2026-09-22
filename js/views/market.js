/* Market brief: one per session — sentiment, top news, Nifty visuals, option chain, global cues,
   sector heat-map, the written analysis, glossary, all Nifty 50 stocks, plan. */

import { esc, li, md } from '../lib/dom.js';
import { niceDate, arr, key } from '../lib/fmt.js';
import { priceChart, gauge, ladder, oiBars, heatTiles, barChart, bindCharts } from '../lib/charts.js';
import { S } from '../state.js';
import { empty } from './shared.js';
import * as live from './live.js';

const fmtN = (v, d = 2) => (v == null ? '–' : Number(v).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }));
const sgn = (v, d = 2, suffix = '%') => (v == null ? '–' : `<span class="${v > 0 ? 'pos' : v < 0 ? 'neg' : 'muted'} num">${v > 0 ? '+' : ''}${Number(v).toFixed(d)}${suffix}</span>`);
const rsiTag = (r) => (r == null ? '<span class="rsi">–</span>' : `<span class="rsi ${r >= 70 ? 'hot' : r >= 60 ? 'warm' : r <= 30 ? 'cold' : ''}">${Math.round(r)}</span>`);
const trendTag = (t) => (t ? `<span class="trend ${esc(t)}">${esc(t)}</span>` : '');
const tick = (x) => `<div class="t ${x.chg_1d > 0 ? 'pos' : x.chg_1d < 0 ? 'neg' : ''}"><small>${esc(x.name)}</small><b class="num">${fmtN(x.close, x.close >= 1000 ? 0 : 2)}</b><span class="c ${x.chg_1d > 0 ? 'pos' : x.chg_1d < 0 ? 'neg' : 'muted'}">${x.chg_1d == null ? '–' : `${x.chg_1d > 0 ? '+' : ''}${x.chg_1d.toFixed(2)}%`}</span></div>`;

/** Sentiment score −2..+2 → chip. */
const SLABEL = { 2: 'Very positive', 1: 'Positive', 0: 'Neutral', '-1': 'Negative', '-2': 'Very negative' };
const stag = (score) => { const n = Math.max(-2, Math.min(2, Math.round(score ?? 0))); return `<span class="stag ${n > 0 ? `p${n}` : n < 0 ? `n${-n}` : 'n0'}">${SLABEL[n]}</span>`; };

const SECTORS = {
  Banks: ['HDFCBANK', 'ICICIBANK', 'SBIN', 'AXISBANK', 'KOTAKBANK'],
  Financials: ['BAJFINANCE', 'BAJAJFINSV', 'SHRIRAMFIN', 'JIOFIN', 'HDFCLIFE', 'SBILIFE'],
  IT: ['TCS', 'INFY', 'HCLTECH', 'WIPRO', 'TECHM'],
  'Energy & power': ['RELIANCE', 'ONGC', 'COALINDIA', 'NTPC', 'POWERGRID'],
  'Adani & infra': ['ADANIENT', 'ADANIPORTS', 'LT', 'BEL'],
  Autos: ['MARUTI', 'M&M', 'TMCV', 'TMPV', 'TATAMOTORS', 'BAJAJ-AUTO', 'EICHERMOT', 'HEROMOTOCO'],
  Consumer: ['ITC', 'HINDUNILVR', 'NESTLEIND', 'TATACONSUM', 'TITAN', 'TRENT', 'ETERNAL', 'ASIANPAINT'],
  'Pharma & health': ['SUNPHARMA', 'CIPLA', 'DRREDDY', 'APOLLOHOSP', 'MAXHEALTH'],
  'Metals & cement': ['TATASTEEL', 'JSWSTEEL', 'HINDALCO', 'ULTRACEMCO', 'GRASIM'],
  Others: ['BHARTIARTL', 'INDIGO'],
};

const TERMS = [
  ['RSI (14)', 'Relative Strength Index, 0–100. Measures how fast price has risen or fallen over 14 days. Below 30 = oversold (sellers exhausted, bounce likely but trend still down); above 70 = overbought. 40–60 = no strong momentum.'],
  ['DMA (10/20/50/200-day moving average)', 'The average closing price over the last N days. Price above a rising average = uptrend; below = downtrend. The 20-DMA is the swing-trend line, the 200-DMA the long-term line. Averages also act as support/resistance.'],
  ['ATR (14)', 'Average True Range: the typical size of one day\'s move in points. Use it for stops — a stop inside 0.5 ATR is noise and will get hit.'],
  ['Pivot, S1–S3, R1–R3', 'Floor-trader levels computed from yesterday\'s high, low and close. Pivot = fair value for the day; S = supports below, R = resistances above. Intraday traders and algos watch them, so price often reacts there.'],
  ['PDH / PDL', 'Previous day high / low. A break above PDH with volume is a bullish sign; below PDL, bearish.'],
  ['OI (open interest) and walls', 'Number of option contracts open at a strike. The strike with the most call OI is the "call wall" — sellers of those calls defend it, so it acts as resistance. The biggest put OI is the "put wall" = support.'],
  ['PCR (put-call ratio)', 'Total put OI ÷ total call OI. Above 1.2 = many puts written = traders positioned for support (mildly bullish, but extreme = complacent). Below 0.8 = call-heavy, bearish lean.'],
  ['ATM straddle / expected move', 'Price of the at-the-money call + put. It is what option sellers charge for the expected move; ~0.8× the straddle is the range the market prices for the session.'],
  ['Weekly / monthly expiry', 'The day an option contract settles. Nifty weeklies expire every Tuesday, monthlies on the last Tuesday. On expiry day, price tends to "pin" between the walls and time decay (theta) is brutal — your rule: never trade an option expiring within 2 days.'],
  ['India VIX', 'Implied volatility of Nifty options: the fear gauge. Below 12 = calm, options cheap; above 18 = fear, options expensive. Low VIX in a downtrend means a sharp move can come without warning.'],
  ['Breadth', 'How many stocks rose vs fell. An index up on narrow breadth (few heavyweights) is weaker than it looks.'],
  ['FPI / FII and DII', 'Foreign portfolio investors and domestic institutions. Net FPI selling weakens the rupee and the index; DIIs (mutual funds, insurers) have been the buyers.'],
  ['DXY (dollar index)', 'The dollar against major currencies. Rising DXY = money leaving emerging markets = pressure on the rupee and Nifty.'],
  ['US 10-year yield', 'The benchmark bond yield. Higher yields pull money out of stocks (especially EM). Falling yields help.'],
  ['Gap-up / gap-down', 'Opening above yesterday\'s high / below yesterday\'s low. Gaps that hold for 15 minutes tend to extend; gaps that fill quickly signal a trap.'],
  ['R-multiple', 'Profit or loss measured in units of the planned risk (entry to stop). A +2R trade made twice what you risked. Think in R, not rupees.'],
  ['Break-even stop', 'Moving your stop to your entry price once the trade is in profit, so the worst case becomes zero.'],
  ['Sentiment score', 'My read of how the news and data lean: −2 very negative to +2 very positive per section; the top meter is the share of positive vs negative drivers, weighted by impact.'],
];

const sentiBar = (se) => (se.positive == null ? '' : `<div class="senti"><div><div class="bar"><i class="p" style="width:${se.positive}%"></i><i class="n" style="width:${se.negative}%"></i></div><div class="lbl"><span class="pos">${se.positive}% positive</span><span class="neg">${se.negative}% negative</span></div>${se.why ? `<div class="small muted mt">${esc(se.why)}</div>` : ''}</div><div class="score"><span class="${se.score > 0 ? 'pos' : se.score < 0 ? 'neg' : ''}">${se.score > 0 ? '+' : ''}${se.score}</span><small>${esc(se.label || 'sentiment score −100…+100')}</small></div></div>`);

/* ---------- TradingView-style technicals ---------- */
const RATING_CLS = { 'Strong buy': 'sbuy', Buy: 'buy', Neutral: 'neut', Sell: 'sell', 'Strong sell': 'ssell' };
const ratingChip = (label) => (label ? `<span class="rchip ${RATING_CLS[label] || 'neut'}">${esc(label)}</span>` : '');

/** Half-circle needle gauge from -1..+1, the way TradingView shows Strong Sell → Strong Buy. */
function ratingGauge(value, label, caption) {
  const v = Math.max(-1, Math.min(1, value ?? 0));
  const cx = 110, cy = 100, r = 78;
  const ang = (t) => Math.PI - ((t + 1) / 2) * Math.PI; // -1 → left, +1 → right
  const pt = (t, rad = r) => `${(cx + rad * Math.cos(ang(t))).toFixed(1)} ${(cy - rad * Math.sin(ang(t))).toFixed(1)}`;
  const arc = (a, b, cls) => `<path class="gz ${cls}" d="M${pt(a)} A${r} ${r} 0 0 1 ${pt(b)}" fill="none" stroke-width="16"/>`;
  return `<div class="tv-gauge"><svg viewBox="0 0 220 118" role="img" aria-label="${esc(label || '')}">
    ${arc(-1, -0.6, 'ssell')}${arc(-0.58, -0.2, 'sell')}${arc(-0.18, 0.18, 'neut')}${arc(0.2, 0.58, 'buy')}${arc(0.6, 1, 'sbuy')}
    <line x1="${cx}" y1="${cy}" x2="${pt(v, r - 14).split(' ')[0]}" y2="${pt(v, r - 14).split(' ')[1]}" stroke="var(--ink)" stroke-width="3.5" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="6" fill="var(--ink)"/>
    <text x="${cx}" y="${cy - 26}" text-anchor="middle" class="gv ${RATING_CLS[label] || 'neut'}">${esc(label || '–')}</text>
  </svg>${caption ? `<div class="small muted">${esc(caption)}</div>` : ''}</div>`;
}

const indTable = (rows, title) => `<div class="kpi"><small>${title}</small><div class="table-wrap"><table class="ind"><thead><tr><th>Name</th><th class="r">Value</th><th class="r">Action</th></tr></thead><tbody>
  ${rows.map((x) => `<tr><td>${esc(x.name)}</td><td class="r num">${x.value == null ? '–' : fmtN(x.value)}</td><td class="r">${ratingChip(x.action)}</td></tr>`).join('')}</tbody></table></div></div>`;

/** Pivots across all five methods, the way TradingView's Pivots panel lays them out. */
function pivotTable(pivots, spot) {
  const methods = Object.keys(pivots || {});
  if (!methods.length) return '';
  const rowName = { R3: 'R3', R2: 'R2', R1: 'R1', Middle: 'P', S1: 'S1', S2: 'S2', S3: 'S3' };
  const order = ['R3', 'R2', 'R1', 'Middle', 'S1', 'S2', 'S3'];
  return `<div class="table-wrap"><table class="pivots"><thead><tr><th>Pivot</th>${methods.map((m) => `<th class="r">${esc(m)}</th>`).join('')}</tr></thead><tbody>
    ${order.map((lvl) => `<tr class="${lvl.startsWith('R') ? 'res' : lvl.startsWith('S') ? 'sup' : 'piv'}"><td><b>${rowName[lvl]}</b></td>${methods.map((m) => {
      const v = pivots[m]?.[lvl];
      const near = v != null && spot != null && Math.abs(v - spot) / spot < 0.0035;
      return `<td class="r num">${v == null ? '–' : `<span class="${near ? 'near' : ''}">${fmtN(v, 0)}</span>`}</td>`;
    }).join('')}</tr>`).join('')}</tbody></table></div>`;
}

/** Which stocks actually moved the index, in points. */
function contributionBlock(c, stocks) {
  if (!c || c.net_points == null) return '';
  const all = [...arr(stocks)].filter((s) => s.points != null).sort((a, b) => b.points - a.points);
  const max = Math.max(...all.map((s) => Math.abs(s.points)), 0.01);
  const bar = (s) => `<li><span class="sym">${esc(s.symbol)}</span><span class="wt muted">${s.weight_pct != null ? `${s.weight_pct.toFixed(2)}%` : ''}</span>
    <span class="track"><i class="${s.points >= 0 ? 'up' : 'dn'}" style="width:${Math.round((Math.abs(s.points) / max) * 100)}%"></i></span>
    <span class="pts num ${s.points >= 0 ? 'pos' : 'neg'}">${s.points >= 0 ? '+' : ''}${s.points.toFixed(1)}</span>
    <span class="chg num ${s.chg_1d >= 0 ? 'pos' : 'neg'}">${s.chg_1d >= 0 ? '+' : ''}${(s.chg_1d ?? 0).toFixed(2)}%</span></li>`;
  const up = all.filter((s) => s.points > 0).slice(0, 10), down = all.filter((s) => s.points < 0).slice(-10).reverse();
  return `<div class="block"><div class="section-head"><h2>What moved the index</h2><span class="big ${c.net_points >= 0 ? 'pos' : 'neg'} num">${c.net_points >= 0 ? '+' : ''}${Math.round(c.net_points)} pts</span></div>
    <p class="small muted">Each stock's weight in Nifty × its move = the points it added or took off. ${c.advances} up, ${c.declines} down.</p>
    <div class="viz-grid">
      <div class="kpi good"><small>Pushed the index up · +${Math.round(c.points_up)} pts</small><ul class="contrib">${up.map(bar).join('')}</ul></div>
      <div class="kpi bad"><small>Dragged it down · ${Math.round(c.points_down)} pts</small><ul class="contrib">${down.map(bar).join('')}</ul></div>
    </div></div>`;
}

/** Compact card for the front page. */
export function briefTeaser(b) {
  const n = b.nifty || {}, p = n.pivots || {}, se = b.sentiment || {};
  const mas = [['10', n.sma10], ['20', n.sma20], ['50', n.sma50], ['200', n.sma200]].filter((m) => m[1] != null);
  const globals = arr(b.globals).filter((g) => /Crude WTI|Dollar|S&P|Nasdaq|Nikkei|Hang|USD\/INR|Gold/.test(g.name));
  return `<div class="section-head"><h2>Market brief · ${niceDate(b.date, { weekday: 'short', day: 'numeric', month: 'short' })}${se.score != null ? stag(se.score / 50) : ''}</h2><a class="btn small ghost" href="#/market/${esc(b.date)}">Open full brief</a></div>
    ${sentiBar({ ...se, why: null })}
    <div class="brief-grid">
      <div class="kpi ${n.chg_1d > 0 ? 'good' : n.chg_1d < 0 ? 'bad' : ''}"><small>Nifty 50 · close ${b.as_of ? niceDate(b.as_of, { day: 'numeric', month: 'short' }) : ''}</small><b class="num">${fmtN(n.close, 1)}</b><span class="d">${sgn(n.chg_1d)} · RSI ${rsiTag(n.rsi)} ${trendTag(n.trend)}</span></div>
      <div class="kpi info"><small>Levels for the session</small><ul class="lvl"><li class="r"><span>R2</span><b class="num">${fmtN(p.r2, 0)}</b></li><li class="r"><span>R1</span><b class="num">${fmtN(p.r1, 0)}</b></li><li class="p"><span>Pivot</span><b class="num">${fmtN(p.pivot, 0)}</b></li><li class="s"><span>S1</span><b class="num">${fmtN(p.s1, 0)}</b></li><li class="s"><span>S2</span><b class="num">${fmtN(p.s2, 0)}</b></li></ul></div>
      ${arr(b.plan).length ? `<div class="kpi"><small>Plan</small><ul class="plain small" style="margin:4px 0 0;padding-left:18px">${li(arr(b.plan).slice(0, 4))}</ul></div>` : ''}
    </div>
    ${mas.length ? `<div class="mini mt"><span class="muted">vs DMA:</span>${mas.map(([l, v]) => `<span>${l} <b class="${n.close > v ? 'pos' : 'neg'}">${n.close > v ? 'above' : 'below'}</b></span>`).join('')}</div>` : ''}
    ${arr(b.news).length ? `<ul class="news">${arr(b.news).slice(0, 4).map((x) => `<li><span>${stag(x.score)}</span><span><span class="t">${esc(x.title)}</span></span></li>`).join('')}</ul>` : ''}
    ${globals.length ? `<div class="ticker">${globals.map(tick).join('')}</div>` : ''}`;
}

export function render(ctx, date) {
  ctx.setNav('market');
  if (!S.briefs.length) { ctx.app.innerHTML = `<h1>Market brief</h1>${empty('No brief yet. In Claude Code run <code>/brief</code> — it fetches Nifty, global cues and all 50 stocks, writes the analysis and the plan, and saves it here.')}`; return; }
  const i = date ? S.briefs.findIndex((b) => b.date === date) : 0;
  if (i < 0) { ctx.go('#/market'); return; }
  const b = S.briefs[i], newer = S.briefs[i - 1], older = S.briefs[i + 1];
  const n = b.nifty || {}, p = n.pivots || {}, br = b.breadth || {}, se = b.sentiment || {}, oi = b.oi || {};
  const sortKey = ctx.query.get('s') || 'chg_1d', dir = ctx.query.get('d') || 'desc';
  const stocks = [...arr(b.stocks)].sort((a, c) => { const x = a[sortKey], y = c[sortKey]; if (x == null) return 1; if (y == null) return -1; return typeof x === 'string' ? (dir === 'asc' ? x.localeCompare(y) : y.localeCompare(x)) : dir === 'asc' ? x - y : y - x; });
  const byKey = Object.fromEntries(arr(b.stocks).map((x) => [x.symbol, x]));
  const tagFor = (needle) => sectionTag(se.sections || [], needle);

  let h = `<div class="head-row"><div><p class="sub">Market brief</p><h1>${niceDate(b.date)}</h1><p class="sub">Data as of ${b.as_of ? niceDate(b.as_of) : '–'} close · written ${b.updated_at ? new Date(b.updated_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</p></div>
    <div class="acts">${older ? `<a class="chip" href="#/market/${esc(older.date)}">‹ ${niceDate(older.date, { day: 'numeric', month: 'short' })}</a>` : ''}${newer ? `<a class="chip" href="#/market/${esc(newer.date)}">${niceDate(newer.date, { day: 'numeric', month: 'short' })} ›</a>` : ''}</div></div>`;

  /* 1. sentiment + top news */
  h += sentiBar(se);
  if (arr(b.news).length) h += `<div class="block"><h2>Top news, scored</h2><ul class="news">${arr(b.news).map((x) => `<li><span>${stag(x.score)}<div class="imp">${esc(x.impact || '')} impact</div></span><span><span class="t">${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a>` : esc(x.title)}</span>${x.source ? ` <span class="muted small">· ${esc(x.source)}</span>` : ''}${x.note ? `<div class="n">${esc(x.note)}</div>` : ''}</span></li>`).join('')}</ul></div>`;

  /* 2. live */
  h += '<section class="block live-panel" id="livePanel" aria-label="Live market"></section>';

  /* 3. nifty visuals */
  const lvls = [['R3', p.r3, 'r'], ['R2', p.r2, 'r'], ['R1', p.r1, 'r'], ['PDH', p.pdh, 'r'], ['Pivot', p.pivot, 'p'], ['PDL', p.pdl, 's'], ['S1', p.s1, 's'], ['S2', p.s2, 's'], ['S3', p.s3, 's']].filter((l) => l[1] != null);
  const mas = [['10-DMA', n.sma10], ['20-DMA', n.sma20], ['50-DMA', n.sma50], ['200-DMA', n.sma200]].filter((m) => m[1] != null);
  h += `<div class="block"><div class="section-head"><h2>Nifty 50 — where price sits${tagFor('technical')}</h2><span class="big ${n.chg_1d > 0 ? 'pos' : 'neg'} num">${fmtN(n.close, 1)} <span class="small">${n.chg_1d > 0 ? '+' : ''}${fmtN(n.chg_1d)}%</span></span></div>
    ${arr(n.series).length ? priceChart(n.series, { label: 'Nifty 50 with moving averages', levels: [p.r1 && { label: 'R1', value: p.r1, color: 'var(--down)' }, p.s1 && { label: 'S1', value: p.s1, color: 'var(--up)' }].filter(Boolean) }) : ''}
    <div class="viz-grid mt">
      <div class="kpi">${gauge(n.rsi, { label: 'RSI (14)', sub: n.rsi == null ? '' : n.rsi <= 30 ? 'oversold' : n.rsi >= 70 ? 'overbought' : n.rsi < 45 ? 'weak' : n.rsi > 55 ? 'strong' : 'neutral' })}<div class="small muted">Below 30 oversold · above 70 overbought</div></div>
      <div class="kpi info"><small>Levels ladder</small>${ladder([...lvls.map(([label, value, kind]) => ({ label, value, kind })), ...mas.filter((m) => Math.abs(m[1] - n.close) < (n.atr || 200) * 4).map(([label, value]) => ({ label, value, kind: 'ma' }))], n.close)}</div>
      <div class="kpi"><small>Trend check</small><ul class="check mt">${mas.map(([l, v]) => `<li class="${n.close > v ? 'done' : 'broke'}">${l} ${fmtN(v, 0)} — price ${n.close > v ? 'above' : 'below'}</li>`).join('')}</ul><div class="mini"><span>Trend ${trendTag(n.trend)}</span><span>ATR <b class="num">${fmtN(n.atr, 0)}</b> pts</span><span>52w <b class="num">${fmtN(n.lo_52w, 0)}–${fmtN(n.hi_52w, 0)}</b></span></div><div class="small muted mt">5d ${sgn(n.chg_5d)} · 20d ${sgn(n.chg_20d)} · vs 20-DMA ${sgn(n.dist_sma20_pct)}</div></div>
      ${arr(b.indices).map((x) => `<div class="kpi ${x.name.includes('VIX') ? (x.chg_1d > 0 ? 'warn' : '') : x.chg_1d > 0 ? 'good' : x.chg_1d < 0 ? 'bad' : ''}"><small>${esc(x.name)}</small><b class="num">${fmtN(x.close, x.name.includes('VIX') ? 2 : 0)}</b><span class="d">${sgn(x.chg_1d)} · RSI ${rsiTag(x.rsi)} ${trendTag(x.trend)}</span>${x.pivots ? `<div class="small muted mt">S1 ${fmtN(x.pivots.s1, 0)} · P ${fmtN(x.pivots.pivot, 0)} · R1 ${fmtN(x.pivots.r1, 0)}</div>` : ''}${x.name.includes('VIX') ? `<div class="small muted mt">${x.close < 12 ? 'Calm — options cheap; moves can be sudden' : x.close > 18 ? 'Fear — options expensive' : 'Normal'}</div>` : ''}</div>`).join('')}
    </div></div>`;

  /* 4. option chain */
  const oiCard = (o, title) => (!o ? '' : `<div class="kpi"><small>${title} · expiry ${niceDate(o.expiry, { day: 'numeric', month: 'short' })} · PCR <b>${o.pcr}</b> · call wall <b class="num">${fmtN(o.max_call, 0)}</b> · put wall <b class="num">${fmtN(o.max_put, 0)}</b></small>${arr(o.rows).length ? oiBars(arr(o.rows).map((r) => ({ strike: r[0], call: r[1], put: r[2] })), { spot: n.close }) : ''}${o.straddle ? `<div class="small muted mt">ATM straddle ${o.straddle} → market prices a move of about ±${o.expected_move} points</div>` : ''}</div>`);
  if (oi.weekly || oi.monthly) h += `<div class="block"><div class="section-head"><h2>Option chain — where the walls are${tagFor('option')}</h2></div><div class="viz-grid">${oiCard(oi.weekly, 'Weekly')}${oiCard(oi.monthly, 'Monthly')}</div>${oi.note ? `<p class="small muted mt">${esc(oi.note)}</p>` : ''}</div>`;

  /* 5. plan */
  if (arr(b.plan).length) h += `<div class="block"><h2>Plan for the session</h2><div class="plan next"><ol>${li(arr(b.plan))}</ol></div></div>`;

  /* 6. globals */
  if (arr(b.globals).length) {
    h += `<div class="block"><div class="section-head"><h2>Global cues${tagFor('global')}</h2><span class="legend"><span><i class="pos"></i>up</span><span><i class="neg"></i>down</span></span></div>
      ${barChart(arr(b.globals).map((g) => ({ label: g.name.replace(/\s*\(.*\)/, '').replace('US 10Y yield', 'US 10Y').replace('Dollar index', 'DXY'), value: g.chg_1d ?? 0, tip: `${g.name}: ${g.chg_1d > 0 ? '+' : ''}${g.chg_1d}% (${fmtN(g.close, g.close >= 1000 ? 0 : 2)})` })), { labelKey: 'label', height: 190, label: '1-day change', fmtValue: (v) => `${v > 0 ? '+' : ''}${Number(v).toFixed(2)}%` })}
      <div class="ticker">${arr(b.globals).map(tick).join('')}</div>
      <div class="table-wrap mt"><table><thead><tr><th>Market</th><th class="r">Last</th><th class="r">1d</th><th class="r">5d</th><th class="r">20d</th><th class="r">RSI</th><th>Trend</th><th>For India</th></tr></thead><tbody>
      ${arr(b.globals).map((g) => `<tr><td>${esc(g.name)}</td><td class="r num">${fmtN(g.close, g.close >= 1000 ? 0 : 2)}</td><td class="r">${sgn(g.chg_1d)}</td><td class="r">${sgn(g.chg_5d)}</td><td class="r">${sgn(g.chg_20d)}</td><td class="r">${rsiTag(g.rsi)}</td><td>${trendTag(g.trend)}</td><td class="small">${indiaRead(g)}</td></tr>`).join('')}</tbody></table></div></div>`;
  }

  /* 6b. TradingView technicals */
  const tv = b.technicals || {};
  if (tv.summary) {
    h += `<div class="block"><div class="section-head"><h2>Technicals ${tv.source ? `<span class="muted small">· ${esc(tv.source)}</span>` : ''}</h2>${tv.fetched_at ? `<span class="small muted">${new Date(tv.fetched_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>` : ''}</div>
      <div class="viz-grid">
        <div class="kpi">${ratingGauge(tv.summary.osc, tv.summary.osc_label, 'Oscillators')}</div>
        <div class="kpi accent-card">${ratingGauge(tv.summary.all, tv.summary.label, 'Summary — everything together')}</div>
        <div class="kpi">${ratingGauge(tv.summary.ma, tv.summary.ma_label, 'Moving averages')}</div>
      </div>
      <div class="viz-grid mt">${indTable(arr(tv.oscillators), 'Oscillators')}${indTable(arr(tv.moving_averages), 'Moving averages')}</div>
      ${tv.pivots ? `<h3 class="mt">Pivots — monthly</h3>${pivotTable(tv.pivots, tv.close ?? n.close)}` : ''}
      ${tv.pivots_daily && tv.pivots_daily.Classic ? `<h3 class="mt">Pivots — daily (the levels for tomorrow's session)</h3>${pivotTable(tv.pivots_daily, tv.close ?? n.close)}` : ''}
      <p class="small muted mt">Green = the level is within ~0.35% of spot. Ratings are TradingView's own: each indicator votes, the gauge is the tally.</p></div>`;
  }

  /* 6c. index contribution */
  h += contributionBlock(b.contribution, b.stocks);

  /* 7. sectors + heat map */
  if (arr(b.stocks).length) {
    const secs = Object.entries(SECTORS).map(([name, syms]) => { const xs = syms.map((s) => byKey[s]).filter(Boolean); const avg = xs.length ? xs.reduce((a, x) => a + (x.chg_1d || 0), 0) / xs.length : null; return { name, avg: avg == null ? null : +avg.toFixed(2), up: xs.filter((x) => x.chg_1d > 0).length, n: xs.length, above20: xs.filter((x) => x.dist_sma20_pct > 0).length }; }).filter((s) => s.n);
    const short = (s) => s.replace('Energy & power', 'Energy').replace('Pharma & health', 'Pharma').replace('Metals & cement', 'Metals').replace('Adani & infra', 'Infra');
    h += `<div class="block"><div class="section-head"><h2>Sectors and all ${arr(b.stocks).length} stocks${tagFor('stock')}</h2><span class="small muted">${br.advances ?? '–'} up · ${br.declines ?? '–'} down · ${br.above_sma20 ?? '–'} above 20-DMA</span></div>
      ${barChart(secs.map((s) => ({ label: short(s.name), value: s.avg, tip: `${s.name}: avg ${s.avg > 0 ? '+' : ''}${s.avg}% · ${s.up}/${s.n} up · ${s.above20} above 20-DMA` })), { labelKey: 'label', height: 170, label: 'Average 1-day change by sector', fmtValue: (v) => `${v > 0 ? '+' : ''}${Number(v).toFixed(2)}%` })}
      ${Object.entries(SECTORS).map(([name, syms]) => { const xs = syms.map((s) => byKey[s]).filter(Boolean); return xs.length ? `<h3 class="mt">${esc(name)}</h3>${heatTiles(xs.map((x) => ({ label: x.symbol, value: x.chg_1d, sub: `RSI ${x.rsi ?? '–'} · ${x.trend}`, tip: `${x.symbol} ${fmtN(x.close)} · 1d ${x.chg_1d}% · 20d ${x.chg_20d}% · RSI ${x.rsi} · ${x.trend}` })))}` : ''; }).join('')}
      <p class="small muted mt">Colour = today's move (deeper = bigger); the small line shows RSI and trend. Sort the full table below for details.</p></div>`;
  }

  /* 8. the written report with per-section tags */
  if (b.report) {
    const heads = [...String(b.report).matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim());
    h += `<div class="block"><h2>Full analysis</h2>${heads.length ? `<div class="toc-inline">${heads.map((t, k) => `<a class="chip" href="#" data-sec="${k}">${esc(t)}</a>`).join('')}</div>` : ''}<div class="report" id="report">${md(b.report)}</div></div>`;
  } else if (b.summary) h += `<div class="block"><h2>Read</h2><p class="summary">${esc(b.summary)}</p></div>`;

  /* 9. glossary */
  h += `<div class="block"><details><summary><b>Terms explained</b> <span class="muted small">(${TERMS.length} terms used above)</span></summary><dl class="terms">${TERMS.map(([t, d]) => `<dt>${esc(t)}</dt><dd>${esc(d)}</dd>`).join('')}</dl></details></div>`;

  /* 10. stocks table */
  if (stocks.length) {
    const th = (k, label, r = true) => `<th class="sort ${r ? 'r' : ''}" data-k="${k}" aria-sort="${sortKey === k ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}">${label}</th>`;
    h += `<div class="block"><h2>All Nifty 50 stocks <span class="muted small">(tap a column to sort)</span></h2><div class="table-wrap"><table class="wide stocks-table"><thead><tr>${th('symbol', 'Stock', false)}${th('close', 'Close')}${th('chg_1d', '1d')}${th('chg_5d', '5d')}${th('chg_20d', '20d')}${th('rsi', 'RSI')}${th('dist_sma20_pct', 'vs 20DMA')}${th('trend', 'Trend', false)}<th class="r">52-week</th></tr></thead><tbody>
      ${stocks.map((x) => `<tr><td><b>${esc(x.symbol)}</b></td><td class="r num">${fmtN(x.close)}</td><td class="r">${sgn(x.chg_1d)}</td><td class="r">${sgn(x.chg_5d)}</td><td class="r">${sgn(x.chg_20d)}</td><td class="r">${rsiTag(x.rsi)}</td><td class="r">${sgn(x.dist_sma20_pct, 1)}</td><td>${trendTag(x.trend)}</td><td class="r num small muted">${fmtN(x.lo_52w, 0)} – ${fmtN(x.hi_52w, 0)}</td></tr>`).join('')}</tbody></table></div></div>`;
  }
  h += '<p class="small muted mt">Update this brief from Claude Code with <code>/brief</code>. Prices: NSE via Upstox and Yahoo Finance daily candles; the analysis is written fresh each day and kept as-is afterwards.</p>';
  ctx.app.innerHTML = h;
  bindCharts(ctx.app);
  live.mount(ctx.app.querySelector('#livePanel'), ctx, { date: b.date });
  for (const el of ctx.app.querySelectorAll('th.sort')) el.onclick = () => { const k = el.dataset.k; const nd = sortKey === k && dir === 'desc' ? 'asc' : 'desc'; ctx.go(`#/market/${b.date}?s=${k}&d=${nd}`); };
  const secs = ctx.app.querySelectorAll('#report h2');
  secs.forEach((el, k) => { el.id = `sec${k}`; const tag = sectionTag(se.sections || [], el.textContent); if (tag) el.insertAdjacentHTML('beforeend', tag); });
  for (const a of ctx.app.querySelectorAll('[data-sec]')) a.onclick = (ev) => { ev.preventDefault(); secs[+a.dataset.sec]?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
}

/** Find a per-section score whose title matches the needle (case-insensitive substring either way). */
function sectionTag(sections, needle) {
  const s = arr(sections).find((x) => key(x.title).includes(key(needle)) || key(needle).includes(key(x.title)));
  return s ? stag(s.score) + (s.why ? `<span class="muted small" style="font-weight:500"> ${esc(s.why)}</span>` : '') : '';
}

/** One-line "what it means for India" per global cue. */
function indiaRead(g) {
  const up = g.chg_1d > 0, n = g.name;
  if (/Crude|Brent/.test(n)) return up ? '<span class="neg">Bad — inflation, rupee, current account</span>' : '<span class="pos">Good — cheaper oil helps rupee and inflation</span>';
  if (/Dollar/.test(n)) return up ? '<span class="neg">Bad — money leaves EM, rupee weaker</span>' : '<span class="pos">Good — rupee relief</span>';
  if (/USD\/INR/.test(n)) return up ? '<span class="neg">Rupee weaker — FPI selling pressure</span>' : '<span class="pos">Rupee stronger</span>';
  if (/10Y/.test(n)) return up ? '<span class="neg">Higher yields pull money from stocks</span>' : '<span class="pos">Easing yields help risk assets</span>';
  if (/Gold/.test(n)) return up ? '<span class="muted">Risk-off bid</span>' : '<span class="muted">Risk appetite returning</span>';
  if (/VIX/.test(n)) return up ? '<span class="neg">Fear rising</span>' : '<span class="pos">Fear easing</span>';
  return up ? '<span class="pos">Supportive for a gap-up</span>' : '<span class="neg">Weak global lead</span>';
}
