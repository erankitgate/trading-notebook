/* Live panel: index tape, today's trade plans against live prices, option-chain snapshot.
   Polls the market-live edge function every 15 s while NSE is open; once when closed. */

import { esc, attr, toast, options } from '../lib/dom.js';
import { money, cls, rmult, niceDate, today, num, round2, arr } from '../lib/fmt.js';
import { explain } from '../api.js';
import { S } from '../state.js';
import { requireChecklist } from './checklistGate.js';
import { payoffGrid, premiumAt } from '../lib/options.js';

const INDEX_KEYS = ['NSE_INDEX|Nifty 50', 'NSE_INDEX|Nifty Bank', 'NSE_INDEX|India VIX'];
const NAMES = { 'NSE_INDEX|Nifty 50': 'Nifty 50', 'NSE_INDEX|Nifty Bank': 'Bank Nifty', 'NSE_INDEX|India VIX': 'India VIX' };
const POLL_OPEN = 15000, POLL_CLOSED = 120000;

/** NSE-style scrolling ticker strip from the latest brief's stock list (end-of-day data, clearly labelled). */
function tickerStrip(stocks) {
  const items = stocks.map((x) => `<span class="tk ${x.chg_1d > 0 ? 'pos' : x.chg_1d < 0 ? 'neg' : ''}">${esc(x.symbol)} <b class="num">${fmtN(x.close, x.close >= 1000 ? 0 : 2)}</b> <i>${x.chg_1d > 0 ? '▲' : x.chg_1d < 0 ? '▼' : '•'} ${x.chg_1d == null ? '' : `${x.chg_1d > 0 ? '+' : ''}${x.chg_1d.toFixed(2)}%`}</i></span>`).join('');
  return `<div class="ticker-wrap" aria-label="Nifty 50 stocks, from today's brief"><div class="ticker-track">${items}${items}</div></div>`;
}

/** Flash a value green/up or red/down for a moment when it changes between polls — the NSE-ticker feel. */
function flashChanges(box, prevVals) {
  for (const el of box.querySelectorAll('[data-qk]')) {
    const qk = el.dataset.qk, val = el.textContent.replace(/[^0-9.-]/g, '');
    const prev = prevVals.get(qk);
    if (prev != null && prev !== val) { el.classList.add(parseFloat(val) > parseFloat(prev) ? 'flash-up' : 'flash-down'); setTimeout(() => el.classList.remove('flash-up', 'flash-down'), 900); }
    prevVals.set(qk, val);
  }
}

/** NSE cash hours in IST, Mon–Fri (holidays ignored — the tape just stops moving). */
export function marketOpen(d = new Date()) {
  const ist = new Date(d.getTime() + (330 + d.getTimezoneOffset()) * 60000);
  const day = ist.getDay(), m = ist.getHours() * 60 + ist.getMinutes();
  return day >= 1 && day <= 5 && m >= 9 * 60 + 15 && m <= 15 * 60 + 30;
}
const fmtN = (v, d = 2) => (v == null ? '–' : Number(v).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }));
const dist = (from, to) => (from == null || to == null || !from ? null : ((to - from) / from) * 100);

function plansFor(date) { return S.plans.filter((p) => p.date === date && p.status !== 'cancelled').sort((a, b) => a.sort - b.sort); }
function planKeys(plans) { return [...new Set(plans.map((p) => p.instrument_key).filter(Boolean))]; }

/** Unrealised P&L and R for a live plan. */
function planPnl(p, ltp) {
  if (p.status !== 'live' || ltp == null || p.fill == null || !p.qty) return null;
  const pnl = round2((p.side === 'Sell' ? p.fill - ltp : ltp - p.fill) * p.qty);
  const risk = p.stop != null ? Math.abs(p.fill - p.stop) * p.qty : null;
  return { pnl, r: risk ? round2(pnl / risk) : null };
}

const daysUntil = (iso) => { if (!iso) return null; const d = new Date(`${iso}T15:30:00+05:30`); return Math.max(0, Math.ceil((d - new Date()) / 86400000)); };

