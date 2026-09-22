/* Add / edit a diary day. */

import { esc, attr, options, toast, busy } from '../lib/dom.js';
import { money, niceDate, today, arr, key, num, lines, round2, rmult, cls } from '../lib/fmt.js';
import { autoPnl, tradeRisk, tradeR, tradeRR, suggestQty, riskBudget, mistakeCounts } from '../lib/stats.js';
import { explain } from '../api.js';
import { S, settings, entryByDate } from '../state.js';
import { checklistCleared } from './checklistGate.js';

const BIAS = ['', 'bullish', 'bearish', 'neutral'];

function tradeRow(t = {}) {
  return `<div class="rowbox trade"><button type="button" class="btn small danger rm">Remove</button><div class="grid">
    <div class="span head"><label>Instrument</label><input name="instrument" value="${attr(t.instrument)}" placeholder="NIFTY 25000 CE 25 Sep" required></div>
    <div><label>Side</label><select name="side">${options(['Buy', 'Sell'], t.side || 'Buy')}</select></div>
    <div><label>Setup</label><input name="setup" list="setups" value="${attr(t.setup)}" placeholder="From playbook"></div>
    <div><label>Qty</label><input name="qty" type="number" step="any" inputmode="decimal" value="${attr(t.qty)}"></div>
    <div><label>Entry ₹</label><input name="entry" type="number" step="any" inputmode="decimal" value="${attr(t.entry)}"></div>
    <div><label>Stop ₹</label><input name="stop" type="number" step="any" inputmode="decimal" value="${attr(t.stop)}" placeholder="planned"></div>
    <div><label>Target ₹</label><input name="target" type="number" step="any" inputmode="decimal" value="${attr(t.target)}" placeholder="planned"></div>
    <div><label>Exit ₹</label><input name="exit" type="number" step="any" inputmode="decimal" value="${attr(t.exit)}" placeholder="blank = open"></div>
    <div><label>P&amp;L ₹</label><input name="pnl" type="number" step="any" inputmode="decimal" value="${attr(t.pnl)}" placeholder="auto"></div>
    <div><label>Time in</label><input name="time_in" type="time" value="${attr(t.time_in)}"></div>
    <div><label>Time out</label><input name="time_out" type="time" value="${attr(t.time_out)}"></div>
    <div class="span"><label>Why I took it</label><input name="reason" value="${attr(t.reason)}" placeholder="The setup, the level, the reason"></div>
    <div class="span"><label>What happened</label><input name="result" value="${attr(t.result)}"></div>
  </div><div class="calc" data-calc></div></div>`;
}
function mistakeRow(m = {}) {
  return `<div class="rowbox mistake"><button type="button" class="btn small danger rm">Remove</button><div class="grid">
    <div class="span head"><label>Mistake (short name)</label><input name="tag" list="mtags" value="${attr(m.tag)}" placeholder="Exited too early" required><div class="hint">Pick the same name again so repeats are counted.</div></div>
    <div class="span"><label>Details</label><input name="detail" value="${attr(m.detail)}"></div></div></div>`;
}
function watchRow(w = {}) {
  return `<div class="rowbox watch-row"><button type="button" class="btn small danger rm">Remove</button><div class="grid">
    <div class="head"><label>Instrument</label><input name="instrument" value="${attr(w.instrument)}" placeholder="NIFTY"></div>
    <div><label>Bias</label><select name="bias">${options(BIAS.map((b) => [b, b || '—']), w.bias || '')}</select></div>
    <div><label>Levels</label><input name="levels" value="${attr(w.levels)}" placeholder="24950 / 25120 / 25300"></div>
    <div class="span"><label>Note</label><input name="note" value="${attr(w.note)}" placeholder="What would make you act"></div></div></div>`;
}
const readRow = (row, names) => Object.fromEntries(names.map((n) => [n, row.querySelector(`[name="${n}"]`).value.trim()]));

