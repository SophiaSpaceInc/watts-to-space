/**
 * The comparison tab (a Sophia Space addition): SpaceX's Starmind case beside two kinds of
 * Tile, all three at the same peak compute power, on one mass axis.
 *
 * The three scenarios are built from one flat set of knobs. Shared knobs go to all three;
 * the power-subsystem knobs go to Starmind and to the Tiles without solar, which use the
 * same solar array, bus and conversion; each case then has a few knobs of its own. The
 * model itself is untouched: every number comes from evaluateScenario.
 */
import { buildScenario } from '../model/scenarios.ts';
import { evaluateScenario, type MassKey, type Result } from '../model/system.ts';
import type { Scenario } from '../model/types.ts';
import { niceTicks, setChartStamp, stackedBars } from './charts.ts';
import { buildSliders, type Slider } from './sliders.ts';
import { tilePhysicsHtml } from './tilePhysics.ts';

type CaseId = 'starmind' | 'tileShared' | 'tileSolar';
const CASES: { id: CaseId; name: string; short: string; color: string }[] = [
  { id: 'starmind', name: 'SpaceX Starmind (pumped loop)', short: 'Starmind', color: 'var(--s2)' },
  { id: 'tileShared', name: 'Tiles without solar (two-sided radiator)', short: 'Tiles without solar', color: 'var(--s5)' },
  { id: 'tileSolar', name: 'Tiles with solar', short: 'Tiles with solar', color: 'var(--s6)' },
];

type Key =
  | 'peak_kW' | 'avgFrac' | 'limit_K' | 'margin' | 'emissivity' | 'finEff'
  | 'cellEff' | 'arrayDensity' | 'busV' | 'convEff'
  | 'radDensity' | 'loopMass' | 'pumpFrac' | 'rise'
  | 'massA'
  | 'massB' | 'cellEffB' | 'tilt' | 'coef';
type Group = 'shared' | 'power' | 'starmind' | 'tileShared' | 'tileSolar';

interface Knob extends Slider<Key> {
  group: Group;
  /** ± step for the sensitivity chart (a fraction of the value when `relative`); omitted = not swept. */
  swing?: number;
  relative?: boolean;
}

type State = Record<Key, number>;

const DEFAULTS: State = {
  peak_kW: 250, avgFrac: 0.7, limit_K: 373, margin: 1.25, emissivity: 0.9, finEff: 0.9,
  cellEff: 0.22, arrayDensity: 2, busV: 800, convEff: 0.95,
  radDensity: 6, loopMass: 5, pumpFrac: 0.01, rise: 10,
  massA: 7,
  massB: 6, cellEffB: 0.22, tilt: 0, coef: -0.003,
};
const state: State = { ...DEFAULTS };

/** The three scenarios for one set of knobs. `rolledUp: false` builds the Tiles from their parts instead. */
function build(st: State, rolledUp = true): Record<CaseId, Scenario> {
  const shared = (s: Scenario): Scenario => {
    s.heatSource.totalPower_W = st.peak_kW * 1000;
    s.heatSource.averageFraction = st.avgFrac;
    s.heatSource.maxTemperature_K = st.limit_K;
    s.radiator.sizingMargin = st.margin;
    s.radiator.emissivity = st.emissivity;
    s.radiator.finEfficiency = st.finEff;
    return s;
  };
  const starmind = shared(buildScenario('starmind'));
  starmind.radiator.arealDensity_kg_m2 = st.radDensity;
  starmind.radiator.loopSpecificMass_kg_per_kW = st.loopMass;
  starmind.loop.rise_K = st.rise;
  Object.assign(starmind.power, { pumpFraction: st.pumpFrac, cellEfficiency: st.cellEff, solarArrayArealDensity_kg_m2: st.arrayDensity, busVoltage_V: st.busV, conversionEfficiency: st.convEff });

  // Tiles without solar take Starmind's whole power subsystem; only the pumps go.
  const tileShared = shared(buildScenario('tileShared'));
  tileShared.power = { ...structuredClone(starmind.power), pumpFraction: 0 };
  if (rolledUp) tileShared.tile!.massPerTile_kg = st.massA;

  const tileSolar = shared(buildScenario('tileSolar'));
  Object.assign(tileSolar.power, { cellEfficiency: st.cellEffB, conversionEfficiency: st.convEff, overheadFraction: starmind.power.overheadFraction, battery: structuredClone(starmind.power.battery) });
  Object.assign(tileSolar.tile!, { sunAngle_deg: st.tilt, cellTemperatureCoefficient_per_K: st.coef });
  if (rolledUp) tileSolar.tile!.massPerTile_kg = st.massB;
  return { starmind, tileShared, tileSolar };
}

