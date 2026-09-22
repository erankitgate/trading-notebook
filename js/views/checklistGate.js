/* Mandatory pre-trade checklist: a bold, impossible-to-miss box. Until every item is ticked
   for today, every "take a trade" action in the app is blocked (with a clear reason), not just discouraged.
   State is local (per device) for the day — it's a discipline gate, not a data record; what actually gets
   saved to the diary is the day's real checklist array when the page is written. */

import { esc, toast } from '../lib/dom.js';
import { today } from '../lib/fmt.js';
import { S, settings } from '../state.js';

const keyFor = (date) => `notebook.checklist.${date}`;

function load(date, items) {
  try {
    const saved = JSON.parse(localStorage.getItem(keyFor(date)) || 'null');
    if (saved && saved.length === items.length) return saved;
  } catch { /* ignore */ }
  return items.map(() => false);
}
function save(date, ticks) { try { localStorage.setItem(keyFor(date), JSON.stringify(ticks)); } catch { /* private mode */ } }

/** True once every checklist item is ticked for today (used to gate trade actions app-wide). */
export function checklistCleared(date = today()) {
  const items = settings().checklist || [];
  if (!items.length) return true;
  return load(date, items).every(Boolean);
}

/** Call before any "take a trade" action. Blocks with a toast and a jump to the gate if not cleared. Returns true if allowed. */
export function requireChecklist(date = today()) {
  if (checklistCleared(date)) return true;
  toast('Complete the pre-trade checklist first — it\'s mandatory.', 'bad', 3500);
  document.getElementById('checklistGate')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  document.getElementById('checklistGate')?.classList.add('shake');
  setTimeout(() => document.getElementById('checklistGate')?.classList.remove('shake'), 600);
  return false;
}

/** Render the gate box into `box`. Re-renders itself on every tick. */
export function mount(box, date = today()) {
  const items = settings().checklist || [];
  if (!items.length) { box.hidden = true; return; }
  let ticks = load(date, items);
  const draw = () => {
    const done = ticks.filter(Boolean).length, cleared = done === items.length;
    box.innerHTML = `<div class="gatebox ${cleared ? 'cleared' : ''}" id="checklistGate">
      <div class="section-head"><h2>${cleared ? '✅ Checklist cleared' : '🔒 Pre-trade checklist — MANDATORY'}</h2><span class="big ${cleared ? 'pos' : 'neg'}">${done}/${items.length}</span></div>
      ${cleared ? '<p class="small">You may take a trade today. Re-check anything that changes.</p>' : '<p class="small"><b>You cannot log a trade or arm a plan until every box below is ticked.</b> This is the gate between you and the FOMO entry.</p>'}
      <ul class="checks big-checks">${items.map((it, i) => `<li><label><input type="checkbox" data-i="${i}" ${ticks[i] ? 'checked' : ''}> ${esc(it)}</label></li>`).join('')}</ul>
    </div>`;
    box.querySelectorAll('[data-i]').forEach((cb) => { cb.onchange = () => { ticks[+cb.dataset.i] = cb.checked; save(date, ticks); draw(); }; });
  };
  draw();
}