/** Live line under each trade: auto P&L, risk, R, planned R:R, suggested qty. */
function recalc(row, cfg) {
  const t = readRow(row, ['side', 'qty', 'entry', 'stop', 'target', 'exit', 'pnl']);
  const pnl = t.pnl !== '' ? num(t.pnl) : autoPnl(t), risk = tradeRisk(t), rr = tradeRR(t);
  const r = pnl != null && risk ? round2(pnl / risk) : null;
  const budget = riskBudget(cfg), sq = budget ? suggestQty(t.entry, t.stop, budget) : null;
  const parts = [];
  if (pnl != null) parts.push(`P&amp;L <b class="${cls(pnl)}">${money(pnl)}</b>${t.pnl === '' ? ' (auto)' : ''}`);
  if (risk) parts.push(`Risk <b>₹${risk.toLocaleString('en-IN')}</b>${budget ? ` <span class="${risk > budget * 1.05 ? 'neg' : ''}">(budget ₹${budget.toLocaleString('en-IN')})</span>` : ''}`);
  if (rr) parts.push(`Planned <b>${rr}:1</b>`);
  if (r != null) parts.push(`Result <b class="${cls(r)}">${rmult(r)}</b>`);
  if (sq != null && t.qty === '') parts.push(`Suggested qty for ₹${budget.toLocaleString('en-IN')} risk: <b>${sq}</b>`);
  row.querySelector('[data-calc]').innerHTML = parts.join('<span>·</span>');
}

