/* Inline-SVG charts. No library. Thin marks, hairline grid, hover tooltips.
   Each renderer returns an HTML string; call bindCharts(root) after inserting
   it so tooltips work. Colours come from CSS classes (theme-aware). */

import { esc } from './dom.js';
import { money, shortDate, niceDate, cls } from './fmt.js';

const W = 640;
export const PCT_DOMAIN = { min: 0, max: 100, ticks: [0, 25, 50, 75, 100] };
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
export function lineChart(points, { height = 220, valueKey = 'cum', label = 'Equity', zero = true, fmtValue = money } = {}) {
  if (!points.length) return '<p class="sub small">No data yet.</p>';
  const pad = { l: 46, r: 14, t: 12, b: 26 };
  const ys = points.map((p) => p[valueKey]);
  const { ticks, lo, hi } = zero ? niceTicks(Math.min(0, ...ys), Math.max(0, ...ys)) : niceTicks(Math.min(...ys), Math.max(...ys));
  const base = zero ? 0 : lo;
  const xOf = (i) => pad.l + (points.length === 1 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (points.length - 1));
  const yOf = (v) => pad.t + ((hi - v) / (hi - lo)) * (height - pad.t - pad.b);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${xOf(i).toFixed(1)} ${yOf(p[valueKey]).toFixed(1)}`).join(' ');
  const area = `${d} L${xOf(points.length - 1).toFixed(1)} ${yOf(base).toFixed(1)} L${xOf(0).toFixed(1)} ${yOf(base).toFixed(1)} Z`;
  const last = points[points.length - 1];
  const data = points.map((p, i) => ({ x: +xOf(i).toFixed(1), y: +yOf(p[valueKey]).toFixed(1), tip: p.tip || `${niceDate(p.date)}: ${fmtValue(p[valueKey])}` }));
  return `<div class="chart" data-chart="line" data-points='${esc(JSON.stringify(data))}'><svg viewBox="0 0 ${W} ${height}" role="img" aria-label="${esc(label)}">
    ${frame(height, pad, ticks, yOf)}
    ${zero ? `<line class="grid-line" x1="${pad.l}" x2="${W - pad.r}" y1="${yOf(0)}" y2="${yOf(0)}" stroke-width="1.5"/>` : ''}
    <path class="area" d="${area}"/><path class="line" d="${d}"/>
    <circle class="dot" r="4" cx="${xOf(points.length - 1)}" cy="${yOf(last[valueKey])}"/>
    <text class="axis-text" x="${Math.min(xOf(points.length - 1), W - pad.r - 40)}" y="${yOf(last[valueKey]) - 8}" text-anchor="end" font-weight="700">${esc(fmtValue(last[valueKey], { compact: true }))}</text>
    ${xLabels(points, xOf, height, pad)}
    <line class="cross" x1="0" x2="0" y1="${pad.t}" y2="${height - pad.b}" data-cross hidden/>
    <rect class="hit" x="${pad.l}" y="${pad.t}" width="${W - pad.l - pad.r}" height="${height - pad.t - pad.b}" data-hit/>
  </svg><div class="tip" data-tip hidden></div></div>`;
}

/** Signed bars: items = [{ date|label, value, href? }]. Green up, red down, rounded data-end. */
export function barChart(items, { height = 200, label = 'Daily P&L', labelKey = 'date', fmtLabel = (it) => (it.date ? niceDate(it.date) : it.label), domain = null, fmtValue = money } = {}) {
  if (!items.length) return '<p class="sub small">No data yet.</p>';
  const pad = { l: 46, r: 14, t: 12, b: 26 };
  const vals = items.map((i) => i.value);
  const { ticks, lo, hi } = domain ? { ticks: domain.ticks, lo: domain.min, hi: domain.max } : niceTicks(Math.min(0, ...vals), Math.max(0, ...vals));
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
    const tip = it.tip || `${fmtLabel(it)}: ${fmtValue(it.value)}`;
    const open = it.href ? `<a href="${esc(it.href)}">` : '', close = it.href ? '</a>' : '';
    return `${open}<path class="bar ${it.cls || cls(it.value)}" d="${path}"/><rect class="hit" x="${pad.l + slot * i}" y="${pad.t}" width="${slot}" height="${height - pad.t - pad.b}" data-tip-text="${esc(tip)}" data-tip-x="${x + bw / 2}" data-tip-y="${Math.min(y0, y1)}"/>${close}`;
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

/* ---------- market-brief visuals ---------- */
const fmtK = (n) => (Math.abs(n) >= 1000 ? Math.round(n).toLocaleString('en-IN') : String(Math.round(n * 100) / 100));
const smaAt = (arr, i, n) => (i + 1 >= n ? arr.slice(i + 1 - n, i + 1).reduce((s, v) => s + v, 0) / n : null);

/** Close line + moving averages. series = [[date,o,h,l,c],…] ascending. */
export function priceChart(series, { height = 240, mas = [10, 20, 50, 200], levels = [], label = 'Price' } = {}) {
  if (!series || series.length < 5) return '<p class="sub small">No price history.</p>';
  const closes = series.map((r) => r[4]);
  const maLines = mas.map((n) => ({ n, pts: closes.map((_, i) => smaAt(closes, i, n)) }));
  const shown = Math.min(series.length, 90), off = series.length - shown;
  const pad = { l: 52, r: 14, t: 12, b: 26 };
  const vals = [...closes.slice(off), ...maLines.flatMap((m) => m.pts.slice(off).filter((v) => v != null)), ...levels.map((l) => l.value)];
  const { ticks, lo, hi } = niceTicks(Math.min(...vals), Math.max(...vals), 5);
  const xOf = (i) => pad.l + ((i - off) * (W - pad.l - pad.r)) / (shown - 1);
  const yOf = (v) => pad.t + ((hi - v) / (hi - lo)) * (height - pad.t - pad.b);
  const path = (arr) => { let d = '', pen = false; arr.forEach((v, i) => { if (i < off || v == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${xOf(i).toFixed(1)} ${yOf(v).toFixed(1)} `; pen = true; }); return d; };
  const colors = { 10: 'var(--accent)', 20: 'var(--amber)', 50: 'var(--info)', 200: 'var(--down)' };
  const pts = series.slice(off).map((r, k) => ({ x: +xOf(off + k).toFixed(1), y: +yOf(r[4]).toFixed(1), tip: `${niceDate(r[0])}: ${fmtK(r[4])}` }));
  const last = closes[closes.length - 1];
  return `<div class="chart" data-chart="line" data-points='${esc(JSON.stringify(pts))}'><svg viewBox="0 0 ${W} ${height}" role="img" aria-label="${esc(label)}">
    ${ticks.map((v) => `<line class="grid-line" x1="${pad.l}" x2="${W - pad.r}" y1="${yOf(v)}" y2="${yOf(v)}"/><text class="axis-text" x="${pad.l - 6}" y="${yOf(v) + 4}" text-anchor="end">${esc(fmtK(v))}</text>`).join('')}
    ${levels.map((l) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${yOf(l.value)}" y2="${yOf(l.value)}" stroke="${l.color || 'var(--muted)'}" stroke-width="1" stroke-dasharray="4 4" opacity=".8"/><text class="axis-text" x="${W - pad.r}" y="${yOf(l.value) - 3}" text-anchor="end">${esc(l.label)}</text>`).join('')}
    ${maLines.map((m) => `<path d="${path(m.pts)}" fill="none" stroke="${colors[m.n] || 'var(--muted)'}" stroke-width="1.5" opacity=".9"/>`).join('')}
    <path class="line" d="${path(closes)}"/>
    <circle class="dot" r="4" cx="${xOf(series.length - 1)}" cy="${yOf(last)}"/>
    <text class="axis-text" x="${xOf(series.length - 1) - 6}" y="${yOf(last) - 8}" text-anchor="end" font-weight="700">${esc(fmtK(last))}</text>
    ${[off, off + Math.floor(shown / 2), series.length - 1].map((i, k) => `<text class="axis-text" x="${xOf(i)}" y="${height - pad.b + 16}" text-anchor="${k === 0 ? 'start' : k === 2 ? 'end' : 'middle'}">${esc(shortDate(series[i][0]))}</text>`).join('')}
    <line class="cross" x1="0" x2="0" y1="${pad.t}" y2="${height - pad.b}" data-cross hidden/>
    <rect class="hit" x="${pad.l}" y="${pad.t}" width="${W - pad.l - pad.r}" height="${height - pad.t - pad.b}" data-hit/>
  </svg><div class="tip" data-tip hidden></div>
  <div class="legend chart-legend"><span><i style="background:var(--ink)"></i>Close</span>${mas.map((n) => `<span><i style="background:${colors[n] || 'var(--muted)'}"></i>${n}-DMA</span>`).join('')}</div></div>`;
}

/** Semicircular gauge for a 0–100 value (RSI, sentiment %). zones = [[from,to,cls],…]. */
export function gauge(value, { min = 0, max = 100, zones = [[0, 30, 'ok'], [30, 70, 'mid'], [70, 100, 'low']], label = '', sub = '' } = {}) {
  const cx = 100, cy = 95, r = 80;
  const ang = (v) => Math.PI - ((v - min) / (max - min)) * Math.PI;
  const pt = (v, rad = r) => `${(cx + rad * Math.cos(ang(v))).toFixed(1)} ${(cy - rad * Math.sin(ang(v))).toFixed(1)}`;
  const arc = (a, b) => `M${pt(a)} A${r} ${r} 0 ${b - a > (max - min) / 2 ? 1 : 0} 1 ${pt(b)}`;
  const v = Math.max(min, Math.min(max, value ?? min));
  return `<div class="gauge"><svg viewBox="0 0 200 110" role="img" aria-label="${esc(label)} ${v}">
    ${zones.map(([a, b, c]) => `<path class="zone ${c}" d="${arc(a, b)}" fill="none" stroke-width="14" stroke-linecap="butt"/>`).join('')}
    <line x1="${cx}" y1="${cy}" x2="${pt(v).split(' ')[0]}" y2="${pt(v).split(' ')[1]}" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="5" fill="var(--ink)"/>
    <text x="${cx}" y="${cy - 22}" text-anchor="middle" class="gauge-v">${value == null ? '–' : Math.round(value)}</text>
    <text x="18" y="108" class="axis-text">${min}</text><text x="182" y="108" class="axis-text" text-anchor="end">${max}</text>
  </svg><div class="gauge-l">${esc(label)}${sub ? `<span class="muted"> · ${esc(sub)}</span>` : ''}</div></div>`;
}

/** Vertical ladder of price levels with the current price marked. levels = [{label, value, kind:'r'|'s'|'p'|'ma'}]. */
export function ladder(levels, price, { height = 300 } = {}) {
  const vals = levels.map((l) => l.value).concat([price]);
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  const pad = 16, y = (v) => pad + ((hi - v) / span) * (height - pad * 2);
  const cls = { r: 'neg', s: 'pos', p: 'ink', ma: 'ma' };
  return `<div class="ladder"><svg viewBox="0 0 320 ${height}" role="img" aria-label="Price levels">
    <line x1="60" x2="60" y1="${pad}" y2="${height - pad}" stroke="var(--line)" stroke-width="2"/>
    ${levels.map((l) => `<line x1="52" x2="68" y1="${y(l.value).toFixed(1)}" y2="${y(l.value).toFixed(1)}" class="lv-${cls[l.kind] || 'ink'}" stroke-width="2"/><text x="${l.kind === 'ma' ? 74 : 46}" y="${(y(l.value) + 4).toFixed(1)}" text-anchor="${l.kind === 'ma' ? 'start' : 'end'}" class="axis-text lv-${cls[l.kind] || 'ink'}">${esc(l.label)} ${esc(fmtK(l.value))}</text>`).join('')}
    <polygon points="60,${y(price).toFixed(1)} 72,${(y(price) - 7).toFixed(1)} 72,${(y(price) + 7).toFixed(1)}" fill="var(--accent)"/>
    <rect x="150" y="${(y(price) - 12).toFixed(1)}" width="150" height="24" rx="6" fill="var(--accent)"/><text x="225" y="${(y(price) + 5).toFixed(1)}" text-anchor="middle" fill="#fff" font-size="12" font-weight="700" font-family="inherit">now ${esc(fmtK(price))}</text>
  </svg></div>`;
}

/** Mirrored OI bars per strike: calls to the left (red), puts to the right (green). rows = [{strike, call, put}]. */
export function oiBars(rows, { spot = null, height = null } = {}) {
  if (!rows.length) return '';
  const h = height || 18 * rows.length + 30, max = Math.max(...rows.flatMap((r) => [r.call, r.put]), 1);
  const mid = 320, half = 250, rowH = 18;
  return `<div class="chart" data-chart="bars"><svg viewBox="0 0 640 ${h}" role="img" aria-label="Open interest by strike">
    <text class="axis-text" x="${mid - 8}" y="12" text-anchor="end">Call OI (resistance)</text><text class="axis-text" x="${mid + 8}" y="12">Put OI (support)</text>
    ${rows.map((r, i) => { const y = 22 + i * rowH, cw = (r.call / max) * half, pw = (r.put / max) * half, isSpot = spot != null && Math.abs(r.strike - spot) < 25; return `
      <rect x="${mid - cw}" y="${y}" width="${cw}" height="${rowH - 4}" rx="3" class="bar neg" opacity=".85"/><rect class="hit" x="${mid - half}" y="${y}" width="${half}" height="${rowH - 4}" data-tip-text="${esc(`${r.strike} CE: ${r.call}M OI`)}" data-tip-x="${mid - cw}" data-tip-y="${y}"/>
      <rect x="${mid}" y="${y}" width="${pw}" height="${rowH - 4}" rx="3" class="bar pos" opacity=".85"/><rect class="hit" x="${mid}" y="${y}" width="${half}" height="${rowH - 4}" data-tip-text="${esc(`${r.strike} PE: ${r.put}M OI`)}" data-tip-x="${mid + pw}" data-tip-y="${y}"/>
      <text x="${mid}" y="${y + 12}" text-anchor="middle" class="axis-text" font-weight="${isSpot ? 800 : 400}" fill="${isSpot ? 'var(--accent)' : 'var(--chart-ink)'}">${r.strike}</text>`; }).join('')}
  </svg><div class="tip" data-tip hidden></div></div>`;
}

/** Heat tiles: items = [{label, value (%), sub}] coloured by sign and magnitude. */
export function heatTiles(items, { max = 3 } = {}) {
  const lvl = (v) => Math.min(4, Math.max(1, Math.ceil((Math.abs(v) / max) * 4)));
  return `<div class="heat">${items.map((it) => `<a class="cell ${it.value > 0 ? `pos l${lvl(it.value)}` : it.value < 0 ? `neg l${lvl(it.value)}` : ''}" ${it.href ? `href="${esc(it.href)}"` : ''} title="${esc(it.tip || '')}"><b>${esc(it.label)}</b><span class="num">${it.value == null ? '–' : `${it.value > 0 ? '+' : ''}${Number(it.value).toFixed(1)}%`}</span>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</a>`).join('')}</div>`;
}
