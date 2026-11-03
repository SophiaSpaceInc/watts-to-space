/**
 * Minimal dependency-free SVG charts: lines (linear or log axes), stacked horizontal
 * bars, and a tornado. Colors come from CSS custom properties (styles.css), so light
 * and dark themes swap in one place. Every chart has a hover tooltip; line charts get
 * a crosshair. Small on purpose: contributors can read all of it.
 */
import type { Point } from '../model/sensitivity.ts';

const NS = 'http://www.w3.org/2000/svg';
type Domain = [number, number];

function el(tag: string, attrs: Record<string, string | number> = {}, parent?: Element): SVGElement {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent?.appendChild(node);
  return node;
}

/** Shared tooltip element. */
function tooltip(): HTMLElement {
  let tip = document.getElementById('chart-tooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'chart-tooltip';
    tip.setAttribute('role', 'status');
    document.body.appendChild(tip);
  }
  return tip;
}
function showTip(html: string, evt: PointerEvent): void {
  const tip = tooltip();
  tip.innerHTML = html;
  tip.style.opacity = '1';
  const pad = 14;
  const w = tip.offsetWidth;
  const left = evt.clientX + pad + w > window.innerWidth ? evt.clientX - pad - w : evt.clientX + pad;
  tip.style.left = `${left + window.scrollX}px`;
  tip.style.top = `${evt.clientY + window.scrollY + pad}px`;
}
function hideTip(): void {
  tooltip().style.opacity = '0';
}

/** "Nice" linear ticks (1, 2, 5 × 10ⁿ steps). */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!(max > min)) return [min];
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const ticks: number[] = [];
  for (let t = Math.ceil(min / step) * step; t <= max + step * 1e-9; t += step) ticks.push(+t.toPrecision(12));
  return ticks;
}

/** Log ticks at 1, 2, 5 × 10ⁿ when the range is narrow, else at powers of ten. */
export function logTicks(min: number, max: number): number[] {
  const out: number[] = [];
  const mults = Math.log10(max / min) > 3 ? [1] : [1, 2, 5];
  for (let e = Math.floor(Math.log10(min)); e <= Math.ceil(Math.log10(max)); e++) {
    for (const m of mults) {
      const v = m * 10 ** e;
      if (v >= min * 0.999 && v <= max * 1.001) out.push(v);
    }
  }
  return out;
}

function scale(domain: Domain, range: Domain, log = false): (v: number) => number {
  const [d0, d1] = log ? [Math.log10(domain[0]), Math.log10(domain[1])] : domain;
  const [r0, r1] = range;
  return (v) => r0 + (((log ? Math.log10(v) : v) - d0) / (d1 - d0)) * (r1 - r0);
}

interface LegendItem {
  name: string;
  color: string;
  dash?: boolean;
}

/** Charts narrower than this drop direct labels and stack row labels above bars. */
const NARROW = 560;

function legend(container: HTMLElement, items: LegendItem[], shape: 'line' | 'block' = 'line'): void {
  const box = document.createElement('div');
  box.className = shape === 'block' ? 'legend blocks' : 'legend';
  for (const it of items) {
    const span = document.createElement('span');
    const swatch = it.dash ? `repeating-linear-gradient(90deg, ${it.color} 0 6px, transparent 6px 9px)` : it.color;
    span.innerHTML = `<i style="background:${swatch}"></i>${it.name}`;
    box.appendChild(span);
  }
  container.appendChild(box);
}

export interface Series extends LegendItem {
  points: Point[];
  width?: number;
  /** Context series: drawn faint, so the selected case stands out. */
  muted?: boolean;
  /** Direct label at the line end; defaults to `name`, '' for none. */
  label?: string;
}
export interface Axis {
  label: string;
  log?: boolean;
  /** Offer a log/linear switch for this axis (only meaningful when `log` is the default). */
  toggle?: boolean;
  format: (v: number) => string;
  min?: number;
  max?: number;
}
export interface LineChartOptions {
  series: Series[];
  x: Axis;
  y: Axis;
  markers?: { x: number; y: number; label: string; color?: string }[];
  rules?: { y: number; label: string }[];
  /** Vertical reference lines, e.g. a threshold on the x axis. */
  vrules?: { x: number; label: string }[];
  height?: number;
}

