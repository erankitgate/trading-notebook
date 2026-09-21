/* DOM helpers: escaping, tiny templating, toasts, downloads. */

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Escape untrusted text for HTML. Every user-supplied string goes through this. */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
/** Escape for use inside an attribute value that we control the quoting of. */
export const attr = esc;
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
/** <li> list from strings. */
export const li = (items) => items.map((s) => `<li>${esc(s)}</li>`).join('');
/** `<option>` list; `selected` compared as strings. */
export const options = (values, selected) => values.map((v) => {
  const [val, label] = Array.isArray(v) ? v : [v, v];
  return `<option value="${attr(val)}"${String(val) === String(selected ?? '') ? ' selected' : ''}>${esc(label)}</option>`;
}).join('');

let toastTimer = null;
/** Bottom toast; replaces any visible one. */
export function toast(msg, kind = 'ok', ms = 2600) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.toggle('bad', kind === 'bad');
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

/** Trigger a file download of text content (works on normal origins). */
export function download(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Read named fields from a form/row into an object of trimmed strings. */
export function fields(root, names) {
  const out = {};
  for (const n of names) { const el = root.querySelector(`[name="${n}"]`); out[n] = el ? (el.type === 'checkbox' ? el.checked : String(el.value).trim()) : ''; }
  return out;
}

/** Disable a submit button while a promise runs; restore label after. */
export async function busy(btn, label, fn) {
  const old = btn.textContent; btn.disabled = true; btn.textContent = label;
  try { return await fn(); } finally { btn.disabled = false; btn.textContent = old; }
}