/** Payoff-scenario table for an option plan: P&L at Nifty spot offsets, using Black-Scholes with the plan's own IV. */
function payoffTable(p, niftySpot) {
  if (!p.option_type || !p.strike || niftySpot == null) return '';
  const days = daysUntil(p.expiry);
  const offsets = [-200, -100, -50, 0, 50, 100, 200];
  const grid = payoffGrid(p, niftySpot, days ?? 14, p.iv ?? 15, offsets);
  const premiumNow = grid.find((g) => g.offset === 0);
  return `<div class="payoff mt"><div class="small muted">If Nifty opens from here (spot ${fmtN(niftySpot, 0)}, ${days ?? '?'} days to ${p.expiry ? niceDate(p.expiry, { day: 'numeric', month: 'short' }) : 'expiry'}, IV ${p.iv ?? 15}% assumed — <b>estimated with Black-Scholes, not your broker's live premium</b>. Tell me the real LTP/IV any time and I'll recalibrate this exactly.</div>
    <div class="table-wrap mt"><table class="payoff-t"><thead><tr><th>Nifty opens</th>${grid.map((g) => `<th class="r ${g.offset === 0 ? 'now' : ''}">${g.offset === 0 ? 'now' : `${g.offset > 0 ? '+' : ''}${g.offset}`}</th>`).join('')}</tr></thead>
    <tbody><tr><td>Spot</td>${grid.map((g) => `<td class="r num ${g.offset === 0 ? 'now' : ''}">${fmtN(g.spot, 0)}</td>`).join('')}</tr>
    <tr><td>Est. premium</td>${grid.map((g) => `<td class="r num ${g.offset === 0 ? 'now' : ''}">${fmtN(g.premium)}</td>`).join('')}</tr>
    <tr><td>Est. P&amp;L</td>${grid.map((g) => `<td class="r num ${cls(g.pnl)} ${g.offset === 0 ? 'now' : ''}">${money(g.pnl, { compact: true })}</td>`).join('')}</tr></tbody></table></div>
    ${premiumNow ? `<div class="small muted mt">At the current spot, this position is roughly ${cls(premiumNow.pnl) === 'pos' ? 'up' : 'down'} <b class="${cls(premiumNow.pnl)}">${money(premiumNow.pnl)}</b> — an estimate; check the LTP above for the real mark.</div>` : ''}</div>`;
}

/** One-line summary for the compact (Home) view: instrument, status, unrealised P&L, distance to entry. */
function planLine(p, quotes, niftySpot) {
  const isOption = !!(p.option_type && p.strike);
  const q = !isOption && p.instrument_key ? quotes[p.instrument_key.replace('|', ':')] : null;
  const estPremium = isOption && niftySpot != null ? premiumAt(p, niftySpot, daysUntil(p.expiry) ?? 14, p.iv ?? 15) : null;
  const ltp = isOption ? (estPremium != null ? round2(estPremium) : null) : (q?.last_price ?? null);
  const pl = planPnl(p, ltp);
  const ref = p.status === 'live' ? p.fill : p.entry;
  const away = p.status === 'waiting' && ref != null && ltp != null ? dist(ref, ltp) : null;
  return `<a class="live-line st-${p.status}" href="#/live"><span class="tag small ${p.side === 'Sell' ? 'bad' : 'good'}">${esc(p.side)}</span><b>${esc(p.instrument)}</b>
    <span class="tag small">${p.status === 'live' ? 'IN TRADE' : p.status === 'done' ? 'closed' : 'waiting'}</span>
    ${pl ? `<b class="num ${cls(pl.pnl)}">${money(pl.pnl, { compact: true })}</b>` : away != null ? `<span class="muted small">${away > 0 ? '+' : ''}${away.toFixed(2)}% away</span>` : p.status === 'done' && p.exit != null ? `<b class="num ${cls((p.exit - p.fill) * (p.side === 'Sell' ? -1 : 1))}">${money((p.exit - p.fill) * (p.side === 'Sell' ? -1 : 1) * (p.qty || 1), { compact: true })}</b>` : ''}</a>`;
}

