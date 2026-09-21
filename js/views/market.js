/* Market brief: one per session — Nifty levels, global cues, breadth, all Nifty 50 stocks, plan. */

import { esc, li, md } from '../lib/dom.js';
import { niceDate, arr, num } from '../lib/fmt.js';
import { S } from '../state.js';
import { empty } from './shared.js';

const fmtN = (v, d = 2) => (v == null ? '–' : Number(v).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }));
const sgn = (v, d = 2, suffix = '%') => (v == null ? '–' : `<span class="${v > 0 ? 'pos' : v < 0 ? 'neg' : 'muted'} num">${v > 0 ? '+' : ''}${Number(v).toFixed(d)}${suffix}</span>`);
const rsiTag = (r) => (r == null ? '<span class="rsi">–</span>' : `<span class="rsi ${r >= 70 ? 'hot' : r >= 60 ? 'warm' : r <= 30 ? 'cold' : ''}">${Math.round(r)}</span>`);
const trendTag = (t) => (t ? `<span class="trend ${esc(t)}">${esc(t)}</span>` : '');
const tick = (x) => `<div class="t ${x.chg_1d > 0 ? 'pos' : x.chg_1d < 0 ? 'neg' : ''}"><small>${esc(x.name)}</small><b class="num">${fmtN(x.close, x.close >= 1000 ? 0 : 2)}</b><span class="c ${x.chg_1d > 0 ? 'pos' : x.chg_1d < 0 ? 'neg' : 'muted'}">${x.chg_1d == null ? '–' : `${x.chg_1d > 0 ? '+' : ''}${x.chg_1d.toFixed(2)}%`}</span></div>`;

/** Compact card for the front page. */
export function briefTeaser(b) {
  const n = b.nifty || {}, p = n.pivots || {};
  const globals = arr(b.globals).filter((g) => /Crude WTI|Dollar|S&P|Nasdaq|Nikkei|Hang|USD\/INR|Gold/.test(g.name));
  return `<div class="section-head"><h2>Market brief · ${niceDate(b.date, { weekday: 'short', day: 'numeric', month: 'short' })}</h2><a class="btn small ghost" href="#/market/${esc(b.date)}">Open full brief</a></div>
    <div class="brief-grid">
      <div class="kpi ${n.chg_1d > 0 ? 'good' : n.chg_1d < 0 ? 'bad' : ''}"><small>Nifty 50 · close ${b.as_of ? niceDate(b.as_of, { day: 'numeric', month: 'short' }) : ''}</small><b class="num">${fmtN(n.close, 1)}</b><span class="d">${sgn(n.chg_1d)} · RSI ${rsiTag(n.rsi)} ${trendTag(n.trend)}</span></div>
      <div class="kpi info"><small>Levels for the session</small><ul class="lvl"><li class="r"><span>R2</span><b class="num">${fmtN(p.r2, 0)}</b></li><li class="r"><span>R1</span><b class="num">${fmtN(p.r1, 0)}</b></li><li class="p"><span>Pivot</span><b class="num">${fmtN(p.pivot, 0)}</b></li><li class="s"><span>S1</span><b class="num">${fmtN(p.s1, 0)}</b></li><li class="s"><span>S2</span><b class="num">${fmtN(p.s2, 0)}</b></li></ul></div>
      ${arr(b.plan).length ? `<div class="kpi"><small>Plan</small><ul class="plain small" style="margin:4px 0 0;padding-left:18px">${li(arr(b.plan).slice(0, 4))}</ul></div>` : ''}
    </div>
    ${globals.length ? `<div class="ticker">${globals.map(tick).join('')}</div>` : ''}`;
}