/**
 * Effective axis after the reader's log/linear choice. The choice lives on the
 * container (data-scale-x / data-scale-y), so it survives re-renders from the app.
 * Switching to linear drops the log-tuned min/max so nothing is clipped.
 */
function resolveAxis(container: HTMLElement, which: 'x' | 'y', axis: Axis): Axis {
  const choice = container.dataset[which === 'x' ? 'scaleX' : 'scaleY'];
  if (!axis.toggle || !choice) return axis;
  if (choice === 'log') return { ...axis, log: true };
  return { ...axis, log: false, min: undefined, max: undefined };
}

function scaleToggles(container: HTMLElement, o: LineChartOptions): void {
  const axes = (['x', 'y'] as const).filter((a) => o[a].toggle);
  if (!axes.length) return;
  const bar = document.createElement('div');
  bar.className = 'scale-toggles';
  for (const a of axes) {
    const key = a === 'x' ? 'scaleX' : 'scaleY';
    const current = container.dataset[key] ?? (o[a].log ? 'log' : 'linear');
    const group = document.createElement('div');
    group.className = 'segmented';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', `${a.toUpperCase()} axis scale`);
    group.innerHTML = `<span class="segmented-label">${a.toUpperCase()} axis</span>`;
    for (const mode of ['log', 'linear']) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = mode === 'log' ? 'Log' : 'Linear';
      b.setAttribute('aria-pressed', String(current === mode));
      b.addEventListener('click', () => {
        container.dataset[key] = mode;
        lineChart(container, o);
      });
      group.appendChild(b);
    }
    bar.appendChild(group);
  }
  container.appendChild(bar);
}

