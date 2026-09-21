/* Formatting + small value helpers. Pure functions, no DOM. */

export const arr = (x) => (Array.isArray(x) ? x : x ? [x] : []);
export const key = (t) => String(t ?? '').trim().toLowerCase();
export const num = (v) => { if (v === '' || v == null) return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
export const lines = (v) => String(v ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** Signed rupee amount: +₹1,250 / -₹300. Compact when |n| ≥ 1 lakh unless exact. */
export function money(n, { compact = false, sign = true } = {}) {
  n = Number(n) || 0;
  const s = n < 0 ? '-' : sign ? '+' : '';
  const a = Math.abs(n);
  if (compact && a >= 1e7) return `${s}₹${(a / 1e7).toFixed(2)}Cr`;
  if (compact && a >= 1e5) return `${s}₹${(a / 1e5).toFixed(2)}L`;
  return `${s}₹${a.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}
export const pct = (x, d = 0) => (x == null || !Number.isFinite(x) ? '–' : `${(x * 100).toFixed(d)}%`);
export const rmult = (r) => (r == null || !Number.isFinite(r) ? '–' : `${r >= 0 ? '+' : ''}${r.toFixed(2)}R`);
export const cls = (n) => (Number(n) >= 0 ? 'pos' : 'neg');

/** Local calendar date as YYYY-MM-DD (never UTC-shifted). */
export function today(d = new Date()) {
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export const parseDate = (iso) => new Date(`${iso}T00:00:00`);
export function addDays(iso, n) { const d = parseDate(iso); d.setDate(d.getDate() + n); return today(d); }
export function niceDate(iso, opts) {
  const t = parseDate(iso);
  if (Number.isNaN(t.getTime())) return String(iso ?? '');
  return t.toLocaleDateString('en-IN', opts || { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
export const shortDate = (iso) => niceDate(iso, { day: 'numeric', month: 'short' });
export const monthKey = (iso) => String(iso).slice(0, 7);
export function monthLabel(ym) { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }); }
/** Monday of the ISO week containing iso. */
export function weekStart(iso) { const d = parseDate(iso); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return today(d); }
export const weekday = (iso) => parseDate(iso).getDay(); // 0 = Sunday
export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "NIFTY 25000 CE 25 Sep" → "NIFTY"; "Laurus 1900 PE" → "LAURUS". */
export function underlying(instrument) {
  const first = String(instrument ?? '').trim().split(/[\s:/-]+/)[0];
  return first ? first.toUpperCase() : '';
}
/** Very small pluraliser for UI copy. */
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