export function render(ctx, date) {
  ctx.setNav('market');
  if (!S.briefs.length) { ctx.app.innerHTML = `<h1>Market brief</h1>${empty('No brief yet. In Claude Code run <code>/brief</code> — it fetches Nifty, global cues and all 50 stocks, writes the analysis and the plan, and saves it here.')}`; return; }
  const i = date ? S.briefs.findIndex((b) => b.date === date) : 0;
  if (i < 0) { ctx.go('#/market'); return; }
  const b = S.briefs[i], newer = S.briefs[i - 1], older = S.briefs[i + 1];
  const n = b.nifty || {}, p = n.pivots || {}, br = b.breadth || {};
  const sortKey = ctx.query.get('s') || 'chg_1d', dir = ctx.query.get('d') || 'desc';
  const stocks = [...arr(b.stocks)].sort((a, c) => { const x = a[sortKey], y = c[sortKey]; if (x == null) return 1; if (y == null) return -1; return typeof x === 'string' ? (dir === 'asc' ? x.localeCompare(y) : y.localeCompare(x)) : dir === 'asc' ? x - y : y - x; });

  let h = `<div class="head-row"><div><p class="sub">Market brief</p><h1>${niceDate(b.date)}</h1><p class="sub">Data as of ${b.as_of ? niceDate(b.as_of) : '–'} close · updated ${b.updated_at ? new Date(b.updated_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</p></div>
    <div class="acts">${older ? `<a class="chip" href="#/market/${esc(older.date)}">‹ ${niceDate(older.date, { day: 'numeric', month: 'short' })}</a>` : ''}${newer ? `<a class="chip" href="#/market/${esc(newer.date)}">${niceDate(newer.date, { day: 'numeric', month: 'short' })} ›</a>` : ''}</div></div>`;

  /* nifty + levels */
  const lvls = [['R3', p.r3, 'r'], ['R2', p.r2, 'r'], ['R1', p.r1, 'r'], ['PDH', p.pdh, 'r'], ['Pivot', p.pivot, 'p'], ['PDL', p.pdl, 's'], ['S1', p.s1, 's'], ['S2', p.s2, 's'], ['S3', p.s3, 's']].filter((l) => l[1] != null).sort((a, c) => c[1] - a[1]);
  let placed = false;
  h += `<div class="brief-grid">
    <div class="kpi ${n.chg_1d > 0 ? 'good' : n.chg_1d < 0 ? 'bad' : ''}"><small>Nifty 50</small><b class="num" style="font-size:1.7rem">${fmtN(n.close, 1)}</b><span class="d">${sgn(n.chg_1d)} today · ${sgn(n.chg_5d)} 5d · ${sgn(n.chg_20d)} 20d</span>
      <div class="mini mt"><span>RSI ${rsiTag(n.rsi)}</span><span>${trendTag(n.trend)}</span><span>ATR <b class="num">${fmtN(n.atr, 0)}</b></span><span>vs 20DMA ${sgn(n.dist_sma20_pct)}</span></div>
      <div class="small muted mt">Day range ${fmtN(n.low, 0)} – ${fmtN(n.high, 0)} · 52w ${fmtN(n.lo_52w, 0)} – ${fmtN(n.hi_52w, 0)} · SMA20 ${fmtN(n.sma20, 0)} · SMA50 ${fmtN(n.sma50, 0)} · SMA200 ${fmtN(n.sma200, 0)}</div></div>
    <div class="kpi info"><small>Levels (classic pivots from ${b.as_of ? niceDate(b.as_of, { day: 'numeric', month: 'short' }) : 'last'} candle)</small><ul class="lvl">${lvls.map(([k, v, c]) => { let now = ''; if (!placed && n.close != null && v <= n.close) { now = ` now`; placed = true; return `<li class="now"><span>Nifty ${fmtN(n.close, 0)}</span><b>← you are here</b></li><li class="${c}"><span>${k}</span><b class="num">${fmtN(v, 0)}</b></li>`; } return `<li class="${c}${now}"><span>${k}</span><b class="num">${fmtN(v, 0)}</b></li>`; }).join('')}</ul></div>
    ${arr(b.indices).map((x) => `<div class="kpi ${x.name.includes('VIX') ? (x.chg_1d > 0 ? 'warn' : '') : x.chg_1d > 0 ? 'good' : x.chg_1d < 0 ? 'bad' : ''}"><small>${esc(x.name)}</small><b class="num">${fmtN(x.close, x.name.includes('VIX') ? 2 : 0)}</b><span class="d">${sgn(x.chg_1d)} · RSI ${rsiTag(x.rsi)} ${trendTag(x.trend)}</span>${x.pivots ? `<div class="small muted mt">S1 ${fmtN(x.pivots.s1, 0)} · P ${fmtN(x.pivots.pivot, 0)} · R1 ${fmtN(x.pivots.r1, 0)}</div>` : ''}</div>`).join('')}
  </div>`;

  /* option chain walls */
  const oi = b.oi || {};
  const wallList = (walls, cls) => { const max = Math.max(...walls.map((w) => w[1]), 1); return `<ul class="${cls}">${walls.map(([k, v]) => `<li><span><b class="num">${fmtN(k, 0)}</b><div class="bar"><i style="width:${Math.round((v / max) * 100)}%"></i></div></span><span class="num muted">${v}M</span></li>`).join('')}</ul>`; };
  const oiCard = (o, title) => (!o ? '' : `<div class="kpi"><small>${title} · expiry ${niceDate(o.expiry, { day: 'numeric', month: 'short' })} · PCR ${o.pcr}</small><div class="walls"><div class="c"><div class="small muted">Call walls (resistance)</div>${wallList(arr(o.call_walls), 'c')}</div><div class="p"><div class="small muted">Put walls (support)</div>${wallList(arr(o.put_walls), 'p')}</div></div>${o.straddle ? `<div class="small muted mt">ATM straddle ${o.straddle} → market prices ±${o.expected_move} points</div>` : ''}</div>`);
  if (oi.weekly || oi.monthly) h += `<div class="block"><h2>Option chain</h2><div class="brief-grid">${oiCard(oi.weekly, 'Weekly')}${oiCard(oi.monthly, 'Monthly')}</div>${oi.note ? `<p class="small muted mt">${esc(oi.note)}</p>` : ''}</div>`;

  /* plan (always near the top) */
  if (arr(b.plan).length) h += `<div class="block"><h2>Plan for the session</h2><div class="plan next"><ol>${li(arr(b.plan))}</ol></div></div>`;

  /* the written report */
  if (b.report) {
    const heads = [...String(b.report).matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim());
    h += `<div class="block"><h2>Full analysis</h2>${heads.length ? `<div class="toc-inline">${heads.map((t, i) => `<a class="chip" href="#/market/${esc(b.date)}?s=${sortKey}&d=${dir}#sec${i}" data-sec="${i}">${esc(t)}</a>`).join('')}</div>` : ''}<div class="report" id="report">${md(b.report)}</div></div>`;
  } else if (b.summary) h += `<div class="block"><h2>Read</h2><p class="summary">${esc(b.summary)}</p></div>`;

  /* globals */
  if (arr(b.globals).length) {
    h += `<div class="block"><h2>Global cues</h2><div class="ticker">${arr(b.globals).map(tick).join('')}</div>
      <div class="table-wrap mt"><table><thead><tr><th>Market</th><th class="r">Last</th><th class="r">1d</th><th class="r">5d</th><th class="r">20d</th><th class="r">RSI</th><th>Trend</th><th class="r">Date</th></tr></thead><tbody>
      ${arr(b.globals).map((g) => `<tr><td>${esc(g.name)}</td><td class="r num">${fmtN(g.close, g.close >= 1000 ? 0 : 2)}</td><td class="r">${sgn(g.chg_1d)}</td><td class="r">${sgn(g.chg_5d)}</td><td class="r">${sgn(g.chg_20d)}</td><td class="r">${rsiTag(g.rsi)}</td><td>${trendTag(g.trend)}</td><td class="r muted small">${g.date ? niceDate(g.date, { day: 'numeric', month: 'short' }) : ''}</td></tr>`).join('')}</tbody></table></div></div>`;
  }

  /* breadth */
  if (br.advances != null) {
    const tot = br.advances + br.declines || 1;
    h += `<div class="block"><h2>Breadth · Nifty 50</h2><div class="small"><span><b class="pos">${br.advances} up</b> · <b class="neg">${br.declines} down</b> · ${br.above_sma20 ?? '–'} above 20DMA</span></div><div class="breadth"><i class="up" style="width:${(br.advances / tot) * 100}%"></i><i class="dn" style="width:${(br.declines / tot) * 100}%"></i></div>
      <p class="small muted mt">${arr(br.rsi_over_70).length ? `Overbought (RSI ≥ 70): ${arr(br.rsi_over_70).map(esc).join(', ')}. ` : ''}${arr(br.rsi_under_30).length ? `Oversold (RSI ≤ 30): ${arr(br.rsi_under_30).map(esc).join(', ')}.` : ''}${!arr(br.rsi_over_70).length && !arr(br.rsi_under_30).length ? 'No stock at an RSI extreme.' : ''}</p></div>`;
  }

  /* stocks table */
  if (stocks.length) {
    const th = (k, label, r = true) => `<th class="sort ${r ? 'r' : ''}" data-k="${k}" aria-sort="${sortKey === k ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}">${label}</th>`;
    h += `<div class="block"><h2>All Nifty 50 stocks <span class="muted small">(tap a column to sort)</span></h2><div class="table-wrap"><table class="wide stocks-table"><thead><tr>${th('symbol', 'Stock', false)}${th('close', 'Close')}${th('chg_1d', '1d')}${th('chg_5d', '5d')}${th('chg_20d', '20d')}${th('rsi', 'RSI')}${th('dist_sma20_pct', 'vs 20DMA')}${th('trend', 'Trend', false)}<th class="r">Day range</th></tr></thead><tbody>
      ${stocks.map((x) => `<tr><td><b>${esc(x.symbol)}</b></td><td class="r num">${fmtN(x.close)}</td><td class="r">${sgn(x.chg_1d)}</td><td class="r">${sgn(x.chg_5d)}</td><td class="r">${sgn(x.chg_20d)}</td><td class="r">${rsiTag(x.rsi)}</td><td class="r">${sgn(x.dist_sma20_pct, 1)}</td><td>${trendTag(x.trend)}</td><td class="r num small muted">${fmtN(x.low)} – ${fmtN(x.high)}</td></tr>`).join('')}</tbody></table></div></div>`;
  }
  h += '<p class="small muted mt">Update this brief from Claude Code with <code>/brief</code>. Prices from Yahoo Finance daily candles; Indian stocks can lag by a session until the close is published.</p>';
  ctx.app.innerHTML = h;
  for (const el of ctx.app.querySelectorAll('th.sort')) el.onclick = () => { const k = el.dataset.k; const nd = sortKey === k && dir === 'desc' ? 'asc' : 'desc'; ctx.go(`#/market/${b.date}?s=${k}&d=${nd}`); };
  // section jump-links inside the report
  const secs = ctx.app.querySelectorAll('#report h2');
  secs.forEach((el, i) => { el.id = `sec${i}`; });
  for (const a of ctx.app.querySelectorAll('[data-sec]')) a.onclick = (ev) => { ev.preventDefault(); secs[+a.dataset.sec]?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
}