/** What today's part-by-part Tile assumptions add up to per Tile, for a given heat-pipe panel density. */
function builtUpTileMass(id: 'tileShared' | 'tileSolar', panel_kg_m2: number): number {
  const s = build(DEFAULTS, false)[id];
  s.radiator.arealDensity_kg_m2 = panel_kg_m2;
  const r = evaluateScenario(s);
  const m = r.mass_kg;
  const onTiles = m.radiator + m.powerConversion + m.tileOverhead + m.tileStructure + (id === 'tileSolar' ? m.solarArray : 0);
  return onTiles / (r.tile?.count ?? NaN);
}

const nf = (d: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const fmt = (v: number, d = 0) => (Number.isFinite(v) ? nf(d).format(v) : '∞');
const fmtT = (kg: number) => (Number.isFinite(kg) ? `${fmt(kg / 1000, 1)} t` : 'does not close');
const fmtC = (K: number) => `${fmt(K - 273.15)} °C`;
const byId = (id: string) => document.getElementById(id) as HTMLElement;

function knobs(): Knob[] {
  const ref = (id: 'tileShared' | 'tileSolar') => `Today's part-by-part assumptions come to ${fmt(builtUpTileMass(id, 5), 1)} kg (${fmt(builtUpTileMass(id, 2.5), 1)} to ${fmt(builtUpTileMass(id, 7.5), 1)} kg for a 2.5 to 7.5 kg/m² heat-pipe panel). Compute modules are not included.`;
  return [
    { group: 'shared', key: 'peak_kW', label: 'Peak compute power', unit: 'kW', min: 10, max: 2000, step: 10, hint: 'The same for all three cases, always.' },
    { group: 'shared', key: 'avgFrac', label: 'Average load, share of peak', unit: '', min: 0.3, max: 1, step: 0.01, hint: 'Solar cells are sized for the average, radiators for the peak.', swing: 0.1 },
    { group: 'shared', key: 'limit_K', label: 'Chip temperature limit', unit: 'K', min: 333, max: 400, step: 1, hint: '373 K is 100 °C. The Tiles get the same limit as Starmind.', swing: 10 },
    { group: 'shared', key: 'margin', label: 'Radiator sizing margin', unit: '×', min: 1, max: 2, step: 0.05, hint: 'Extra radiator area over the nominal model.', swing: 0.1 },
    { group: 'shared', key: 'emissivity', label: 'Radiator emissivity', unit: '', min: 0.5, max: 1, step: 0.01, hint: 'The same coating for every radiating surface.', swing: 0.05 },
    { group: 'shared', key: 'finEff', label: 'Radiator fin efficiency', unit: '', min: 0.5, max: 1, step: 0.01, hint: 'How evenly heat spreads across the panel.', swing: 0.05 },

    { group: 'power', key: 'cellEff', label: 'Solar array cell efficiency', unit: '', min: 0.1, max: 0.4, step: 0.005, hint: '22 % with these settings gives SpaceX\'s stated 250 W/m².', swing: 0.1, relative: true },
    { group: 'power', key: 'arrayDensity', label: 'Solar array areal density', unit: 'kg/m²', min: 0.2, max: 6, step: 0.1, hint: 'Deployed solar array, structure included.', swing: 0.2, relative: true },
    { group: 'power', key: 'busV', label: 'Bus voltage', unit: 'V', min: 28, max: 1500, step: 1, hint: 'Harness copper for a fixed loss scales as 1/V².', swing: 0.5, relative: true },
    { group: 'power', key: 'convEff', label: 'Bus-to-payload conversion', unit: '', min: 0.8, max: 1, step: 0.005, hint: 'Applies to all three cases.', swing: 0.02 },

    { group: 'starmind', key: 'radDensity', label: 'Radiator areal density', unit: 'kg/m²', min: 1, max: 20, step: 0.1, hint: 'Deployable pumped-fluid radiator panel.', swing: 0.2, relative: true },
    { group: 'starmind', key: 'loopMass', label: 'Pumps and loop hardware', unit: 'kg/kW', min: 0, max: 25, step: 0.1, hint: 'Pumps, accumulators, valves, joints, per kW of heat.', swing: 0.2, relative: true },
    { group: 'starmind', key: 'pumpFrac', label: 'Pump power, share of payload', unit: '', min: 0, max: 0.1, step: 0.001, hint: 'Electricity the pumps draw; it also becomes heat.', swing: 0.005 },
    { group: 'starmind', key: 'rise', label: 'Coolant rise across the radiator', unit: 'K', min: 0, max: 40, step: 1, hint: 'A larger rise means a colder radiator on average.', swing: 5 },

    { group: 'tileShared', key: 'massA', label: 'Mass per Tile', unit: 'kg', min: 2, max: 20, step: 0.1, hint: ref('tileShared'), swing: 0.2, relative: true },

    { group: 'tileSolar', key: 'massB', label: 'Mass per Tile', unit: 'kg', min: 2, max: 20, step: 0.1, hint: ref('tileSolar'), swing: 0.2, relative: true },
    { group: 'tileSolar', key: 'cellEffB', label: 'Cell efficiency on the Tile', unit: '', min: 0.1, max: 0.4, step: 0.005, hint: 'Independent of the deployed solar array above.', swing: 0.1, relative: true },
    { group: 'tileSolar', key: 'tilt', label: 'Tilt away from the Sun', unit: '°', min: 0, max: 70, step: 1, hint: 'Cooler Tiles, less power each, more Tiles.', swing: 20 },
    { group: 'tileSolar', key: 'coef', label: 'Cell output per kelvin', unit: '/K', min: -0.006, max: 0, step: 0.0005, hint: 'Cells on a Tile run hotter than on a free solar array.', swing: 0.001 },
  ];
}

let KNOBS: Knob[] = [];

function evaluateAll(st: State): Record<CaseId, { s: Scenario; r: Result }> {
  const built = build(st);
  const out = {} as Record<CaseId, { s: Scenario; r: Result }>;
  for (const c of CASES) out[c.id] = { s: built[c.id], r: evaluateScenario(built[c.id]) };
  return out;
}

// ---------------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------------

function renderCards(all: Record<CaseId, { s: Scenario; r: Result }>): void {
  const box = byId('cmp-cards');
  const peak = state.peak_kW;
  box.innerHTML = CASES.map((c) => {
    const { s, r } = all[c.id];
    const x = r.tile;
    const ok = r.feasible && Number.isFinite(r.totalMass_kg);
    const problem = r.warnings.find((w) => w.level === 'error')?.text;
    const power = x
      ? `<p class="cmp-power"><b>${ok ? fmt(x.payloadPeak_W) : '–'} W</b> of compute per Tile</p>
         <p class="cmp-power-sub">× ${ok ? fmt(x.count) : '–'} Tiles = ${fmt(peak)} kW peak · ${ok ? fmt(x.unitsPerTile, 1) : '–'} Thor modules of ${fmt(s.heatSource.unitPower_W)} W on each</p>`
      : `<p class="cmp-power"><b>${fmt(peak)} kW</b> in one payload</p>
         <p class="cmp-power-sub">${fmt(peak * 1000 / s.heatSource.unitPower_W)} GPU packages of ${fmt(s.heatSource.unitPower_W / 1000, 1)} kW, cooled by one pumped loop</p>`;
    const rows: [string, string][] = [
      ['Radiator area', ok ? `${fmt(r.radiatorArea_m2)} m²${x ? ` (${fmt(x.radiatorAreaPerTile_m2, 2)} m² per Tile)` : ''}` : '–'],
      ['Radiator temperature', `${fmtC(x ? x.radiator_K : r.chain.fluidEffective_K)}`],
      ['Solar cell area', ok ? `${fmt(r.solarArrayArea_m2)} m²${s.tile?.kind === 'integratedSolar' ? ' (on the Tiles)' : ''}` : '–'],
      ['Solar power per m²', `${fmt(r.solarArraySpecific_W_m2)} W`],
    ];
    if (x?.cell_K) rows.push(['Cell temperature', fmtC(x.cell_K)]);
    return `<article class="cmp-card" style="--case:${c.color}">
        <h3>${c.name}</h3>
        <p class="cmp-mass"><b>${ok ? fmtT(r.totalMass_kg) : 'Does not close'}</b>${ok ? ` <span>${fmt(r.specificMass_kg_per_kW, 1)} kg per kW of peak compute</span>` : ''}</p>
        ${power}
        <dl>${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
        ${problem ? `<p class="cmp-problem">${problem}</p>` : ''}
      </article>`;
  }).join('');
}

// ---------------------------------------------------------------------------------
// Stacked mass bars (shared axis)
// ---------------------------------------------------------------------------------

const SEGMENTS: [string, string, MassKey[]][] = [
  ['Radiator', 'var(--s1)', ['radiator']],
  ['Pumps & loop', 'var(--s2)', ['thermalLoop']],
  ['Tiles', 'var(--s6)', ['tiles', 'powerConversion', 'tileOverhead', 'tileStructure']],
  ['Solar array', 'var(--s3)', ['solarArray']],
  ['Battery', 'var(--s4)', ['battery']],
  ['Harness', 'var(--s5)', ['harness']],
];

function renderMass(all: Record<CaseId, { s: Scenario; r: Result }>): void {
  setChartStamp(`Three cases at ${fmt(state.peak_kW)} kW peak / ${fmt(state.peak_kW * state.avgFrac)} kW average · Earth orbit, 600 km, β 70° · Sophia Space fork of watts-to-space by Chris Lewicki, CC BY 4.0`);
  stackedBars(byId('cmp-mass'), {
    categories: CASES.map((c) => c.short),
    segments: SEGMENTS.map(([name, color, keys]) => ({ name, color, values: CASES.map((c) => keys.reduce((sum, k) => sum + all[c.id].r.mass_kg[k], 0)) })),
    format: (v) => `${fmt(v)} kg`,
  });
}

// ---------------------------------------------------------------------------------
// Stacked tornado: one group per case, all on one axis of actual mass
// ---------------------------------------------------------------------------------

interface Bar {
  label: string;
  unit: string;
  lowInput: number;
  highInput: number;
  lowMass: number;
  highMass: number;
}

function sensitivities(id: CaseId, base: number): Bar[] {
  const bars: Bar[] = [];
  for (const k of KNOBS) {
    if (k.swing === undefined) continue;
    const v = state[k.key];
    const d = k.relative ? Math.abs(v) * k.swing : k.swing;
    const lowInput = Math.max(k.min, v - d);
    const highInput = Math.min(k.max, v + d);
    const mass = (input: number) => evaluateScenario(build({ ...state, [k.key]: input })[id]).totalMass_kg;
    const lowMass = lowInput === v ? base : mass(lowInput);
    const highMass = highInput === v ? base : mass(highInput);
    if (Math.abs(lowMass - base) < 1 && Math.abs(highMass - base) < 1) continue; // this knob does not touch this case
    bars.push({ label: k.label, unit: k.unit, lowInput, highInput, lowMass, highMass });
  }
  const span = (b: Bar) => (Number.isFinite(b.lowMass) && Number.isFinite(b.highMass) ? Math.abs(b.highMass - b.lowMass) : Infinity);
  return bars.sort((a, b) => span(b) - span(a));
}

const SVG = 'http://www.w3.org/2000/svg';
function el(tag: string, attrs: Record<string, string | number>, parent: Element, text?: string): SVGElement {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  parent.appendChild(e);
  return e;
}
const inputText = (v: number, unit: string) => `${+v.toPrecision(3)}${unit && unit !== '×' ? ` ${unit}` : unit}`;

function renderTornado(all: Record<CaseId, { s: Scenario; r: Result }>): void {
  const box = byId('cmp-tornado');
  box.replaceChildren();
  const groups = CASES.map((c) => ({ c, base: all[c.id].r.totalMass_kg, bars: Number.isFinite(all[c.id].r.totalMass_kg) ? sensitivities(c.id, all[c.id].r.totalMass_kg) : [] }));
  const finite = groups.flatMap((g) => [g.base, ...g.bars.flatMap((b) => [b.lowMass, b.highMass])]).filter(Number.isFinite);
  if (!finite.length) return;
  const ticks = niceTicks(Math.min(...finite), Math.max(...finite), 6);
  const step = (ticks[1] ?? 1) - (ticks[0] ?? 0);
  // Pad both ends so the input values printed beside each bar stay clear of the row labels and the edge.
  const spread = Math.max(...finite) - Math.min(...finite) || step;
  const d0 = Math.min(...finite) - 0.07 * spread;
  const d1 = Math.max(...finite) + 0.07 * spread + (groups.some((g) => g.bars.some((b) => !Number.isFinite(b.lowMass) || !Number.isFinite(b.highMass))) ? step : 0);

  const W = Math.max(300, box.clientWidth);
  const narrow = W < 640;
  const m = { top: 26, right: narrow ? 46 : 70, bottom: 34, left: narrow ? 8 : 250 };
  const rowH = narrow ? 40 : 26;
  const headH = 34;
  const gap = 14;
  const H = m.top + m.bottom + groups.reduce((h, g) => h + headH + rowH * Math.max(1, g.bars.length) + gap, 0);
  const X = (v: number) => m.left + ((Math.min(v, d1) - d0) / (d1 - d0)) * (W - m.left - m.right);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'chart', role: 'img', 'aria-label': 'Sensitivity of power and thermal mass to each input, for the three cases on one axis' }, box);

  for (const t of ticks.filter((v) => v >= d0 && v <= d1)) {
    el('line', { x1: X(t), x2: X(t), y1: m.top, y2: H - m.bottom, stroke: 'var(--grid)', 'stroke-width': 1 }, svg);
    for (const y of [m.top - 8, H - m.bottom + 16]) el('text', { x: X(t), y, 'text-anchor': 'middle', class: 'tick' }, svg, fmt(t / 1000, step < 1000 ? 1 : 0));
  }
  el('text', { x: W - m.right, y: H - 4, 'text-anchor': 'end', class: 'axis-label' }, svg, 'Power and thermal mass (t)');

  let y = m.top;
  for (const g of groups) {
    el('rect', { x: m.left, y: y + 9, width: 10, height: 10, rx: 2, fill: g.c.color }, svg);
    el('text', { x: m.left + 16, y: y + 19, class: 'row-label strong' }, svg, `${g.c.short}: ${fmtT(g.base)} as set`);
    y += headH;
    if (!g.bars.length) {
      el('text', { x: m.left + 16, y: y + 14, class: 'row-label muted' }, svg, Number.isFinite(g.base) ? 'No input moves this case.' : 'This case does not close under these settings.');
      y += rowH;
    }
    for (const b of g.bars) {
      const by = y + (narrow ? 18 : 4);
      const name = `${b.label}${b.unit ? ` (${b.unit})` : ''}`;
      if (narrow) el('text', { x: m.left, y: y + 12, class: 'row-label' }, svg, name);
      else el('text', { x: m.left - 12, y: by + 13, 'text-anchor': 'end', class: 'row-label' }, svg, name);
      // Left end of the bar is whichever input gives the lower mass.
      const ends = [
        { mass: b.lowMass, input: b.lowInput },
        { mass: b.highMass, input: b.highInput },
      ].sort((p, q) => (Number.isFinite(p.mass) ? p.mass : Infinity) - (Number.isFinite(q.mass) ? q.mass : Infinity));
      const [lo, hi] = ends as [(typeof ends)[number], (typeof ends)[number]];
      const x0 = X(lo.mass);
      const x1 = Number.isFinite(hi.mass) ? X(hi.mass) : X(d1);
      el('rect', { x: x0, y: by, width: Math.max(1.5, x1 - x0), height: 16, rx: 2, fill: g.c.color, opacity: 0.8 }, svg);
      // This case's mass as set, marked across every bar of its group.
      el('line', { x1: X(g.base), x2: X(g.base), y1: by - 4, y2: by + 20, stroke: 'var(--ink)', 'stroke-width': 1.5 }, svg);
      el('text', { x: x0 - 5, y: by + 12, 'text-anchor': 'end', class: 'tick' }, svg, +lo.input.toPrecision(3) + '');
      el('text', { x: x1 + 5, y: by + 12, class: 'tick' }, svg, Number.isFinite(hi.mass) ? +hi.input.toPrecision(3) + '' : `${+hi.input.toPrecision(3)}: does not close`);
      y += rowH;
    }
    y += gap;
  }

  const table = document.createElement('details');
  table.innerHTML = `<summary>Values as a table</summary><div class="table-scroll"><table class="data"><tr><th>Case</th><th>Input</th><th>Low input</th><th>Mass</th><th>High input</th><th>Mass</th></tr>${groups
    .flatMap((g) => g.bars.map((b) => `<tr><td>${g.c.short}</td><td>${b.label}</td><td>${inputText(b.lowInput, b.unit)}</td><td>${fmtT(b.lowMass)}</td><td>${inputText(b.highInput, b.unit)}</td><td>${fmtT(b.highMass)}</td></tr>`))
    .join('')}</table></div>`;
  box.appendChild(table);
}