export function lineChart(container: HTMLElement, options: LineChartOptions): void {
  container.replaceChildren();
  scaleToggles(container, options);
  const o: LineChartOptions = { ...options, x: resolveAxis(container, 'x', options.x), y: resolveAxis(container, 'y', options.y) };
  legend(container, o.series);
  const W = Math.max(300, container.clientWidth);
  const H = o.height ?? 300;
  const narrow = W < NARROW;
  // Room on the right for the direct labels (~6.6 px per character at 12 px), none when narrow.
  const longest = narrow ? 0 : Math.max(0, ...options.series.filter((s) => s.label !== '').map((s) => (s.label ?? s.name).length));
  const m = { top: 12, right: narrow ? 28 : Math.min(220, Math.max(96, 26 + longest * 6.6)), bottom: 44, left: 64 };
  const ok = (p: Point) => Number.isFinite(p.x) && Number.isFinite(p.y) && (!o.x.log || p.x > 0) && (!o.y.log || p.y > 0);
  const pts = o.series.flatMap((s) => s.points.filter(ok));
  if (!pts.length) {
    container.insertAdjacentHTML('beforeend', '<p class="muted small">Nothing to plot: every value is infeasible or off-scale.</p>');
    return;
  }
  // A flat series (e.g. a sweep pinned by a coolant setpoint) would give a zero-width domain.
  const widen = (d: Domain, log?: boolean): Domain => (d[1] > d[0] ? d : log ? [d[0] / 2, d[0] * 2] : [d[0] - 1, d[0] + 1]);
  const xd = widen([o.x.min ?? Math.min(...pts.map((p) => p.x)), o.x.max ?? Math.max(...pts.map((p) => p.x))], o.x.log);
  let yd = widen([o.y.min ?? Math.min(...pts.map((p) => p.y)), o.y.max ?? Math.max(...pts.map((p) => p.y))], o.y.log);
  if (!o.y.log && o.y.min === undefined) yd = [Math.min(0, yd[0]), yd[1]];
  if (!o.y.log) {
    const t = niceTicks(yd[0], yd[1]);
    yd = [Math.min(yd[0], t[0] ?? yd[0]), Math.max(yd[1], t[t.length - 1] ?? yd[1])];
  }
  // Left margin fits the widest y tick label plus the rotated axis title.
  const yTicks = o.y.log ? logTicks(yd[0], yd[1]) : niceTicks(yd[0], yd[1]);
  m.left = Math.max(48, 30 + Math.max(0, ...yTicks.map((t) => o.y.format(t).length)) * 6.6);
  const X = scale(xd, [m.left, W - m.right], o.x.log);
  const Y = scale(yd, [H - m.bottom, m.top], o.y.log);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'chart' }, container);

  for (const t of yTicks) {
    el('line', { x1: m.left, x2: W - m.right, y1: Y(t), y2: Y(t), class: t === 0 ? 'baseline' : 'grid' }, svg);
    el('text', { x: m.left - 8, y: Y(t) + 4, 'text-anchor': 'end', class: 'tick' }, svg).textContent = o.y.format(t);
  }
  let xTicks = o.x.log ? logTicks(xd[0], xd[1]) : niceTicks(xd[0], xd[1], narrow ? 4 : 6);
  if (narrow && xTicks.length > 6) xTicks = xTicks.filter((t) => Math.abs(Math.log10(t) - Math.round(Math.log10(t))) < 1e-9);
  for (const t of xTicks) {
    el('text', { x: X(t), y: H - m.bottom + 18, 'text-anchor': 'middle', class: 'tick' }, svg).textContent = o.x.format(t);
  }
  el('line', { x1: m.left, x2: W - m.right, y1: H - m.bottom, y2: H - m.bottom, class: 'axis' }, svg);
  const axisTitle = (a: Axis) => `${a.label}${a.log ? ' (log scale)' : ''}`;
  el('text', { x: (m.left + W - m.right) / 2, y: H - 6, 'text-anchor': 'middle', class: 'axis-label' }, svg).textContent = axisTitle(o.x);
  const midY = (m.top + H - m.bottom) / 2;
  el('text', { x: 14, y: midY, transform: `rotate(-90 14 ${midY})`, 'text-anchor': 'middle', class: 'axis-label' }, svg).textContent = axisTitle(o.y);

  for (const r of o.rules ?? []) {
    if (r.y < yd[0] || r.y > yd[1]) continue;
    el('line', { x1: m.left, x2: W - m.right, y1: Y(r.y), y2: Y(r.y), class: 'rule' }, svg);
    el('text', { x: m.left + 6, y: Y(r.y) - 5, class: 'rule-label' }, svg).textContent = r.label;
  }

  for (const r of o.vrules ?? []) {
    if (!(r.x >= xd[0] && r.x <= xd[1])) continue;
    el('line', { x1: X(r.x), x2: X(r.x), y1: m.top, y2: H - m.bottom, class: 'rule' }, svg);
    el('text', { x: X(r.x) + 6, y: m.top + 12, class: 'rule-label' }, svg).textContent = r.label;
  }

  const ends: { y: number; text: string; color: string; muted: boolean }[] = [];
  for (const s of o.series) {
    let d = '';
    let pen = false;
    for (const p of s.points) {
      if (!ok(p) || p.x < xd[0] || p.x > xd[1]) {
        pen = false;
        continue;
      }
      const yy = Math.min(H - m.bottom, Math.max(m.top, Y(p.y)));
      d += `${pen ? 'L' : 'M'}${X(p.x).toFixed(1)},${yy.toFixed(1)}`;
      pen = true;
    }
    el('path', { d, fill: 'none', stroke: s.color, 'stroke-width': s.width ?? 2, 'stroke-dasharray': s.dash ? '6 4' : 'none', 'stroke-linejoin': 'round', 'stroke-linecap': 'round', opacity: s.muted ? 0.35 : 1, class: s.muted ? 'series muted' : 'series' }, svg);
    const last = [...s.points].reverse().find((p) => ok(p) && p.x <= xd[1] && p.y >= yd[0] && p.y <= yd[1]);
    if (!narrow && last && s.label !== '') ends.push({ y: Y(last.y), text: s.label ?? s.name, color: s.color, muted: !!s.muted });
  }
  // Direct labels at line ends, nudged apart vertically.
  ends.sort((a, b) => a.y - b.y);
  ends.forEach((e, i) => {
    const prev = ends[i - 1];
    if (prev) e.y = Math.max(e.y, prev.y + 14);
    el('circle', { cx: W - m.right + 8, cy: e.y, r: 3.5, fill: e.color, opacity: e.muted ? 0.45 : 1 }, svg);
    el('text', { x: W - m.right + 15, y: e.y + 4, class: e.muted ? 'direct-label muted' : 'direct-label' }, svg).textContent = e.text;
  });

  for (const mk of o.markers ?? []) {
    if (![mk.x, mk.y].every(Number.isFinite) || mk.x < xd[0] || mk.x > xd[1] || mk.y < yd[0] || mk.y > yd[1]) continue;
    el('circle', { cx: X(mk.x), cy: Y(mk.y), r: 5, fill: mk.color ?? 'var(--ink)', stroke: 'var(--surface)', 'stroke-width': 2 }, svg);
    el('text', { x: X(mk.x) + 8, y: Y(mk.y) - 8, class: 'marker-label' }, svg).textContent = mk.label;
  }

  // Crosshair + tooltip: nearest point of each series to the pointer's x.
  const cross = el('line', { y1: m.top, y2: H - m.bottom, class: 'crosshair', visibility: 'hidden' }, svg);
  const hit = el('rect', { x: m.left, y: m.top, width: W - m.left - m.right, height: H - m.top - m.bottom, fill: 'transparent' }, svg);
  hit.addEventListener('pointermove', (evt) => {
    const rect = svg.getBoundingClientRect();
    const px = ((evt.clientX - rect.left) / rect.width) * W;
    cross.setAttribute('x1', String(px));
    cross.setAttribute('x2', String(px));
    cross.setAttribute('visibility', 'visible');
    const rows = o.series
      .map((s) => {
        const near = s.points.filter(ok).reduce<Point | null>((a, b) => (!a || Math.abs(X(b.x) - px) < Math.abs(X(a.x) - px) ? b : a), null);
        return near ? `<div><i style="background:${s.color}"></i>${s.name}: <b>${o.y.format(near.y)}</b> <span class="muted">@ ${o.x.format(near.x)}</span></div>` : '';
      })
      .join('');
    showTip(rows, evt);
  });
  hit.addEventListener('pointerleave', () => {
    cross.setAttribute('visibility', 'hidden');
    hideTip();
  });
}

