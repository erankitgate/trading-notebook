/* Diary: list of days (grouped by month, filterable) and the day page. */

import { esc, li } from '../lib/dom.js';
import { money, cls, rmult, niceDate, monthKey, monthLabel, arr, key, plural, num } from '../lib/fmt.js';
import { dayNet, dayGross, dayCharges, dayTrades, mistakeCounts, hasRepeatedMistake, tradePnl, tradeR, tradeRisk, tradeRR, dayLimits } from '../lib/stats.js';
import { S, settings } from '../state.js';
import { diaryRow, empty, alertsHtml, watchRow } from './shared.js';

const FILTERS = [['all', 'All'], ['green', 'Green'], ['red', 'Red'], ['repeat', 'Repeat mistakes'], ['rules', 'Rules broken'], ['plan-no', 'Plan not followed']];

export function list(ctx) {
  ctx.setNav('diary');
  const q = ctx.query, filter = q.get('f') || 'all', search = (q.get('q') || '').trim();
  const mc = mistakeCounts(S.diary);
  const match = (e) => {
    const n = dayNet(e);
    if (filter === 'green' && !(n > 0)) return false;
    if (filter === 'red' && !(n < 0)) return false;
    if (filter === 'repeat' && !hasRepeatedMistake(e, mc)) return false;
    if (filter === 'rules' && !arr(e.rules_broken).length) return false;
    if (filter === 'plan-no' && e.plan_followed !== 'no') return false;
    if (search) {
      const hay = [e.title, e.market, e.mood, e.notes, ...dayTrades(e).flatMap((t) => [t.instrument, t.setup, t.reason, t.result]), ...arr(e.mistakes).flatMap((m) => [m.tag, m.detail]), ...arr(e.lessons), ...arr(e.next_day_strategy)].join(' ').toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  };
  const items = S.diary.filter(match);

  let h = `<div class="head-row"><div><h1>Daily trade diary</h1><p class="sub">Newest first. Tap a day to open its page.</p></div><a class="btn" href="#/diary/new">+ New day</a></div>`;
  h += `<form class="filters" id="filters"><input type="search" name="q" value="${esc(search)}" placeholder="Search instrument, setup, mistake, lesson…" aria-label="Search diary"><div class="chips">${FILTERS.map(([v, l]) => `<button type="button" class="chip" data-f="${v}" aria-pressed="${v === filter}">${l}</button>`).join('')}</div></form>`;

  if (!S.diary.length) h += `<div class="block">${empty('<strong>No diary pages yet.</strong> Tap “New day” to write your first page.')}</div>`;
  else if (!items.length) h += `<div class="block">${empty('Nothing matches this filter.')}</div>`;
  else {
    let cur = null;
    for (const e of items) {
      const m = monthKey(e.date);
      if (m !== cur) {
        if (cur) h += '</ul>';
        const month = items.filter((x) => monthKey(x.date) === m), net = month.reduce((s, x) => s + dayNet(x), 0);
        h += `<div class="month-head"><b>${monthLabel(m)}</b><span>${plural(month.length, 'day')} · <span class="${cls(net)}">${money(net)}</span></span></div><ul class="list">`;
        cur = m;
      }
      h += diaryRow(e, mc);
    }
    h += '</ul>';
  }
  ctx.app.innerHTML = h;

  const f = ctx.app.querySelector('#filters');
  const nav = (fv, qv) => { const p = new URLSearchParams(); if (fv !== 'all') p.set('f', fv); if (qv) p.set('q', qv); ctx.go(`#/diary${p.toString() ? '?' + p : ''}`); };
  for (const c of f.querySelectorAll('.chip')) c.onclick = () => nav(c.dataset.f, f.q.value.trim());
  let timer; f.q.oninput = () => { clearTimeout(timer); timer = setTimeout(() => nav(filter, f.q.value.trim()), 250); };
  f.onsubmit = (ev) => { ev.preventDefault(); nav(filter, f.q.value.trim()); };
  if (search) { const inp = f.q; inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
}

export function entry(ctx, date) {
  ctx.setNav('diary');
  const i = S.diary.findIndex((e) => e.date === date);
  if (i < 0) { ctx.app.innerHTML = `<h1>Page not found</h1><p class="sub">No diary page for ${esc(date)}.</p><p class="mt"><a class="btn" href="#/diary/new?date=${esc(date)}">Create it</a> <a class="btn ghost" href="#/diary">Back to diary</a></p>`; return; }
  const e = S.diary[i], prev = S.diary[i + 1], next = S.diary[i - 1];
  const mc = mistakeCounts(S.diary), net = dayNet(e), gross = dayGross(e), charges = dayCharges(e), cfg = settings();

  let h = `<div class="entry-head"><div><p class="sub">Diary page</p><h1>${niceDate(e.date)}</h1>${e.title ? `<p class="sub">${esc(e.title)}</p>` : ''}</div>
    <div><div class="bigpnl ${cls(net)}">${money(net)}<small>day P&amp;L${charges ? ' (net)' : ''}</small></div>${charges ? `<div class="pnl-break"><span>gross <b class="num">${money(gross)}</b></span><span>charges <b class="num">₹${charges.toLocaleString('en-IN')}</b></span></div>` : ''}</div></div>`;
  const tags = [];
  if (e.market) tags.push(['', `Market: ${e.market}`]); if (e.mood) tags.push(['', `Mood: ${e.mood}`]);
  if (e.plan_followed) tags.push([{ yes: 'good', partly: 'warn', no: 'bad' }[e.plan_followed], { yes: 'Followed the plan', partly: 'Partly followed the plan', no: 'Did not follow the plan' }[e.plan_followed]]);
  h += `<div class="tags">${tags.map(([c, t]) => `<span class="tag ${c}">${esc(t)}</span>`).join('')}<a class="btn small ghost" href="#/diary/${esc(e.date)}/edit">Edit page</a></div>`;
  h += alertsHtml(dayLimits(e, cfg));

  /* yesterday's plan */
  h += '<div class="block"><h2>Yesterday\'s plan</h2>';
  if (prev && (arr(prev.next_day_strategy).length || arr(prev.watchlist).length)) {
    h += `<div class="plan prev"><span class="sub small">From ${niceDate(prev.date)}</span>${arr(prev.next_day_strategy).length ? `<ul>${li(arr(prev.next_day_strategy))}</ul>` : ''}${arr(prev.watchlist).filter((w) => w.instrument).length ? `<ul class="watch mt">${arr(prev.watchlist).filter((w) => w.instrument).map(watchRow).join('')}</ul>` : ''}`;
    if (e.plan_followed) h += `<div class="follow ${esc(e.plan_followed)}">${{ yes: 'I followed the plan', partly: 'I partly followed the plan', no: 'I did not follow the plan' }[e.plan_followed]}${e.plan_note ? ` — ${esc(e.plan_note)}` : ''}</div>`;
    h += '</div>';
  } else h += '<p class="sub">No plan saved from the previous day.</p>';
  h += '</div>';

  /* checklist */
  const cl = arr(e.checklist).filter((c) => c && c.item);
  if (cl.length) { const done = cl.filter((c) => c.done).length; h += `<div class="block"><h2>Pre-market checklist <span class="muted small">${done}/${cl.length}</span></h2><ul class="check">${cl.map((c) => `<li class="${c.done ? 'done' : ''}">${esc(c.item)}</li>`).join('')}</ul></div>`; }

  /* trades */
  const tr = dayTrades(e);
  h += '<div class="block"><h2>Trades</h2>';
  if (tr.length) {
    const anyR = tr.some((t) => tradeRisk(t) != null);
    h += `<div class="table-wrap"><table class="wide"><thead><tr><th>Instrument</th><th>Side</th><th class="r">Qty</th><th class="r">Entry</th><th class="r">Stop</th><th class="r">Exit</th><th class="r">P&amp;L</th>${anyR ? '<th class="r">R</th>' : ''}</tr></thead><tbody>`;
    for (const t of tr) {
      const sc = key(t.side) === 'sell' ? 'side-s' : 'side-b', pnl = tradePnl(t), r = tradeR(t), rr = tradeRR(t), risk = tradeRisk(t);
      const meta = [t.setup ? `Setup: ${t.setup}` : '', t.time_in ? `In ${t.time_in}${t.time_out ? ` → out ${t.time_out}` : ''}` : '', risk ? `Risk ₹${risk.toLocaleString('en-IN')}${rr ? ` · planned ${rr}:1` : ''}` : ''].filter(Boolean).join(' · ');
      h += `<tr><td><strong>${esc(t.instrument)}</strong>${meta ? `<div class="why">${esc(meta)}</div>` : ''}${t.reason ? `<div class="why">Why: ${esc(t.reason)}</div>` : ''}${t.result ? `<div class="why">What happened: ${esc(t.result)}</div>` : ''}</td>
        <td class="${sc}">${esc(t.side)}</td><td class="r">${t.qty ?? ''}</td><td class="r">${t.entry != null ? '₹' + esc(t.entry) : ''}</td><td class="r">${t.stop != null ? '₹' + esc(t.stop) : '<span class="why">–</span>'}</td>
        <td class="r">${t.exit != null ? '₹' + esc(t.exit) : '<span class="why">open</span>'}</td><td class="r ${pnl != null ? cls(pnl) : ''}"><strong>${pnl != null ? money(pnl) : '–'}</strong></td>${anyR ? `<td class="r ${r != null ? cls(r) : ''}">${rmult(r)}</td>` : ''}</tr>`;
    }
    h += `</tbody><tfoot><tr><td colspan="6">Gross${charges ? ` − ₹${charges.toLocaleString('en-IN')} charges = <span class="${cls(net)}">${money(net)}</span> net` : ''}</td><td class="r ${cls(gross)}">${money(gross)}</td>${anyR ? '<td></td>' : ''}</tr></tfoot></table></div>`;
  } else h += '<p class="sub">No trades taken.</p>';
  h += '</div>';

  /* rules broken + mistakes */
  const rb = arr(e.rules_broken);
  if (rb.length) h += `<div class="block"><h2>Rules broken</h2><ul class="rules-broken">${rb.map((r) => `<li>${esc(typeof r === 'string' ? r : r.text)}</li>`).join('')}</ul></div>`;
  const ms = arr(e.mistakes);
  h += '<div class="block"><h2>Mistakes</h2>';
  if (ms.length) h += `<ul class="mist">${ms.map((x) => { const c = mc[key(x.tag)], rep = c && c.count >= 2; return `<li class="${rep ? 'rep' : ''}"><span class="mt">${esc(x.tag)}${rep ? ` — repeated ×${c.count}` : ''}</span>${x.detail ? `<span class="md">${esc(x.detail)}</span>` : ''}</li>`; }).join('')}</ul>`;
  else h += '<p class="sub">No mistakes recorded. Nice.</p>';
  h += '</div>';

  if (arr(e.went_well).length) h += `<div class="block"><h2>What went well</h2><div class="good"><ul>${li(arr(e.went_well))}</ul></div></div>`;
  if (arr(e.lessons).length) h += `<div class="block"><h2>Lesson of the day</h2><div class="lesson"><ul>${li(arr(e.lessons))}</ul></div></div>`;

  /* next day */
  const watch = arr(e.watchlist).filter((w) => w.instrument);
  h += `<div class="block"><h2>Strategy for next day</h2>${arr(e.next_day_strategy).length || watch.length ? `<div class="plan next">${arr(e.next_day_strategy).length ? `<ul>${li(arr(e.next_day_strategy))}</ul>` : ''}${watch.length ? `<ul class="watch mt">${watch.map(watchRow).join('')}</ul>` : ''}</div>` : '<p class="sub">No plan written yet.</p>'}</div>`;
  if (e.notes) h += `<div class="block"><h2>Notes</h2><p>${esc(e.notes).replace(/\n/g, '<br>')}</p></div>`;

  h += `<div class="pager">${prev ? `<a href="#/diary/${esc(prev.date)}">‹ ${niceDate(prev.date)}</a>` : ''}<span></span>${next ? `<a href="#/diary/${esc(next.date)}">${niceDate(next.date)} ›</a>` : ''}</div>`;
  ctx.app.innerHTML = h;
}