// ---------------------------------------------------------------------------------
// Page wiring
// ---------------------------------------------------------------------------------

function render(): void {
  const all = evaluateAll(state);
  renderCards(all);
  renderMass(all);
  renderTornado(all);
  byId('cmp-physics-tileShared').innerHTML = tilePhysicsHtml(all.tileShared.s, all.tileShared.r) ?? '';
  byId('cmp-physics-tileSolar').innerHTML = tilePhysicsHtml(all.tileSolar.s, all.tileSolar.r) ?? '';
  byId('cmp-reset').toggleAttribute('disabled', KNOBS.every((k) => state[k.key] === DEFAULTS[k.key]));
  for (const b of document.querySelectorAll<HTMLButtonElement>('#cmp-cells button')) b.setAttribute('aria-pressed', String(Number(b.dataset.eff) === state.cellEffB));
}

function buildControls(): void {
  for (const group of ['shared', 'power', 'starmind', 'tileShared', 'tileSolar'] as Group[]) {
    buildSliders(byId(`cmp-controls-${group}`), KNOBS.filter((k) => k.group === group), state, render);
  }
}

function showView(view: 'compare' | 'explorer'): void {
  for (const v of ['compare', 'explorer'] as const) {
    byId(`view-${v}`).hidden = v !== view;
    byId(`tab-${v}`).setAttribute('aria-selected', String(v === view));
  }
  try {
    localStorage.setItem('w2s-view', view);
  } catch {
    // Storage can be unavailable; the tabs still work.
  }
  // Charts measure their boxes, so redraw whichever view just became visible.
  if (view === 'compare') render();
  else window.dispatchEvent(new Event('resize'));
}

