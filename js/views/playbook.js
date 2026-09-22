/* Playbook: named setups (with live stats) and the hard-rule rulebook. */

import { esc, attr, li, toast, busy } from '../lib/dom.js';
import { money, cls, pct, rmult, lines, plural, key, arr, round2 } from '../lib/fmt.js';
import { bySetup, ruleBreakCounts, perRuleCompliance, filterRange, tradePnl, isClosed } from '../lib/stats.js';
import { explain } from '../api.js';
import { S } from '../state.js';
import { empty } from './shared.js';
import { sparkline } from '../lib/charts.js';

const miniStat = (label, value, detail = '', tone = '') => `<div class="kpi ${tone}"><small>${label}</small><b>${value}</b>${detail ? `<span class="d">${detail}</span>` : ''}</div>`;
/** Ascending cumulative P&L for one setup's closed trades — the sparkline source. */
function equityForSetup(items) {
  const closed = [...items].filter(isClosed).sort((a, b) => (a._date < b._date ? -1 : a._date > b._date ? 1 : 0));
  let cum = 0; return closed.map((t) => (cum = round2(cum + tradePnl(t))));
}

const STARTER_RULES = ['No trades in the first 15 minutes', 'Max 3 trades a day', 'Never move the stop further away', 'Stop trading for the day once the daily loss limit is hit', 'No trade without a written reason'];

export function list(ctx) {
  ctx.setNav('playbook');
  const bySetupStats = bySetup(S.diary), stats = Object.fromEntries(bySetupStats.map((g) => [g.key, g]));
  const breaks = ruleBreakCounts(S.diary);
  const perRule = perRuleCompliance(filterRange(S.diary, '1m'), S.rules);
  const perRuleByText = Object.fromEntries(perRule.map((r) => [key(r.text), r]));

  /* overview: how the playbook is actually performing */
  const tagged = bySetupStats.filter((g) => g.key !== '(no setup)' && g.trades);
  const totalNet = round2(tagged.reduce((s, g) => s + g.net, 0));
  const totalTrades = tagged.reduce((s, g) => s + g.trades, 0);
  const totalWins = tagged.reduce((s, g) => s + g.wins, 0);
  const best = tagged.length ? tagged.reduce((a, g) => (g.net > a.net ? g : a)) : null;

  let h = `<div class="head-row"><div><h1>Playbook &amp; rules</h1><p class="sub">Trade only what's written here. Each setup shows its real numbers.</p></div><a class="btn" href="#/playbook/new">+ New setup</a></div>`;

  if (tagged.length) h += `<div class="mini-stats">
    ${miniStat('Active setups', S.setups.filter((s) => s.active !== false).length)}
    ${miniStat('Setup-tagged trades', totalTrades, totalTrades ? `${pct(totalWins / totalTrades)} win rate` : '')}
    ${miniStat('Net from setups', `<span class="${cls(totalNet)}">${money(totalNet, { compact: true })}</span>`, totalNet ? (totalNet >= 0 ? 'good' : 'bad') : '')}
    ${miniStat('Best setup', best ? esc(best.label) : '—', best ? `<span class="${cls(best.net)}">${money(best.net, { compact: true })}</span>` : '')}
  </div>`;

  h += '<div class="block"><h2>Setups</h2>';
  if (!S.setups.length) h += empty('<strong>No setups yet.</strong> Write down the 1–3 patterns you actually trade: what must be true to enter, where the stop goes, how you exit.', '<a class="btn small" href="#/playbook/new">Add your first setup</a>');
  for (const s of S.setups) {
    const st = stats[key(s.name)];
    const curve = st ? equityForSetup(st.items) : [];
    h += `<article class="card ${s.active === false ? 'inactive' : ''}"><div class="head-row"><div><div class="meta">${s.active === false ? 'Paused · ' : ''}${st ? `${plural(st.trades, 'trade')}` : 'no trades yet'}</div><h3>${esc(s.name)}</h3></div>${curve.length > 1 ? `<div>${sparkline(curve, { w: 110, h: 30 })}</div>` : ''}</div>
      ${s.description ? `<p>${esc(s.description)}</p>` : ''}
      ${arr(s.entry_rules).length ? `<div class="small"><b>Enter when</b><ul>${li(arr(s.entry_rules))}</ul></div>` : ''}${arr(s.exit_rules).length ? `<div class="small"><b>Exit when</b><ul>${li(arr(s.exit_rules))}</ul></div>` : ''}
      ${st ? `<div class="mini"><span>Win rate <b class="${pct(st.winRate) === '0%' ? 'neg' : ''}">${pct(st.winRate)}</b></span><span>Avg R <b class="${st.avgR == null ? '' : cls(st.avgR)}">${rmult(st.avgR)}</b></span><span>Net <b class="${cls(st.net)}">${money(st.net)}</b></span></div>` : ''}
      ${s.notes ? `<p class="small muted">${esc(s.notes)}</p>` : ''}<div class="acts"><a class="btn small ghost" href="#/playbook/${attr(s.id)}/edit">Edit</a><a class="btn small ghost" href="#/diary?q=${encodeURIComponent(s.name)}">Trades</a></div></article>`;
  }
  h += '</div>';

  h += `<div class="block"><div class="section-head"><h2>Hard rules</h2>${perRule.length ? `<span class="small muted">follow rate, last 30 days</span>` : ''}</div><p class="sub small">These appear as checkboxes on every diary page. Breaking one twice in 30 days puts it in the red box on the front page.</p>`;
  if (S.rules.length) h += `<ul class="rulebook">${S.rules.map((r) => { const b = breaks[key(r.text)]; const pr = perRuleByText[key(r.text)]; return `<li class="${r.active ? '' : 'off'}"><span>${esc(r.text)}${b ? ` <span class="mini-flag${b.count >= 2 ? '' : ' amber'}">broken ×${b.count}</span>` : ''}${pr && pr.days ? `<div class="bar mt"><i class="${pr.pct >= 0.8 ? '' : pr.pct >= 0.5 ? 'mid' : 'low'}" style="width:${Math.round(pr.pct * 100)}%"></i></div>` : ''}</span>${pr && pr.days ? `<span class="pct small ${pr.pct >= 0.8 ? 'pos' : pr.pct >= 0.5 ? 'warn' : 'neg'}">${pct(pr.pct)}</span>` : '<span></span>'}<span class="acts"><button type="button" class="btn small ghost" data-toggle="${attr(r.id)}">${r.active ? 'Pause' : 'Resume'}</button><button type="button" class="btn small danger" data-del="${attr(r.id)}" aria-label="Delete rule">×</button></span></li>`; }).join('')}</ul>`;
  else h += empty('No rules yet.', `<button type="button" class="btn small" id="starter">Add ${STARTER_RULES.length} starter rules</button>`);
  h += `<form class="inline-form" id="ruleForm"><input name="t" placeholder="New rule, e.g. No trades after 2:30 pm" aria-label="New rule" required maxlength="160"><button class="btn small">Add rule</button></form></div>`;

  ctx.app.innerHTML = h;
  const f = ctx.app.querySelector('#ruleForm');
  f.onsubmit = async (ev) => {
    ev.preventDefault(); const t = f.t.value.trim(); if (!t) return;
    try { await ctx.api.insert('rules', { text: t, sort: S.rules.length + 1 }); f.reset(); toast('Rule added'); ctx.reload(); } catch (e) { toast(explain(e), 'bad'); }
  };
  const starter = ctx.app.querySelector('#starter');
  if (starter) starter.onclick = () => busy(starter, 'Adding…', async () => {
    try { for (const [i, text] of STARTER_RULES.entries()) await ctx.api.insert('rules', { text, sort: i + 1 }); toast('Starter rules added'); ctx.reload(); } catch (e) { toast(explain(e), 'bad'); }
  });
  for (const b of ctx.app.querySelectorAll('[data-toggle]')) b.onclick = async () => { const r = S.rules.find((x) => x.id === b.dataset.toggle); try { await ctx.api.update('rules', r.id, { active: !r.active }); ctx.reload(); } catch (e) { toast(explain(e), 'bad'); } };
  for (const b of ctx.app.querySelectorAll('[data-del]')) b.onclick = async () => { if (!confirm('Delete this rule? Past diary pages keep their record of it.')) return; try { await ctx.api.remove('rules', b.dataset.del); ctx.reload(); } catch (e) { toast(explain(e), 'bad'); } };
}

