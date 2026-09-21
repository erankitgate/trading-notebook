/* Pieces used by more than one view. */

import { esc, li, toast } from '../lib/dom.js';
import { money, cls, niceDate, arr, key, today, addDays, plural } from '../lib/fmt.js';
import { dayNet, dayCharges, mistakeCounts, hasRepeatedMistake, repeatedMistakes, ruleBreakCounts, dayTrades } from '../lib/stats.js';
import { explain } from '../api.js';
import { S } from '../state.js';

/** One diary row for lists. */
export function diaryRow(e, mc) {
  const p = dayNet(e), rep = hasRepeatedMistake(e, mc), broke = arr(e.rules_broken).length;
  const what = e.title || dayTrades(e).map((t) => t.instrument).join(', ') || 'No trades';
  return `<li><a href="#/diary/${esc(e.date)}"><span><span class="when">${niceDate(e.date)}${rep ? '<span class="mini-flag">repeat mistake</span>' : ''}${broke ? `<span class="mini-flag amber">${plural(broke, 'rule')} broken</span>` : ''}</span><span class="what">${esc(what)}</span></span><span class="amt ${cls(p)}">${money(p)}<small>${plural(dayTrades(e).length, 'trade')}${dayCharges(e) ? ' · net' : ''}</small></span></a></li>`;
}
export function diaryList(items, mc = mistakeCounts(S.diary)) {
  return `<ul class="list">${items.map((e) => diaryRow(e, mc)).join('')}</ul>`;
}

/** The red box: pinned reminders + repeated mistakes + rules broken twice in 30 days. */
export function flagsHtml() {
  const rep = repeatedMistakes(S.diary);
  const rb = Object.values(ruleBreakCounts(S.diary, addDays(today(), -30))).filter((r) => r.count >= 2).sort((a, b) => b.count - a.count);
  let h = '<section class="flags" aria-labelledby="fl"><h2 id="fl">Read this before you trade</h2><ul>';
  for (const p of S.pins) h += `<li><span class="pin" aria-hidden="true">!</span><span>${esc(p.text)}</span><button class="x" data-unpin="${esc(p.id)}" aria-label="Remove reminder">×</button></li>`;
  for (const r of rep) h += `<li><span class="count">×${r.count}</span><span><strong>${esc(r.tag)}</strong> — repeated mistake, last on ${niceDate(r.dates[0])}</span></li>`;
  for (const r of rb) h += `<li><span class="count">×${r.count}</span><span><strong>Rule broken:</strong> ${esc(r.text)} — ${r.count} times in 30 days</span></li>`;
  if (!S.pins.length && !rep.length && !rb.length) h += '<li class="empty">Repeated mistakes and broken rules will appear here in red automatically. Add your own reminders below.</li>';
  h += '</ul><form class="add-pin" id="pinForm"><input name="t" placeholder="Add a reminder, e.g. No trades in first 15 minutes" aria-label="New reminder" required maxlength="200"><button class="btn small">Pin</button></form></section>';
  return h;
}
export function bindFlags(root, ctx) {
  const f = root.querySelector('#pinForm');
  if (f) f.onsubmit = async (ev) => {
    ev.preventDefault();
    const t = f.t.value.trim(); if (!t) return;
    const btn = f.querySelector('button'); btn.disabled = true;
    try { await ctx.api.insert('highlights', { text: t }); f.reset(); toast('Pinned'); ctx.reload(); }
    catch (e) { toast(explain(e), 'bad'); } finally { btn.disabled = false; }
  };
  for (const b of root.querySelectorAll('[data-unpin]')) b.onclick = async () => {
    try { await ctx.api.remove('highlights', b.dataset.unpin); ctx.reload(); } catch (e) { toast(explain(e), 'bad'); }
  };
}

export const alertsHtml = (list) => (list.length ? `<div class="alerts">${list.map((a) => `<div class="alert ${a.kind}"><span>${a.kind === 'bad' ? '⛔' : a.kind === 'warn' ? '⚠️' : '✅'}</span><span>${esc(a.text)}</span></div>`).join('')}</div>` : '');

export const planHtml = (e) => {
  const strat = arr(e.next_day_strategy), watch = arr(e.watchlist).filter((w) => w.instrument);
  if (!strat.length && !watch.length) return '';
  let h = `<div class="plan next"><span class="sub small">Written on ${niceDate(e.date)}</span>`;
  if (strat.length) h += `<ul>${li(strat)}</ul>`;
  if (watch.length) h += `<ul class="watch mt">${watch.map(watchRow).join('')}</ul>`;
  return h + '</div>';
};
export const watchRow = (w) => `<li><b>${esc(w.instrument)}${w.bias ? `<span class="bias ${esc(key(w.bias))}">${esc(w.bias)}</span>` : ''}</b><span>${w.levels ? `<span class="num">${esc(w.levels)}</span>` : ''}${w.note ? ` <span class="muted">— ${esc(w.note)}</span>` : ''}</span></li>`;

export const empty = (text, actions = '') => `<div class="empty-box">${text}${actions ? `<div class="acts">${actions}</div>` : ''}</div>`;
