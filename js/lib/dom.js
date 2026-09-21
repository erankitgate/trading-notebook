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

/** Tiny markdown → HTML for the written brief. Escapes first, so it is safe for any input.
    Supports: ## / ### headings, paragraphs, - bullets, 1. lists, **bold**, *italic*, `code`, | tables |, [text](https://…). */
export function md(src) {
  const inline = (s) => esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<i>$2</i>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  const lines = String(src ?? '').replace(/\r/g, '').split('\n');
  let out = '', i = 0;
  const flush = (buf) => (buf.length ? `<p>${buf.map(inline).join('<br>')}</p>` : '');
  let para = [];
  while (i < lines.length) {
    const l = lines[i];
    if (/^\s*$/.test(l)) { out += flush(para); para = []; i++; continue; }
    let m;
    if ((m = l.match(/^(#{2,4})\s+(.*)$/))) { out += flush(para); para = []; const n = m[1].length; out += `<h${n} class="md-h${n}">${inline(m[2])}</h${n}>`; i++; continue; }
    if (/^\s*[-*]\s+/.test(l)) { out += flush(para); para = []; let items = []; while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, '')); out += `<ul>${items.map((x) => `<li>${inline(x)}</li>`).join('')}</ul>`; continue; }
    if (/^\s*\d+\.\s+/.test(l)) { out += flush(para); para = []; let items = []; while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+\.\s+/, '')); out += `<ol>${items.map((x) => `<li>${inline(x)}</li>`).join('')}</ol>`; continue; }
    if (/^\|/.test(l)) {
      out += flush(para); para = []; const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) { const r = lines[i++]; if (/^\|\s*:?-{2,}/.test(r)) continue; rows.push(r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim())); }
      if (rows.length) out += `<div class="table-wrap"><table class="md"><thead><tr>${rows[0].map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      continue;
    }
    para.push(l); i++;
  }
  return out + flush(para);
}