function planRow(p, quotes, niftySpot) {
  const isOption = !!(p.option_type && p.strike);
  // For an option plan, "LTP" is an estimate from Black-Scholes off the live underlying — the app has no
  // per-contract options feed. For an index/stock plan the instrument_key quote IS the tradable instrument.
  const q = !isOption && p.instrument_key ? quotes[p.instrument_key.replace('|', ':')] : null;
  const estPremium = isOption && niftySpot != null ? premiumAt(p, niftySpot, daysUntil(p.expiry) ?? 14, p.iv ?? 15) : null;
  const ltp = isOption ? (estPremium != null ? round2(estPremium) : null) : (q?.last_price ?? null);
  const pl = planPnl(p, ltp);
  const ref = p.status === 'live' ? p.fill : p.entry;
  const toStop = p.stop != null && ltp != null ? ltp - p.stop : null, toTarget = p.target != null && ltp != null ? p.target - ltp : null;
  const hit = ltp != null && p.status === 'live' && p.stop != null && (p.side === 'Sell' ? ltp >= p.stop : ltp <= p.stop);
  const tgt = ltp != null && p.status === 'live' && p.target != null && (p.side === 'Sell' ? ltp <= p.target : ltp >= p.target);
  const near = ltp != null && p.status === 'waiting' && p.entry != null && Math.abs(dist(p.entry, ltp)) <= 0.25;
  return `<div class="plan-row st-${p.status} ${hit ? 'hit' : tgt ? 'tgt' : near ? 'near' : ''}" data-plan="${attr(p.id)}" data-date="${attr(p.date)}">
    <div class="head"><b>${esc(p.instrument)}</b> <span class="tag ${p.side === 'Sell' ? 'bad' : 'good'}">${esc(p.side)}</span> <span class="tag">${p.status === 'live' ? 'IN TRADE' : p.status === 'done' ? 'closed' : 'waiting'}</span>${p.qty ? `<span class="muted small"> · qty ${p.qty}</span>` : ''}${isOption ? '<span class="tag warn">est. premium</span>' : ''}</div>
    <div class="lv"><span><small>${isOption ? 'Est. LTP' : 'LTP'}</small><b class="num" data-qk="plan:${esc(p.id)}">${ltp != null ? fmtN(ltp) : '—'}</b>${q?.net_change != null ? `<i class="${cls(q.net_change)}">${q.net_change > 0 ? '+' : ''}${fmtN(q.net_change)}</i>` : ''}${isOption && niftySpot != null ? `<i class="muted">Nifty ${fmtN(niftySpot, 0)}</i>` : ''}</span>
      <span><small>${p.status === 'live' ? 'Fill' : 'Entry'}</small><b class="num">${ref != null ? fmtN(ref) : '—'}</b>${ltp != null && ref != null && p.status === 'waiting' ? `<i class="muted">${dist(ref, ltp) > 0 ? '+' : ''}${dist(ref, ltp).toFixed(2)}% away</i>` : ''}</span>
      <span><small>Stop</small><b class="num neg">${p.stop != null ? fmtN(p.stop) : '—'}</b>${toStop != null ? `<i class="${hit ? 'neg' : 'muted'}">${hit ? 'STOP HIT' : `${fmtN(Math.abs(toStop), 0)} away`}</i>` : ''}</span>
      <span><small>Target</small><b class="num pos">${p.target != null ? fmtN(p.target) : '—'}</b>${toTarget != null ? `<i class="${tgt ? 'pos' : 'muted'}">${tgt ? 'TARGET HIT' : `${fmtN(Math.abs(toTarget), 0)} away`}</i>` : ''}</span>
      ${pl ? `<span><small>Unrealised</small><b class="num ${cls(pl.pnl)}">${money(pl.pnl)}</b><i class="${pl.r == null ? '' : cls(pl.r)}">${rmult(pl.r)}</i></span>` : ''}</div>
    ${p.condition ? `<div class="small muted">Only if: ${esc(p.condition)}</div>` : ''}${p.note ? `<div class="small muted">${esc(p.note)}</div>` : ''}
    ${p.status === 'live' && !p.stop ? '<div class="small neg" style="font-weight:700">⚠ No stop is set on this position.</div>' : ''}
    ${p.status === 'live' ? payoffTable(p, niftySpot) : ''}
    <div class="acts">${p.status === 'waiting' ? `<button type="button" class="btn small" data-act="live">Mark in trade</button>` : ''}${p.status === 'live' ? `<button type="button" class="btn small" data-act="done">Close</button>` : ''}${p.status !== 'done' ? `<button type="button" class="btn small ghost" data-act="cancel">Cancel</button>` : ''}</div></div>`;
}

/** Full page: date picker across recent sessions + the live panel. */
export function render(ctx) {
  ctx.setNav('live');
  const dates = [...new Set([today(), ...S.plans.map((p) => p.date), ...S.briefs.map((b) => b.date)])].sort().reverse().slice(0, 14);
  const date = dates.includes(ctx.query.get('d')) ? ctx.query.get('d') : dates[0] || today();
  ctx.app.innerHTML = `<div class="head-row"><div><h1>Live</h1><p class="sub">Index tape, today's plans against live prices, and the option chain.</p></div>
    <div class="chips">${dates.map((d) => `<a class="chip" href="#/live?d=${d}" aria-pressed="${d === date}">${d === today() ? 'Today' : niceDate(d, { day: 'numeric', month: 'short' })}</a>`).join('')}</div></div>
    <section id="livePanel"></section>`;
  mount(ctx.app.querySelector('#livePanel'), ctx, { date });
}

