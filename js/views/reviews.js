/* Weekly reviews: one per ISO week, pre-filled with that week's numbers. */

import { esc, attr, li, options, toast, busy } from '../lib/dom.js';
import { money, cls, pct, rmult, niceDate, today, weekStart, addDays, arr, lines, plural } from '../lib/fmt.js';
import { summary, repeatedMistakes, dayNet } from '../lib/stats.js';
import { explain } from '../api.js';
import { S, settings } from '../state.js';
import { empty } from './shared.js';

const weekDays = (ws) => S.diary.filter((e) => e.date >= ws && e.date <= addDays(ws, 6));
const label = (ws) => `${niceDate(ws, { day: 'numeric', month: 'short' })} – ${niceDate(addDays(ws, 6), { day: 'numeric', month: 'short', year: 'numeric' })}`;

export function list(ctx) {
  ctx.setNav('reviews');
  const thisWeek = weekStart(today()), lastWeek = addDays(thisWeek, -7);
  const pending = [lastWeek, thisWeek].filter((ws) => weekDays(ws).length && !S.reviews.some((r) => r.week_start === ws));
  let h = `<div class="head-row"><div><h1>Weekly reviews</h1><p class="sub">Every weekend: what worked, what didn't, the one thing to fix.</p></div><a class="btn" href="#/reviews/${lastWeek}">+ Review last week</a></div>`;
  if (pending.length) h += `<div class="block alerts">${pending.map((ws) => `<a class="alert warn" href="#/reviews/${ws}"><span>📝</span><span>Week of ${niceDate(ws, { day: 'numeric', month: 'short' })} has ${plural(weekDays(ws).length, 'diary day')} and no review yet — write it</span></a>`).join('')}</div>`;
  h += '<div class="block">';
  if (!S.reviews.length && !pending.length) h += empty('No reviews yet. Reviews appear here once you have diary days in a week.');
  for (const r of S.reviews) {
    const s = summary(weekDays(r.week_start), settings());
    h += `<article class="card"><div class="meta">Week of ${label(r.week_start)}${r.grade ? ` · Grade ${esc(r.grade)}` : ''}</div>
      <div class="mini"><span>Net <b class="${cls(s.net)}">${money(s.net)}</b></span><span>${s.greenDays}/${s.days} green</span><span>Win rate <b>${pct(s.winRate)}</b></span><span>Avg R <b>${rmult(s.avgR)}</b></span></div>
      ${arr(r.what_worked).length ? `<div class="small mt"><b>Worked</b><ul>${li(arr(r.what_worked))}</ul></div>` : ''}${arr(r.what_didnt).length ? `<div class="small"><b>Didn't</b><ul>${li(arr(r.what_didnt))}</ul></div>` : ''}${arr(r.focus).length ? `<div class="small"><b>Focus next week</b><ul>${li(arr(r.focus))}</ul></div>` : ''}
      <div class="acts"><a class="btn small ghost" href="#/reviews/${attr(r.week_start)}">Edit</a></div></article>`;
  }
  ctx.app.innerHTML = h + '</div>';
}

export function form(ctx, ws) {
  ctx.setNav('reviews');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ws)) { ctx.go('#/reviews'); return; }
  ws = weekStart(ws);
  const r = S.reviews.find((x) => x.week_start === ws) || {}, isNew = !r.id;
  const days = weekDays(ws), s = summary(days, settings()), rep = repeatedMistakes(days);
  let h = `<p class="sub">Weekly review</p><h1>Week of ${label(ws)}</h1>`;
  h += `<div class="stats"><div class="stat"><small>Net</small><b class="${cls(s.net)}">${money(s.net)}</b></div><div class="stat"><small>Days</small><b>${s.greenDays}/${s.days} green</b></div><div class="stat"><small>Trades</small><b>${s.trades}</b><span class="d">win rate ${pct(s.winRate)}</span></div><div class="stat"><small>Avg R</small><b>${rmult(s.avgR)}</b></div><div class="stat"><small>Rules broken</small><b class="${s.daysWithBreaks ? 'neg' : 'pos'}">${s.daysWithBreaks} days</b></div><div class="stat"><small>Plan followed</small><b>${s.plan.yes}/${s.plan.yes + s.plan.partly + s.plan.no || 0}</b></div></div>`;
  if (days.length) h += `<div class="block"><h2>This week's pages</h2><ul class="list">${days.map((e) => `<li><a href="#/diary/${e.date}"><span class="when">${niceDate(e.date)}</span><span class="amt ${cls(dayNet(e))}">${money(dayNet(e))}</span></a></li>`).join('')}</ul>${rep.length ? `<p class="small neg mt"><b>Repeated this week:</b> ${rep.map((m) => `${esc(m.tag)} ×${m.count}`).join(', ')}</p>` : ''}${days.flatMap((e) => arr(e.lessons)).length ? `<div class="lesson mt"><b class="small">Lessons you wrote</b><ul>${li(days.flatMap((e) => arr(e.lessons)))}</ul></div>` : ''}</div>`;
  h += `<form id="rf" novalidate><fieldset><legend>Review</legend><div class="grid one">
    <div><label>Grade (A = followed the process, whatever the P&amp;L)</label><select name="grade">${options([['', '—'], 'A', 'B', 'C', 'D', 'F'], r.grade || '')}</select></div>
    <div><label>What worked (one per line)</label><textarea name="what_worked">${esc(arr(r.what_worked).join('\n'))}</textarea></div>
    <div><label>What didn't (one per line)</label><textarea name="what_didnt">${esc(arr(r.what_didnt).join('\n'))}</textarea></div>
    <div><label>Focus for next week — one thing (one per line)</label><textarea name="focus">${esc(arr(r.focus).join('\n'))}</textarea></div>
    <div><label>Notes</label><textarea name="notes">${esc(r.notes)}</textarea></div></div></fieldset>
    <div class="form-acts"><button class="btn" type="submit">Save review</button><a class="btn ghost" href="#/reviews">Cancel</a>${isNew ? '' : '<button type="button" class="btn danger right" id="del">Delete</button>'}</div><div class="err" id="err" role="alert"></div></form>`;
  ctx.app.innerHTML = h;
  const f = ctx.app.querySelector('#rf'), err = f.querySelector('#err');
  const del = f.querySelector('#del');
  if (del) del.onclick = async () => { if (!confirm('Delete this review?')) return; try { await ctx.api.remove('reviews', r.id); toast('Deleted'); await ctx.reload(); ctx.go('#/reviews'); } catch (e) { toast(explain(e), 'bad'); } };
  f.onsubmit = (ev) => {
    ev.preventDefault(); err.textContent = '';
    const row = { week_start: ws, grade: f.grade.value || null, what_worked: lines(f.what_worked.value), what_didnt: lines(f.what_didnt.value), focus: lines(f.focus.value), notes: f.notes.value.trim() || null };
    busy(f.querySelector('[type=submit]'), 'Saving…', async () => {
      try { if (isNew) await ctx.api.insert('reviews', row); else await ctx.api.update('reviews', r.id, row); toast('Saved'); await ctx.reload(); ctx.go('#/reviews'); } catch (e) { err.textContent = explain(e); }
    });
  };
}
