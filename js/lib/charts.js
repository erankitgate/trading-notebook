/* Inline-SVG charts. No library. Thin marks, hairline grid, hover tooltips.
   Each renderer returns an HTML string; call bindCharts(root) after inserting
   it so tooltips work. Colours come from CSS classes (theme-aware). */

import { esc } from './dom.js';
import { money, shortDate, niceDate, cls } from './fmt.js';

const W = 640;
const compact = (n) => {
  const a = Math.abs(n), s = n < 0 ? '-' : '';
  if (a >= 1e5) return `${s}${(a / 1e5).toFixed(a >= 1e6 ? 0 : 1)}L`;
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)}K`;
  return `${s}${Math.round(a)}`;
};

/** Clean tick values spanning [min, max] (always includes 0 when the range crosses it). */
export function niceTicks(min, max, count = 4) {
  if (min === max) { min -= 1; max += 1; }
  const span = max - min, rough = span / count, mag = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count + 1) || mag * 10;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const ticks = []; for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { ticks, lo, hi };
}

function frame(height, pad, ticks, yOf) {
  return ticks.map((v) => `<line class="grid-line" x1="${pad.l}" x2="${W - pad.r}" y1="${yOf(v)}" y2="${yOf(v)}"/><text class="axis-text" x="${pad.l - 6}" y="${yOf(v) + 4}" text-anchor="end">${esc(compact(v))}</text>`).join('');
}
function xLabels(points, xOf, height, pad) {
  if (!points.length) return '';
  const idx = points.length <= 3 ? points.map((_, i) => i) : [0, Math.floor(points.length / 2), points.length - 1];
  return idx.map((i, k) => `<text class="axis-text" x="${xOf(i)}" y="${height - pad.b + 16}" text-anchor="${k === 0 ? 'start' : k === idx.length - 1 ? 'end' : 'middle'}">${esc(shortDate(points[i].date))}</text>`).join('');
}

/** Equity curve: points = [{ date, cum }] ascending. */
export function lineChart(points, { height = 220, valueKey = 'cum', label = 'Equity' } = {}) {
  if (!points.length) return '<p class="sub small">No data yet.</p>';
  const pad = { l: 46, r: 14, t: 12, b: 26 };
  const ys = points.map((p) => p[valueKey]);
  const { ticks, lo, hi } = niceTicks(Math.min(0, ...ys), Math.max(0, ...ys));
  const xOf = (i) => pad.l + (points.length === 1 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (points.length - 1));
  const yOf = (v) => pad.t + ((hi - v) / (hi - lo)) * (height - pad.t - pad.b);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${xOf(i).toFixed(1)} ${yOf(p[valueKey]).toFixed(1)}`).join(' ');
  const area = `${d} L${xOf(points.length - 1).toFixed(1)} ${yOf(0).toFixed(1)} L${xOf(0).toFixed(1)} ${yOf(0).toFixed(1)} Z`;
  const last = points[points.length - 1];
  const data = points.map((p, i) => ({ x: +xOf(i).toFixed(1), y: +yOf(p[valueKey]).toFixed(1), tip: `${niceDate(p.date)}: ${money(p[valueKey])}` }));
  return `<div class="chart" data-chart="line" data-points='${esc(JSON.stringify(data))}'><svg viewBox="0 0 ${W} ${height}" role="img" aria-label="${esc(label)}">
    ${frame(height, pad, ticks, yOf)}
    <line class="grid-line" x1="${pad.l}" x2="${W - pad.r}" y1="${yOf(0)}" y2="${yOf(0)}" stroke-width="1.5"/>
    <path class="area" d="${area}"/><path class="line" d="${d}"/>
    <circle class="dot" r="4" cx="${xOf(points.length - 1)}" cy="${yOf(last[valueKey])}"/>
    <text class="axis-text" x="${Math.min(xOf(points.length - 1), W - pad.r - 40)}" y="${yOf(last[valueKey]) - 8}" text-anchor="end" font-weight="700">${esc(money(last[valueKey], { compact: true }))}</text>
    ${xLabels(points, xOf, height, pad)}
    <line class="cross" x1="0" x2="0" y1="${pad.t}" y2="${height - pad.b}" data-cross hidden/>
    <rect class="hit" x="${pad.l}" y="${pad.t}" width="${W - pad.l - pad.r}" height="${height - pad.t - pad.b}" data-hit/>
  </svg><div class="tip" data-tip hidden></div></div>`;
}