/** Mount the live panel into `box`; returns a stop() function. */
export function mount(box, ctx, { date = today(), compact = false } = {}) {
  const plans = plansFor(date);
  const keys = [...INDEX_KEYS, ...planKeys(plans)];
  let timer = null, quotes = {}, chain = null, lastAt = null, err = null; const prevVals = new Map();

  const draw = () => {
    const open = marketOpen();
    let h = `<div class="section-head"><h2>Live · ${niceDate(date, { weekday: 'short', day: 'numeric', month: 'short' })}</h2><span class="live ${err ? 'off' : open ? 'on' : ''}"><i></i><span>${err ? esc(err) : open ? 'NSE open' : 'Market closed'}${lastAt ? ` · ${lastAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''}</span></span></div>`;
    h += `<div class="tape">${INDEX_KEYS.map((k) => { const qk = k.replace('|', ':'); const q = quotes[qk]; const chg = q?.net_change, pct = q && q.ohlc?.close ? (chg / q.ohlc.close) * 100 : null; return `<div class="t big ${chg > 0 ? 'pos' : chg < 0 ? 'neg' : ''}"><small>${NAMES[k]}</small><b class="num" data-qk="${esc(qk)}">${q ? fmtN(q.last_price, k.includes('VIX') ? 2 : 1) : '—'}</b><span class="c ${chg > 0 ? 'pos' : chg < 0 ? 'neg' : 'muted'}">${chg != null ? `${chg > 0 ? '+' : ''}${fmtN(chg, k.includes('VIX') ? 2 : 1)}${pct != null ? ` (${pct > 0 ? '+' : ''}${pct.toFixed(2)}%)` : ''}` : ''}</span>${q?.ohlc ? `<span class="rng num">${fmtN(q.ohlc.low, 0)} – ${fmtN(q.ohlc.high, 0)}</span>` : ''}</div>`; }).join('')}</div>`;
    if (!compact) { const brief = S.briefs.find((b) => b.date === date) || S.briefs[0]; if (brief && arr(brief.stocks).length) h += tickerStrip(brief.stocks); }
    const niftySpot = quotes['NSE_INDEX:Nifty 50']?.last_price ?? S.briefs.find((b) => b.date === date)?.nifty?.close;
    if (compact) {
      if (plans.length) h += `<div class="plans-compact">${plans.map((p) => planLine(p, quotes, niftySpot)).join('')}</div><a class="btn small ghost mt" href="#/live">Open the live board →</a>`;
      else h += `<p class="small muted mt">No trade plan for this session. <a href="#/live">Add one</a> or run <code>/brief</code>.</p>`;
      box.innerHTML = h; return;
    }
    if (plans.length) h += `<div class="plans">${plans.map((p) => planRow(p, quotes, niftySpot)).join('')}</div>`;
    else h += `<p class="small muted mt">No trade plan for this session. Add one below or run <code>/brief</code>.</p>`;
    if (chain) {
      const rows = chain.filter((r) => r.call_options && r.put_options);
      const tc = rows.reduce((s, r) => s + (r.call_options.market_data.oi || 0), 0), tp = rows.reduce((s, r) => s + (r.put_options.market_data.oi || 0), 0);
      const mc = rows.reduce((a, r) => (r.call_options.market_data.oi > (a?.call_options.market_data.oi || 0) ? r : a), null), mp = rows.reduce((a, r) => (r.put_options.market_data.oi > (a?.put_options.market_data.oi || 0) ? r : a), null);
      const spot = quotes['NSE_INDEX:Nifty 50']?.last_price, atm = spot ? rows.reduce((a, r) => (Math.abs(r.strike_price - spot) < Math.abs((a?.strike_price ?? 1e9) - spot) ? r : a), null) : null;
      h += `<div class="mini mt"><span>Live chain ${esc(chain.expiry || '')}</span><span>PCR <b>${tc ? (tp / tc).toFixed(2) : '–'}</b></span><span>Call wall (resistance) <b class="num neg">${mc ? fmtN(mc.strike_price, 0) : '–'}</b></span><span>Put wall (support) <b class="num pos">${mp ? fmtN(mp.strike_price, 0) : '–'}</b></span>${atm ? `<span>ATM ${fmtN(atm.strike_price, 0)} straddle <b class="num">${fmtN((atm.call_options.market_data.ltp || 0) + (atm.put_options.market_data.ltp || 0), 1)}</b></span>` : ''}</div>`;
    } else {
      const brief = S.briefs.find((b) => b.date === date) || S.briefs[0], oi = brief?.oi;
      if (oi?.weekly || oi?.monthly) {
        const c = (o, label) => o ? `<span>${label} PCR <b>${o.pcr}</b></span><span>call wall <b class="num neg">${fmtN(o.max_call, 0)}</b></span><span>put wall <b class="num pos">${fmtN(o.max_put, 0)}</b></span>${o.straddle ? `<span>straddle <b class="num">${o.straddle}</b> (±${o.expected_move})</span>` : ''}` : '';
        h += `<div class="mini mt">${c(oi.monthly, 'Monthly')}</div><p class="small muted">From this session's brief (not live) — <a href="#/market/${esc(brief.date)}">see the full option chain</a>.</p>`;
      }
    }
    if (!compact) h += `<details class="mt"><summary class="small muted">Add a plan for this session</summary><form id="planForm" class="grid mt">
        <div class="span"><label>Instrument</label><input name="instrument" placeholder="NIFTY spot / NIFTY 29 SEP 23500 CE" required></div>
        <div><label>Upstox key (for live price)</label><input name="instrument_key" placeholder="NSE_INDEX|Nifty 50"></div>
        <div><label>Side</label><select name="side">${options(['Buy', 'Sell'], 'Buy')}</select></div>
        <div><label>Entry</label><input name="entry" type="number" step="any" inputmode="decimal"></div><div><label>Stop</label><input name="stop" type="number" step="any" inputmode="decimal"></div><div><label>Target</label><input name="target" type="number" step="any" inputmode="decimal"></div><div><label>Qty</label><input name="qty" type="number" step="1" inputmode="numeric"></div>
        <div class="span"><label>Only if (condition)</label><input name="condition" placeholder="Gap-up holds R1 for 15 minutes"></div>
        <div class="span form-acts"><button class="btn small" type="submit">Add plan</button></div></form></details>`;
    box.innerHTML = h;
    flashChanges(box, prevVals);
    bind();
  };

  const bind = () => {
    for (const b of box.querySelectorAll('[data-act]')) b.onclick = async () => {
      const row = b.closest('[data-plan]'), p = S.plans.find((x) => x.id === row.dataset.plan); if (!p) return;
      const act = b.dataset.act;
      let patch = null;
      if (act === 'live') { if (row.dataset.date === today() && !requireChecklist(today())) return; const fill = num(prompt(`Fill price for ${p.instrument}?`, p.entry ?? '')); if (fill == null) return; patch = { status: 'live', fill }; }
      if (act === 'done') { const exit = num(prompt(`Exit price for ${p.instrument}?`, '')); if (exit == null) return; patch = { status: 'done', exit }; }
      if (act === 'cancel') { if (!confirm('Cancel this plan?')) return; patch = { status: 'cancelled' }; }
      try { await ctx.api.update('trade_plans', p.id, patch); toast('Plan updated'); await ctx.reload(); } catch (e) { toast(explain(e), 'bad'); }
    };
    const f = box.querySelector('#planForm');
    if (f) f.onsubmit = async (ev) => {
      ev.preventDefault();
      if (date === today() && !requireChecklist(date)) return;
      const row = { date, instrument: f.instrument.value.trim(), instrument_key: f.instrument_key.value.trim() || null, side: f.side.value, entry: num(f.entry.value), stop: num(f.stop.value), target: num(f.target.value), qty: num(f.qty.value), condition: f.condition.value.trim() || null, sort: plans.length + 1 };
      if (!row.instrument) return;
      try { await ctx.api.insert('trade_plans', row); toast('Plan added'); await ctx.reload(); } catch (e) { toast(explain(e), 'bad'); }
    };
  };

  const poll = async () => {
    try {
      const q = await ctx.api.live('quote', { keys: keys.join(',') });
      quotes = q || {}; lastAt = new Date(); err = null;
      const brief = S.briefs.find((b) => b.date === date) || S.briefs[0];
      const exp = brief?.oi?.monthly?.expiry;
      if (exp && (!chain || Date.now() - chain.at > 60000)) { const c = await ctx.api.live('chain', { key: 'NSE_INDEX|Nifty 50', expiry: exp }); if (Array.isArray(c)) { chain = c; chain.expiry = exp; chain.at = Date.now(); } }
    } catch (e) { err = /not configured/.test(e.message) ? 'Live data not set up yet' : e.message; }
    draw();
    timer = setTimeout(poll, marketOpen() ? POLL_OPEN : POLL_CLOSED);
  };
  draw(); poll();
  const stop = () => clearTimeout(timer);
  ctx.onLeave(stop);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearTimeout(timer); else if (box.isConnected) { clearTimeout(timer); poll(); } });
  return stop;
}
