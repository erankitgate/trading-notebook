/* Settings: capital, risk budget, daily limits, checklist template, export. */

import { esc, attr, toast, busy, download } from '../lib/dom.js';
import { num, lines, arr, today } from '../lib/fmt.js';
import { riskBudget, dayNet, dayTrades, tradeR, tradeRisk } from '../lib/stats.js';
import { explain } from '../api.js';
import { S, settings } from '../state.js';

export function render(ctx) {
  ctx.setNav('settings');
  const cfg = settings(), budget = riskBudget(cfg);
  ctx.app.innerHTML = `<h1>Settings</h1><p class="sub">Signed in as <b>${esc(S.user?.email || '')}</b>${ctx.demo ? ' (demo — nothing is saved)' : ''}</p>
    <form id="sf" novalidate><fieldset><legend>Risk budget</legend><div class="grid">
      <div><label>Trading capital ₹</label><input name="capital" type="number" step="any" inputmode="decimal" value="${attr(cfg.capital ?? '')}" placeholder="300000"></div>
      <div><label>Risk per trade %</label><input name="risk_per_trade_pct" type="number" step="0.1" min="0" max="100" inputmode="decimal" value="${attr(cfg.risk_per_trade_pct ?? 1)}"><div class="hint">${budget ? `= ₹${budget.toLocaleString('en-IN')} per trade` : 'Set capital to see the rupee budget'}</div></div>
      <div><label>Daily max loss ₹</label><input name="daily_max_loss" type="number" step="any" inputmode="decimal" value="${attr(cfg.daily_max_loss ?? '')}" placeholder="${budget ? Math.round(budget * 2) : '6000'}"><div class="hint">Typically 2× the per-trade risk</div></div>
      <div><label>Max trades per day</label><input name="max_trades_per_day" type="number" step="1" min="1" inputmode="numeric" value="${attr(cfg.max_trades_per_day ?? 3)}"></div>
    </div></fieldset>
    <fieldset><legend>Pre-market checklist</legend><div class="grid one"><div><label>One item per line (shows as checkboxes on every new diary page)</label><textarea name="checklist" rows="6">${esc(arr(cfg.checklist).join('\n'))}</textarea></div></div></fieldset>
    <div class="form-acts"><button class="btn" type="submit">Save settings</button></div><div class="err" id="err" role="alert"></div></form>
    <div class="block"><h2>Your data</h2><p class="sub small">Everything lives in your Supabase project. Download a copy any time.</p><div class="acts mt"><button type="button" class="btn ghost small" id="expJson">Download everything (JSON)</button> <button type="button" class="btn ghost small" id="expCsv">Download trades (CSV)</button></div></div>
    <div class="block"><h2>Phone</h2><p class="small muted">Chrome on Android: ⋮ → <b>Add to Home screen</b>. Safari on iPhone: Share → <b>Add to Home Screen</b>. It opens like an app.</p></div>`;

  const f = ctx.app.querySelector('#sf'), err = f.querySelector('#err');
  f.onsubmit = (ev) => {
    ev.preventDefault(); err.textContent = '';
    const row = { capital: num(f.capital.value), risk_per_trade_pct: num(f.risk_per_trade_pct.value) ?? 1, daily_max_loss: num(f.daily_max_loss.value), max_trades_per_day: Math.max(1, Math.round(num(f.max_trades_per_day.value) ?? 3)), checklist: lines(f.checklist.value) };
    if (row.risk_per_trade_pct < 0 || row.risk_per_trade_pct > 100) { err.textContent = 'Risk per trade must be between 0 and 100.'; return; }
    busy(f.querySelector('[type=submit]'), 'Saving…', async () => {
      try { await ctx.api.saveSettings(row, S.user.id); toast('Settings saved'); await ctx.reload(); ctx.go('#/settings'); } catch (e) { err.textContent = explain(e); }
    });
  };
  ctx.app.querySelector('#expJson').onclick = () => download(`trading-notebook-${today()}.json`, JSON.stringify({ exported_at: new Date().toISOString(), diary: S.diary, learning: S.learn, highlights: S.pins, setups: S.setups, rules: S.rules, settings: S.settings, reviews: S.reviews }, null, 2));
  ctx.app.querySelector('#expCsv').onclick = () => {
    const cols = ['date', 'instrument', 'side', 'setup', 'qty', 'entry', 'stop', 'target', 'exit', 'pnl', 'risk', 'r', 'time_in', 'time_out', 'reason', 'result', 'day_net'];
    const q = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const rows = [cols.join(',')];
    for (const e of [...S.diary].reverse()) for (const t of dayTrades(e)) rows.push(cols.map((c) => q(c === 'date' ? e.date : c === 'day_net' ? dayNet(e) : c === 'risk' ? tradeRisk(t) : c === 'r' ? tradeR(t) : t[c])).join(','));
    download(`trades-${today()}.csv`, rows.join('\n'), 'text/csv');
  };
}