export function form(ctx, id) {
  ctx.setNav('playbook');
  const isNew = !id, s = isNew ? {} : S.setups.find((x) => x.id === id);
  if (!s) { ctx.go('#/playbook'); return; }
  ctx.app.innerHTML = `<h1>${isNew ? 'New setup' : `Edit ${esc(s.name)}`}</h1><form id="sf" novalidate><fieldset><div class="grid one">
    <div><label>Name</label><input name="name" value="${attr(s.name)}" placeholder="ORB breakout" required maxlength="60"></div>
    <div><label>What it is (one or two lines)</label><input name="description" value="${attr(s.description)}" placeholder="Break of the 15-min opening range with volume, with the daily trend"></div>
    <div><label>Enter only when (one per line)</label><textarea name="entry_rules">${esc(arr(s.entry_rules).join('\n'))}</textarea></div>
    <div><label>Stop and exit (one per line)</label><textarea name="exit_rules">${esc(arr(s.exit_rules).join('\n'))}</textarea></div>
    <div><label>Notes (best conditions, what invalidates it)</label><textarea name="notes">${esc(s.notes)}</textarea></div>
    ${isNew ? '' : `<div><label class="checks"><input type="checkbox" name="active"${s.active !== false ? ' checked' : ''}> Active (shows in the trade form)</label></div>`}
    </div></fieldset><div class="form-acts"><button class="btn" type="submit">Save setup</button><a class="btn ghost" href="#/playbook">Cancel</a>${isNew ? '' : '<button type="button" class="btn danger right" id="del">Delete</button>'}</div><div class="err" id="err" role="alert"></div></form>`;
  const f = ctx.app.querySelector('#sf'), err = f.querySelector('#err');
  const del = f.querySelector('#del');
  if (del) del.onclick = async () => { if (!confirm(`Delete "${s.name}"? Trades tagged with it keep the name.`)) return; try { await ctx.api.remove('setups', s.id); toast('Deleted'); await ctx.reload(); ctx.go('#/playbook'); } catch (e) { toast(explain(e), 'bad'); } };
  f.onsubmit = (ev) => {
    ev.preventDefault(); err.textContent = '';
    const row = { name: f.name.value.trim(), description: f.description.value.trim() || null, entry_rules: lines(f.entry_rules.value), exit_rules: lines(f.exit_rules.value), notes: f.notes.value.trim() || null };
    if (!row.name) { err.textContent = 'Give the setup a name.'; f.name.focus(); return; }
    if (!isNew) row.active = f.active.checked;
    busy(f.querySelector('[type=submit]'), 'Saving…', async () => {
      try { if (isNew) await ctx.api.insert('setups', row); else await ctx.api.update('setups', s.id, row); toast('Saved'); await ctx.reload(); ctx.go('#/playbook'); }
      catch (e) { err.textContent = e.code === '23505' ? 'A setup with this name already exists.' : explain(e); }
    });
  };
}