export interface StackedBarsOptions {
  categories: string[];
  segments: { name: string; color: string; values: number[] }[];
  format: (v: number) => string;
  /** Draw each row as 100 % composition (totals still labelled), for rows of very different size. */
  normalize?: boolean;
  /** Rows drawn faint (context), e.g. reference cases other than the selected one. */
  muted?: boolean[];
  /** Row drawn emphasised (the selected case). */
  highlight?: number;
}

/** Horizontal stacked bars (one row per category), with the total at the end of each bar. */
export function stackedBars(container: HTMLElement, o: StackedBarsOptions): void {
  container.replaceChildren();
  legend(container, o.segments, 'block');
  const W = Math.max(300, container.clientWidth);
  const narrow = W < NARROW;
  const rowH = narrow ? 46 : 30;
  const longest = Math.max(0, ...o.categories.map((c) => c.length));
  const m = { top: 6, right: narrow ? 64 : 90, bottom: 8, left: narrow ? 4 : Math.min(270, Math.max(120, 16 + longest * 6.4)) };
  const H = m.top + m.bottom + rowH * o.categories.length;
  const value = (s: StackedBarsOptions['segments'][number], i: number) => {
    const v = s.values[i] ?? 0;
    return Number.isFinite(v) && v > 0 ? v : 0;
  };
  const totals = o.categories.map((_, i) => o.segments.reduce((sum, s) => sum + value(s, i), 0));
  const X = scale([0, o.normalize ? 1 : Math.max(...totals)], [m.left, W - m.right]);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'chart' }, container);
  o.categories.forEach((cat, i) => {
    const y = m.top + i * rowH + (narrow ? 20 : 4);
    const total = totals[i] ?? 0;
    const k = o.normalize && total > 0 ? 1 / total : 1;
    const muted = o.muted?.[i] ?? false;
    const rowClass = i === o.highlight ? 'row-label strong' : muted ? 'row-label muted' : 'row-label';
    if (narrow) el('text', { x: m.left, y: y - 6, class: rowClass }, svg).textContent = cat;
    else el('text', { x: m.left - 10, y: y + 15, 'text-anchor': 'end', class: rowClass }, svg).textContent = cat;
    let acc = 0;
    for (const s of o.segments) {
      const v = value(s, i);
      if (v === 0) continue;
      const r = el('rect', { x: X(acc), y, width: Math.max(0.5, X(acc + v * k) - X(acc)), height: 20, fill: s.color, stroke: 'var(--surface)', 'stroke-width': 2, rx: 2, opacity: muted ? 0.35 : 1 }, svg);
      r.addEventListener('pointermove', (evt) =>
        showTip(`<div><i style="background:${s.color}"></i>${cat}: ${s.name} <b>${o.format(v)}</b> <span class="muted">(${((100 * v) / total).toFixed(0)} %)</span></div>`, evt),
      );
      r.addEventListener('pointerleave', hideTip);
      acc += v * k;
    }
    el('text', { x: X(total * k) + 6, y: y + 14, class: muted ? 'tick muted' : 'tick strong' }, svg).textContent = o.format(total);
  });
}

