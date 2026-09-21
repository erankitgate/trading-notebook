/* Daily learning: notes with key points and a link to the full guide. */

import { esc, attr, li, toast, busy } from '../lib/dom.js';
import { niceDate, today, arr, lines, key } from '../lib/fmt.js';
import { explain } from '../api.js';
import { S } from '../state.js';
import { empty } from './shared.js';

export const OPTION_CHAIN_NOTE = {
  date: '2026-09-21',
  title: 'Option chain explained: LTP, OI, IV, Delta, Gamma, Theta, Vega, Rho',
  summary: 'How to read every column of an option chain, using the Laurus Labs 2,000 strike as the example.',
  points: [
    'LTP = current price of the option. OI = open contracts; highest Call OI acts like resistance, highest Put OI like support.',
    'Delta = how much the option moves when the stock moves ₹1 (call 0.60 means ₹0.60).',
    'Gamma = how fast delta changes. Gets big near expiry, so prices get jumpy.',
    'Theta = money lost every day from time passing. Always hurts option buyers.',
    'IV = expected movement. High IV means expensive options. Watch out for IV crush after results.',
    'Vega = price change for 1 point of IV. Rho = interest-rate effect, can be ignored short term.',
  ],
  url: 'https://claude.ai/artifact/EN5MxFBRKkbHbdwBjXtUTF',
  tags: ['Options', 'Greeks'],
};
const safeUrl = (u) => /^https:\/\/[^\s"'<>]+$/i.test(u || '') ? u : null;

export function list(ctx) {
  ctx.setNav('learn');
  const tag = ctx.query.get('tag') || '', q = (ctx.query.get('q') || '').trim().toLowerCase();
  const tags = [...new Set(S.learn.flatMap((l) => arr(l.tags)))].sort((a, b) => a.localeCompare(b));
  const items = S.learn.filter((l) => (!tag || arr(l.tags).some((t) => key(t) === key(tag))) && (!q || [l.title, l.summary, ...arr(l.points), ...arr(l.tags)].join(' ').toLowerCase().includes(q)));

  let h = `<div class="head-row"><div><h1>Daily learning</h1><p class="sub">New concepts, explained simply, with a link to the full guide.</p></div><a class="btn" href="#/learn/new">+ New note</a></div>`;
  if (S.learn.length) h += `<form class="filters" id="lf"><input type="search" name="q" value="${attr(ctx.query.get('q') || '')}" placeholder="Search notes…" aria-label="Search notes"><div class="chips"><a class="chip" href="#/learn" aria-pressed="${!tag}">All</a>${tags.map((t) => `<a class="chip" href="#/learn?tag=${encodeURIComponent(t)}" aria-pressed="${key(t) === key(tag)}">${esc(t)}</a>`).join('')}</div></form>`;
  h += '<div class="block">';
  if (!S.learn.length) h += empty('No learning notes yet.', '<button type="button" class="btn small" id="addOC">Add the option chain guide</button>');
  else if (!items.length) h += empty('Nothing matches.');
  for (const l of items) {
    const url = safeUrl(l.url);
    h += `<article class="learn"><div class="meta">${niceDate(l.date)}${arr(l.tags).length ? ` · ${arr(l.tags).map(esc).join(', ')}` : ''}</div><h3>${esc(l.title)}</h3>${l.summary ? `<p>${esc(l.summary)}</p>` : ''}${arr(l.points).length ? `<ul>${li(arr(l.points))}</ul>` : ''}
      <div class="acts">${url ? `<a class="btn small" href="${attr(url)}" target="_blank" rel="noopener">Open full guide</a>` : ''}<a class="btn small ghost" href="#/learn/${attr(l.id)}/edit">Edit</a></div></article>`;
  }
  ctx.app.innerHTML = h + '</div>';
  const b = ctx.app.querySelector('#addOC');
  if (b) b.onclick = () => busy(b, 'Adding…', async () => { try { await ctx.api.insert('learning_notes', OPTION_CHAIN_NOTE); toast('Added'); ctx.reload(); } catch (e) { toast(explain(e), 'bad'); } });
  const f = ctx.app.querySelector('#lf');
  if (f) { let timer; f.q.oninput = () => { clearTimeout(timer); timer = setTimeout(() => { const p = new URLSearchParams(); if (tag) p.set('tag', tag); if (f.q.value.trim()) p.set('q', f.q.value.trim()); ctx.go(`#/learn${p.toString() ? '?' + p : ''}`); }, 250); }; f.onsubmit = (ev) => ev.preventDefault(); if (q) { f.q.focus(); f.q.setSelectionRange(f.q.value.length, f.q.value.length); } }
}

export function form(ctx, id) {
  ctx.setNav('learn');
  const isNew = !id, l = isNew ? {} : S.learn.find((x) => x.id === id);
  if (!l) { ctx.go('#/learn'); return; }
  ctx.app.innerHTML = `<h1>${isNew ? 'New learning note' : 'Edit note'}</h1><form id="lf" novalidate><fieldset><div class="grid">
    <div><label>Date</label><input name="date" type="date" value="${attr(l.date || today())}" required></div>
    <div><label>Tags (comma separated)</label><input name="tags" value="${attr(arr(l.tags).join(', '))}" placeholder="Options, Greeks"></div>
    <div class="span"><label>Title</label><input name="title" value="${attr(l.title)}" required></div>
    <div class="span"><label>Summary</label><input name="summary" value="${attr(l.summary)}"></div>
    <div class="span"><label>Key points (one per line)</label><textarea name="points">${esc(arr(l.points).join('\n'))}</textarea></div>
    <div class="span"><label>Link to full guide (https)</label><input name="url" type="url" value="${attr(l.url)}" placeholder="https://…"></div>
    </div></fieldset><div class="form-acts"><button class="btn" type="submit">Save note</button><a class="btn ghost" href="#/learn">Cancel</a>${isNew ? '' : '<button type="button" class="btn danger right" id="del">Delete</button>'}</div><div class="err" id="err" role="alert"></div></form>`;
  const f = ctx.app.querySelector('#lf'), err = f.querySelector('#err');
  const del = f.querySelector('#del');
  if (del) del.onclick = async () => { if (!confirm('Delete this note?')) return; try { await ctx.api.remove('learning_notes', l.id); toast('Deleted'); await ctx.reload(); ctx.go('#/learn'); } catch (e) { toast(explain(e), 'bad'); } };
  f.onsubmit = (ev) => {
    ev.preventDefault(); err.textContent = '';
    const row = { date: f.date.value, title: f.title.value.trim(), summary: f.summary.value.trim() || null, points: lines(f.points.value), url: f.url.value.trim() || null, tags: f.tags.value.split(',').map((s) => s.trim()).filter(Boolean) };
    if (!row.title) { err.textContent = 'Give the note a title.'; f.title.focus(); return; }
    if (!row.date) { err.textContent = 'Pick a date.'; f.date.focus(); return; }
    if (row.url && !safeUrl(row.url)) { err.textContent = 'The link must start with https://'; f.url.focus(); return; }
    busy(f.querySelector('[type=submit]'), 'Saving…', async () => {
      try { if (isNew) await ctx.api.insert('learning_notes', row); else await ctx.api.update('learning_notes', l.id, row); toast('Saved'); await ctx.reload(); ctx.go('#/learn'); } catch (e) { err.textContent = explain(e); }
    });
  };
}