export function render(ctx, date, isNew) {
  ctx.setNav('diary');
  const e = isNew ? {} : entryByDate(date);
  if (!e) { ctx.go('#/diary'); return; }
  const cfg = settings();
  const d = e.date || ctx.query.get('date') || today();
  const prev = S.diary.find((x) => x.date < d);
  const mtags = Object.values(mistakeCounts(S.diary)).map((m) => m.tag);
  const setupNames = S.setups.filter((s) => s.active !== false).map((s) => s.name);
  // checklist: saved state for edits, template for new pages
  const template = arr(cfg.checklist).filter(Boolean);
  const saved = arr(e.checklist).filter((c) => c && c.item);
  const checklist = isNew || !saved.length ? template.map((item) => ({ item, done: false })) : saved;
  // rules tick-list: active rules plus any rule this page already recorded; checked = followed
  const snap = arr(e.rules_check).filter((r) => r && r.text);
  const brokenIds = new Set(arr(e.rules_broken).map((r) => (typeof r === 'string' ? r : r.id)));
  const rules = [...S.rules.filter((r) => r.active || brokenIds.has(r.id) || snap.some((x) => x.id === r.id)), ...snap.filter((r) => r.id && !S.rules.some((x) => x.id === r.id))];
  const followed = (r) => { const x = snap.find((y) => y.id === r.id); return x ? !!x.followed : isNew ? false : !brokenIds.has(r.id); };

  let h = `<h1>${isNew ? 'New diary page' : `Edit ${niceDate(e.date)}`}</h1><form id="df" novalidate>
    <datalist id="mtags">${mtags.map((t) => `<option value="${attr(t)}">`).join('')}</datalist>
    <datalist id="setups">${setupNames.map((t) => `<option value="${attr(t)}">`).join('')}</datalist>
    <fieldset><legend>The day</legend><div class="grid">
      <div><label>Date</label><input name="date" type="date" value="${attr(d)}" required></div>
      <div><label>Market</label><input name="market" value="${attr(e.market)}" placeholder="Nifty gap up, trending"></div>
      <div><label>Mood</label><input name="mood" value="${attr(e.mood)}" placeholder="Calm / FOMO / tired"></div>
      <div class="span"><label>One-line title</label><input name="title" value="${attr(e.title)}" placeholder="ORB breakout, booked early"></div>
    </div></fieldset>`;

  h += `<fieldset><legend>Did I follow yesterday's plan?</legend>${prev && arr(prev.next_day_strategy).length ? `<div class="plan prev small"><span class="sub small">Plan from ${niceDate(prev.date)}</span><ul>${arr(prev.next_day_strategy).map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>` : ''}<div class="grid mt">
      <div><label>Answer</label><select name="plan_followed">${options([['', '—'], ['yes', 'Yes'], ['partly', 'Partly'], ['no', 'No']], e.plan_followed || '')}</select></div>
      <div class="span2"><label>Why</label><input name="plan_note" value="${attr(e.plan_note)}"></div></div></fieldset>`;

  if (checklist.length) h += `<fieldset><legend>Pre-market checklist</legend><ul class="checks">${checklist.map((c, i) => `<li><label><input type="checkbox" name="check_${i}" data-item="${attr(c.item)}"${c.done ? ' checked' : ''}> ${esc(c.item)}</label></li>`).join('')}</ul><div class="hint">Edit the list in <a href="#/settings">Settings</a>.</div></fieldset>`;

  h += `<fieldset><legend>Trades</legend><div id="trades">${arr(e.trades).map(tradeRow).join('')}</div><button type="button" class="btn ghost small" id="addTrade">+ Add trade</button>
    <div class="grid mt"><div><label>Charges for the day ₹ (brokerage + taxes)</label><input name="charges" type="number" step="any" inputmode="decimal" value="${attr(e.charges || '')}" placeholder="0"></div></div></fieldset>`;

  if (rules.length) h += `<fieldset><legend>Rules followed today <span class="muted small" id="ruleScore"></span></legend><ul class="checks">${rules.map((r, i) => `<li><label><input type="checkbox" name="rule" value="${attr(r.id)}" data-text="${attr(r.text)}"${followed(r) ? ' checked' : ''}> <span class="muted">${i + 1}.</span> ${esc(r.text)}</label></li>`).join('')}</ul><div class="hint">Tick every rule you kept. Unticked = broken; it goes to the front page. A day with no trades counts as 100% automatically. <a href="#" id="tickAll">Tick all</a></div></fieldset>`;
  else h += `<fieldset><legend>Rules followed today</legend><div class="hint">Add your rules in the <a href="#/playbook">Playbook</a> and they'll appear here as a tick-list.</div></fieldset>`;

  h += `<fieldset><legend>Mistakes</legend><div id="mistakes">${arr(e.mistakes).map(mistakeRow).join('')}</div><button type="button" class="btn ghost small" id="addMistake">+ Add mistake</button></fieldset>`;

  h += `<fieldset><legend>Reflection</legend><div class="grid one">
      <div><label>What went well (one per line)</label><textarea name="went_well">${esc(arr(e.went_well).join('\n'))}</textarea></div>
      <div><label>Lesson of the day (one per line)</label><textarea name="lessons">${esc(arr(e.lessons).join('\n'))}</textarea></div>
      <div><label>Strategy for next day (one per line)</label><textarea name="next_day_strategy">${esc(arr(e.next_day_strategy).join('\n'))}</textarea></div>
      <div><label>Notes</label><textarea name="notes">${esc(e.notes)}</textarea></div></div></fieldset>`;

  h += `<fieldset><legend>Watchlist for next session</legend><div id="watch">${arr(e.watchlist).map(watchRow).join('')}</div><button type="button" class="btn ghost small" id="addWatch">+ Add instrument</button></fieldset>`;

  h += `<div class="form-acts"><button class="btn" type="submit">Save page</button><a class="btn ghost" href="${isNew ? '#/diary' : `#/diary/${attr(e.date)}`}">Cancel</a><span class="hint">⌘/Ctrl + Enter saves</span>${isNew ? '' : '<button type="button" class="btn danger right" id="del">Delete page</button>'}</div><div class="err" id="err" role="alert"></div></form>`;
  ctx.app.innerHTML = h;

  const form = ctx.app.querySelector('#df'), tBox = form.querySelector('#trades'), mBox = form.querySelector('#mistakes'), wBox = form.querySelector('#watch'), err = form.querySelector('#err');
  const add = (box, html) => { box.insertAdjacentHTML('beforeend', html); const row = box.lastElementChild; if (row.classList.contains('trade')) recalc(row, cfg); row.querySelector('input')?.focus(); };
  if (isNew) { tBox.insertAdjacentHTML('beforeend', tradeRow()); recalc(tBox.lastElementChild, cfg); }
  else for (const r of tBox.querySelectorAll('.trade')) recalc(r, cfg);
  form.querySelector('#addTrade').onclick = () => add(tBox, tradeRow());
  form.querySelector('#addMistake').onclick = () => add(mBox, mistakeRow());
  form.querySelector('#addWatch').onclick = () => add(wBox, watchRow());
  form.addEventListener('click', (ev) => { if (ev.target.classList.contains('rm')) ev.target.closest('.rowbox')?.remove(); });
  form.addEventListener('input', (ev) => { const row = ev.target.closest('.trade'); if (row) recalc(row, cfg); dirty = true; });
  let dirty = false;
  const guard = (ev) => { if (dirty) { ev.preventDefault(); ev.returnValue = ''; } };
  window.addEventListener('beforeunload', guard);
  ctx.onLeave(() => window.removeEventListener('beforeunload', guard));
  form.addEventListener('keydown', (ev) => { if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') { ev.preventDefault(); form.requestSubmit(); } });
  const score = form.querySelector('#ruleScore');
  const updScore = () => { if (!score) return; const all = form.querySelectorAll('[name=rule]'), on = form.querySelectorAll('[name=rule]:checked'); score.textContent = all.length ? `${on.length}/${all.length} · ${Math.round((on.length / all.length) * 100)}%` : ''; };
  updScore(); form.addEventListener('change', (ev) => { if (ev.target.name === 'rule') updScore(); });
  const tickAll = form.querySelector('#tickAll');
  if (tickAll) tickAll.onclick = (ev) => { ev.preventDefault(); for (const c of form.querySelectorAll('[name=rule]')) c.checked = true; updScore(); dirty = true; };

  const del = form.querySelector('#del');
  if (del) del.onclick = async () => {
    if (!confirm(`Delete the page for ${niceDate(e.date)}? This cannot be undone.`)) return;
    try { await ctx.api.remove('diary_entries', e.id); dirty = false; toast('Page deleted'); await ctx.reload(); ctx.go('#/diary'); } catch (x) { toast(explain(x), 'bad'); }
  };

  form.onsubmit = (ev) => {
    ev.preventDefault(); err.textContent = '';
    if (!form.date.value) { err.textContent = 'Pick a date.'; form.date.focus(); return; }
    if (isNew && form.date.value === today() && !checklistCleared(today())) {
      const hasTrade = [...tBox.querySelectorAll('.trade [name=instrument]')].some((i) => i.value.trim());
      if (hasTrade) { err.textContent = 'Complete the mandatory pre-trade checklist on the front page before logging a trade for today.'; return; }
    }
    const trades = [...tBox.querySelectorAll('.trade')].map((row) => {
      const g = readRow(row, ['instrument', 'side', 'setup', 'qty', 'entry', 'stop', 'target', 'exit', 'pnl', 'time_in', 'time_out', 'reason', 'result']);
      const t = { instrument: g.instrument, side: g.side, setup: g.setup || null, qty: num(g.qty), entry: num(g.entry), stop: num(g.stop), target: num(g.target), exit: num(g.exit), pnl: num(g.pnl), time_in: g.time_in || null, time_out: g.time_out || null, reason: g.reason, result: g.result };
      if (t.pnl == null) t.pnl = autoPnl(t);
      t.risk = tradeRisk(t);
      return t;
    }).filter((t) => t.instrument);
    const bad = [...tBox.querySelectorAll('.trade')].find((row) => !row.querySelector('[name=instrument]').value.trim() && [...row.querySelectorAll('input')].some((i) => i.name !== 'instrument' && i.value.trim()));
    if (bad) { err.textContent = 'A trade is missing its instrument name.'; bad.querySelector('[name=instrument]').focus(); return; }
    const mistakes = [...mBox.querySelectorAll('.mistake')].map((row) => readRow(row, ['tag', 'detail'])).filter((m) => m.tag);
    const watchlist = [...wBox.querySelectorAll('.watch-row')].map((row) => readRow(row, ['instrument', 'bias', 'levels', 'note'])).filter((w) => w.instrument);
    const checklist = [...form.querySelectorAll('[name^=check_]')].map((c) => ({ item: c.dataset.item, done: c.checked }));
    const noTrades = trades.length === 0;
    const rules_check = [...form.querySelectorAll('[name=rule]')].map((c) => ({ id: c.value, text: c.dataset.text, followed: noTrades || c.checked }));
    const rules_broken = rules_check.filter((r) => !r.followed).map(({ id, text }) => ({ id, text }));
    const row = {
      date: form.date.value, title: form.title.value.trim() || null, market: form.market.value.trim() || null, mood: form.mood.value.trim() || null,
      plan_followed: form.plan_followed.value || null, plan_note: form.plan_note.value.trim() || null,
      trades, mistakes, went_well: lines(form.went_well.value), lessons: lines(form.lessons.value), next_day_strategy: lines(form.next_day_strategy.value),
      notes: form.notes.value.trim() || null, charges: num(form.charges.value) || 0, checklist, rules_check, rules_broken, watchlist,
    };
    busy(form.querySelector('[type=submit]'), 'Saving…', async () => {
      try {
        if (isNew) await ctx.api.insert('diary_entries', row); else await ctx.api.update('diary_entries', e.id, row);
        dirty = false; toast('Saved'); await ctx.reload(); ctx.go(`#/diary/${row.date}`);
      } catch (x) { err.textContent = explain(x); }
    });
  };
}