export interface TornadoOptions {
  rows: { label: string; lowPct: number; highPct: number; lowValue: string; highValue: string }[];
  metricLabel: string;
}

/** Tornado: % change of a metric when each parameter moves down/up one step. */
export function tornadoChart(container: HTMLElement, o: TornadoOptions): void {
  container.replaceChildren();
  legend(
    container,
    [
      { name: `${o.metricLabel} falls`, color: 'var(--div-neg)' },
      { name: `${o.metricLabel} rises`, color: 'var(--div-pos)' },
    ],
    'block',
  );
  const W = Math.max(300, container.clientWidth);
  const narrow = W < NARROW;
  const rowH = narrow ? 40 : 26;
  const m = { top: 8, right: narrow ? 20 : 60, bottom: 30, left: narrow ? 4 : 240 };
  const H = m.top + m.bottom + rowH * o.rows.length;
  const ext = Math.max(5, ...o.rows.flatMap((r) => [Math.abs(r.lowPct), Math.abs(r.highPct)]));
  const X = scale([-ext, ext], [m.left, W - m.right]);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'chart' }, container);
  for (const t of niceTicks(-ext, ext, 6)) {
    el('line', { x1: X(t), x2: X(t), y1: m.top, y2: H - m.bottom, class: t === 0 ? 'baseline' : 'grid' }, svg);
    el('text', { x: X(t), y: H - m.bottom + 16, 'text-anchor': 'middle', class: 'tick' }, svg).textContent = `${t > 0 ? '+' : ''}${t}%`;
  }
  o.rows.forEach((r, i) => {
    const y = m.top + i * rowH + (narrow ? 18 : 4);
    if (narrow) el('text', { x: m.left, y: y - 5, class: 'row-label' }, svg).textContent = r.label;
    else el('text', { x: m.left - 10, y: y + 13, 'text-anchor': 'end', class: 'row-label' }, svg).textContent = r.label;
    const bars: [number, string, string][] = [
      [r.lowPct, r.lowValue, 'low'],
      [r.highPct, r.highValue, 'high'],
    ];
    for (const [pct, value, side] of bars) {
      const rect = el('rect', { x: X(Math.min(0, pct)), y, width: Math.max(1, Math.abs(X(pct) - X(0))), height: 18, rx: 2, fill: pct < 0 ? 'var(--div-neg)' : 'var(--div-pos)', stroke: 'var(--surface)', 'stroke-width': 1 }, svg);
      rect.addEventListener('pointermove', (evt) => showTip(`${r.label} ${side} → <b>${value}</b>: ${pct > 0 ? '+' : ''}${pct.toFixed(1)} %`, evt));
      rect.addEventListener('pointerleave', hideTip);
    }
  });
}