/** Signed bars: items = [{ date|label, value, href? }]. Green up, red down, rounded data-end. */
export function barChart(items, { height = 200, label = 'Daily P&L', labelKey = 'date', fmtLabel = (it) => (it.date ? niceDate(it.date) : it.label) } = {}) {
  if (!items.length) return '<p class="sub small">No data yet.</p>';
  const pad = { l: 46, r: 14, t: 12, b: 26 };
  const vals = items.map((i) => i.value);
  const { ticks, lo, hi } = niceTicks(Math.min(0, ...vals), Math.max(0, ...vals));
  const inner = W - pad.l - pad.r, slot = inner / items.length, bw = Math.min(24, Math.max(2, slot - 2));
  const yOf = (v) => pad.t + ((hi - v) / (hi - lo)) * (height - pad.t - pad.b);
  const y0 = yOf(0);
  const bars = items.map((it, i) => {
    const x = pad.l + slot * i + (slot - bw) / 2, y1 = yOf(it.value), h = Math.abs(y1 - y0), r = Math.min(4, bw / 2, h);
    const up = it.value >= 0;
    // rounded away from the baseline, square at the baseline
    const path = up
      ? `M${x} ${y0} V${y1 + r} Q${x} ${y1} ${x + r} ${y1} H${x + bw - r} Q${x + bw} ${y1} ${x + bw} ${y1 + r} V${y0} Z`
      : `M${x} ${y0} V${y1 - r} Q${x} ${y1} ${x + r} ${y1} H${x + bw - r} Q${x + bw} ${y1} ${x + bw} ${y1 - r} V${y0} Z`;
    const tip = `${fmtLabel(it)}: ${money(it.value)}`;
    const open = it.href ? `<a href="${esc(it.href)}">` : '', close = it.href ? '</a>' : '';
    return `${open}<path class="bar ${cls(it.value)}" d="${path}"/><rect class="hit" x="${pad.l + slot * i}" y="${pad.t}" width="${slot}" height="${height - pad.t - pad.b}" data-tip-text="${esc(tip)}" data-tip-x="${x + bw / 2}" data-tip-y="${Math.min(y0, y1)}"/>${close}`;
  }).join('');
  const xl = labelKey === 'date' ? xLabels(items, (i) => pad.l + slot * i + slot / 2, height, pad)
    : items.map((it, i) => `<text class="axis-text" x="${pad.l + slot * i + slot / 2}" y="${height - pad.b + 16}" text-anchor="middle">${esc(it.label)}</text>`).join('');
  return `<div class="chart" data-chart="bars"><svg viewBox="0 0 ${W} ${height}" role="img" aria-label="${esc(label)}">
    ${frame(height, pad, ticks, yOf)}<line class="grid-line" x1="${pad.l}" x2="${W - pad.r}" y1="${y0}" y2="${y0}" stroke-width="1.5"/>${bars}${xl}
  </svg><div class="tip" data-tip hidden></div></div>`;
}

/** 12-point sparkline for a stat tile. */
export function sparkline(values, { w = 120, h = 30 } = {}) {
  if (values.length < 2) return '';
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * (w - 4) + 2).toFixed(1)},${(h - 3 - ((v - min) / span) * (h - 6)).toFixed(1)}`);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${pts.join(' ')}"/></svg>`;
}

/** Month calendar heatmap. byDate = { 'YYYY-MM-DD': net }. Diverging: red ↔ neutral ↔ green, 4 steps each. */
export function calendar(ym, byDate, { todayIso } = {}) {
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(y, m - 1, 1), days = new Date(y, m, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // Monday-first
  const vals = Object.entries(byDate).filter(([d]) => d.startsWith(ym)).map(([, v]) => Math.abs(v));
  const max = Math.max(1, ...vals);
  const level = (v) => Math.min(4, Math.max(1, Math.ceil((Math.abs(v) / max) * 4)));
  let h = '<div class="cal">' + ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => `<div class="dow">${d}</div>`).join('');
  for (let i = 0; i < lead; i++) h += '<div class="cell blank"></div>';
  for (let d = 1; d <= days; d++) {
    const iso = `${ym}-${String(d).padStart(2, '0')}`, v = byDate[iso];
    const c = v == null ? '' : v > 0 ? ` pos l${level(v)}` : v < 0 ? ` neg l${level(v)}` : '';
    const tip = v == null ? niceDate(iso) : `${niceDate(iso)}: ${money(v)}`;
    h += v == null
      ? `<div class="cell${iso === todayIso ? ' today' : ''}" title="${esc(tip)}">${d}</div>`
      : `<a class="cell${c}${iso === todayIso ? ' today' : ''}" href="#/diary/${iso}" title="${esc(tip)}">${d}</a>`;
  }
  return h + '</div>';
}

/** Wire tooltips. Safe to call repeatedly on a fresh subtree. */
export function bindCharts(root) {
  for (const box of root.querySelectorAll('[data-chart]')) {
    const svg = box.querySelector('svg'), tip = box.querySelector('[data-tip]');
    const place = (xSvg, ySvg, text) => {
      const r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
      tip.textContent = text; tip.hidden = false;
      tip.style.left = `${(xSvg / vb.width) * r.width}px`;
      tip.style.top = `${(ySvg / vb.height) * r.height}px`;
    };
    const hide = () => { tip.hidden = true; const c = box.querySelector('[data-cross]'); if (c) c.hidden = true; };
    if (box.dataset.chart === 'line') {
      const pts = JSON.parse(box.dataset.points), hit = box.querySelector('[data-hit]'), cross = box.querySelector('[data-cross]');
      const move = (ev) => {
        const r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
        const cx = ev.touches ? ev.touches[0].clientX : ev.clientX;
        const xSvg = ((cx - r.left) / r.width) * vb.width;
        let best = pts[0]; for (const p of pts) if (Math.abs(p.x - xSvg) < Math.abs(best.x - xSvg)) best = p;
        cross.setAttribute('x1', best.x); cross.setAttribute('x2', best.x); cross.hidden = false;
        place(best.x, best.y, best.tip);
      };
      hit.addEventListener('mousemove', move); hit.addEventListener('touchstart', move, { passive: true }); hit.addEventListener('touchmove', move, { passive: true });
      hit.addEventListener('mouseleave', hide);
    } else {
      for (const h of box.querySelectorAll('[data-tip-text]')) {
        const show = () => place(+h.dataset.tipX, +h.dataset.tipY, h.dataset.tipText);
        h.addEventListener('mouseenter', show); h.addEventListener('touchstart', show, { passive: true });
        h.addEventListener('mouseleave', hide);
      }
    }
  }
}