function init(): void {
  if (!document.getElementById('view-compare')) return;
  // Start each rolled-up Tile mass at what the part-by-part assumptions come to.
  DEFAULTS.massA = Math.round(builtUpTileMass('tileShared', 5) * 10) / 10;
  DEFAULTS.massB = Math.round(builtUpTileMass('tileSolar', 5) * 10) / 10;
  Object.assign(state, DEFAULTS);
  KNOBS = knobs();
  buildControls();
  byId('cmp-reset').addEventListener('click', () => {
    Object.assign(state, DEFAULTS);
    buildControls();
    render();
  });
  for (const b of document.querySelectorAll<HTMLButtonElement>('#cmp-cells button')) {
    b.addEventListener('click', () => {
      state.cellEffB = Number(b.dataset.eff);
      state.coef = Number(b.dataset.coef);
      buildControls();
      render();
    });
  }
  byId('tab-compare').addEventListener('click', () => showView('compare'));
  byId('tab-explorer').addEventListener('click', () => showView('explorer'));
  let saved: string | null = null;
  try {
    saved = localStorage.getItem('w2s-view');
  } catch {
    saved = null;
  }
  // A link into the explorer (a share link, or an anchor such as #faq) opens the explorer.
  const wantsExplorer = new URLSearchParams(location.search).has('s') || (location.hash.length > 1 && !!document.querySelector(`#view-explorer #${CSS.escape(location.hash.slice(1))}`));
  showView(wantsExplorer || saved === 'explorer' ? 'explorer' : 'compare');
  let timer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (!byId('view-compare').hidden) render();
    }, 150);
  });
}

init();
