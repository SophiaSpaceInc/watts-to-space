/**
 * Page wiring: mode switch, grouped controls, scenario import/export, KPI tiles,
 * charts, assumptions. All physics lives in ../model/. This file only reads results
 * and draws them.
 */
import { BODIES, COOLANTS } from '../model/constants.ts';
import { absorbedFluxPerFace, orientationLabel } from '../model/environment.ts';
import { emittedFlux, netRejectionPerPanelArea } from '../model/radiation.ts';
import { buildScenario, ENVIRONMENTS, HEAT_SOURCES, MODES, PARAMETERS, SOURCES, type Param } from '../model/scenarios.ts';
import { changesFromMode, exportScenario, importScenario, ScenarioImportError, type Change } from '../model/scenarioIO.ts';
import { getPath, sweep, tornado, withPath } from '../model/sensitivity.ts';
import { evaluateScenario, type MassKey, type Result } from '../model/system.ts';
import type { ChainResult } from '../model/thermalChain.ts';
import { transportCurves, wiedemannFranzEquivalentVoltage } from '../model/transport.ts';
import type { BodyId, CoolantId, ModeId, Orientation, Scenario } from '../model/types.ts';
import { lineChart, stackedBars, tornadoChart, type Series } from './charts.ts';

const MODE_COLORS: Record<ModeId, string> = { iss: 'var(--s1)', starmind: 'var(--s2)', ideal: 'var(--s3)', physics: 'var(--s4)' };
const MODE_IDS = Object.keys(MODES) as ModeId[];
const YOURS = 'var(--ink)';

let scenario: Scenario = buildScenario('starmind');

// ------------------------------------------------------------------ helpers
function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing element #${id}`);
  return node as T;
}
const nf = (d: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const fmt = (v: number, d = 0) => (Number.isFinite(v) ? nf(d).format(v) : '∞');
const fmtK = (T: number) => `${fmt(T)} K (${fmt(T - 273.15)} °C)`;
const fmtT = (kg: number) => (kg >= 1e5 ? `${fmt(kg / 1000)} t` : kg >= 1000 ? `${fmt(kg / 1000, 1)} t` : `${fmt(kg)} kg`);
const fmtLen = (m: number) => (m < 1e-3 ? `${fmt(m * 1e6)} µm` : m < 0.01 ? `${fmt(m * 1e3, m < 2e-3 ? 1 : 0)} mm` : m < 1 ? `${fmt(m * 100)} cm` : `${fmt(m)} m`);
const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (s: unknown) => String(s).replace(/[&<>"]/g, (c) => ESCAPES[c] ?? c);
/** Render [source-id] tags in a note as links to the reference list. */
const cite = (text: string) =>
  esc(text).replace(/\[([a-z0-9-]+)\]/g, (whole, id: string) => {
    const src = SOURCES[id];
    return src ? `<a href="#ref-${id}" title="${esc(src.title)}">[${id}]</a>` : whole;
  });
const num = (path: string) => getPath(scenario, path) as number;

// ------------------------------------------------------------------ controls
function buildControls(): void {
  const modes = byId('modes');
  modes.replaceChildren();
  for (const id of MODE_IDS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = MODES[id].name;
    b.setAttribute('aria-pressed', String(id === scenario.mode));
    b.style.setProperty('--mode-color', MODE_COLORS[id]);
    b.addEventListener('click', () => {
      scenario = buildScenario(id);
      buildControls();
      render();
    });
    modes.appendChild(b);
  }
  byId('mode-summary').textContent = MODES[scenario.mode].summary;

  // One collapsible group per parameter group; each group's selector sits with its sliders.
  // Open/closed state survives rebuilds (mode switch, import); groups start open on wide
  // screens where the rail scrolls on its own, and closed on narrow screens.
  const box = byId('controls');
  for (const d of box.querySelectorAll<HTMLDetailsElement>('details.control-group')) groupOpen.set(d.dataset.group ?? '', d.open);
  box.replaceChildren();
  for (const group of [...new Set(PARAMETERS.map((p) => p.group))]) {
    const key = group.toLowerCase().replace(/[^a-z]+/g, '-');
    const details = document.createElement('details');
    details.className = 'control-group';
    details.dataset.group = key;
    details.open = groupOpen.get(key) ?? WIDE.matches;
    details.innerHTML = `<summary><span class="group-name">${esc(group)}</span><span class="group-hint"></span></summary>`;
    const fs = document.createElement('fieldset');
    fs.innerHTML = `<legend class="sr-only">${esc(group)}</legend>`;
    const select = GROUP_SELECTS[group]?.();
    if (select) {
      fs.appendChild(select);
      // When the group is collapsed, its summary shows the current selection.
      const sel = select.querySelector('select');
      const hint = details.querySelector<HTMLElement>('.group-hint');
      const showHint = () => hint && (hint.textContent = sel?.selectedOptions[0]?.text ?? '');
      sel?.addEventListener('change', showHint);
      showHint();
    }
    for (const p of PARAMETERS) if (p.group === group && (!p.when || p.when(scenario))) fs.appendChild(paramRow(p));
    details.appendChild(fs);
    box.appendChild(details);
  }
}
const groupOpen = new Map<string, boolean>();
const WIDE = window.matchMedia('(min-width: 901px)');
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');

/** A labelled select. A value missing from the presets (e.g. from an imported file) is kept as its own option. */
function selectRow(label: string, options: [string, string][], value: string, onChange: (v: string) => void): HTMLElement {
  const row = document.createElement('label');
  row.className = 'select-row';
  row.innerHTML = `<span class="control-label">${esc(label)}</span>`;
  const sel = document.createElement('select');
  const opts = options.some(([v]) => v === value) ? options : [...options, [value, `Imported: ${value}`] as [string, string]];
  sel.replaceChildren(...opts.map(([v, text]) => new Option(text, v, false, v === value)));
  sel.addEventListener('change', () => onChange(sel.value));
  row.appendChild(sel);
  return row;
}

const GROUP_SELECTS: Record<string, () => HTMLElement> = {
  'Heat source': () =>
    selectRow('Type', Object.entries(HEAT_SOURCES).map(([id, h]) => [id, h.label]), scenario.heatSourceId, (id) => {
      const hs = HEAT_SOURCES[id];
      if (!hs) return;
      scenario = { ...scenario, heatSourceId: id, heatSource: structuredClone(hs.heatSource), loop: { ...scenario.loop, coolant: hs.loopCoolant }, notes: { ...scenario.notes, ...hs.notes }, reported: null };
      buildControls();
      render();
    }),
  'Coolant loop': () =>
    selectRow('Coolant', Object.entries(COOLANTS).map(([id, c]) => [id, `${c.name} (${fmt(c.min_K)}–${fmt(c.max_K)} K)`]), scenario.loop.coolant, (id) => {
      scenario = { ...scenario, loop: { ...scenario.loop, coolant: id as CoolantId } };
      render();
    }),
  Radiator: () =>
    selectRow('Orientation', (['edgeOn', 'nadirZenith', 'zenithOnly'] as Orientation[]).map((o) => [o, orientationLabel(scenario.environment, o)]), scenario.radiator.orientation, (o) => {
      scenario = { ...scenario, radiator: { ...scenario.radiator, orientation: o as Orientation } };
      render();
    }),
  Environment: () =>
    selectRow('Location', Object.entries(ENVIRONMENTS).map(([id, e]) => [id, e.label]), scenario.environmentId, (id) => {
      const env = ENVIRONMENTS[id];
      if (!env) return;
      scenario = { ...scenario, environmentId: id, environment: structuredClone(env.environment), notes: { ...scenario.notes, ...env.notes }, reported: null };
      buildControls();
      render();
    }),
};

/** Slider plus a typed number box, kept in sync; typed values are clamped to the slider range. */
function paramRow(p: Param): HTMLElement {
  const k = p.display ?? 1;
  const id = `p-${p.path.replace(/\./g, '-')}`;
  const note = scenario.notes[p.path];
  const row = document.createElement('div');
  row.className = 'param';
  row.innerHTML = `<div class="param-head">
      <label class="control-label" for="${id}">${esc(p.label)}</label>
      ${note ? `<button type="button" class="info" aria-label="Show where ${esc(p.label)} comes from, in the assumptions table" title="${esc(note)}\n\nClick to jump to this row in the assumptions table (Back returns here).">i</button>` : ''}
      <span class="param-value"><input id="${id}" type="number" inputmode="decimal" min="${p.min * k}" max="${p.max * k}" step="any"><span class="unit">${esc(p.unit)}</span></span>
    </div>
    <input type="range" min="${p.min * k}" max="${p.max * k}" step="${p.step * k}" aria-label="${esc(p.label)}" tabindex="-1">`;
  const [box, range] = Array.from(row.querySelectorAll('input')) as [HTMLInputElement, HTMLInputElement];
  const sync = () => {
    const v = num(p.path) * k;
    box.value = String(+v.toPrecision(6));
    range.value = String(v);
  };
  const set = (shown: number) => {
    if (Number.isFinite(shown)) scenario = withPath(scenario, p.path, Math.min(p.max, Math.max(p.min, shown / k)));
    sync();
    scheduleRender();
  };
  range.addEventListener('input', () => set(Number(range.value)));
  box.addEventListener('change', () => set(Number(box.value)));
  row.querySelector('.info')?.addEventListener('click', () => jumpTo(`note-${p.path}`));
  sync();
  return row;
}

/**
 * Jump to an element by URL fragment, so the browser's Back button returns to where the
 * reader was, and CSS :target keeps the row tinted. A short flash draws the eye; focus
 * moves to the row so screen readers announce it.
 */
function jumpTo(id: string): void {
  if (location.hash === `#${id}`) highlightTarget(true);
  else location.hash = id;
}

function highlightTarget(rescroll = false): void {
  const el = location.hash ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
  if (!el) return;
  if (rescroll) el.scrollIntoView({ behavior: REDUCED_MOTION.matches ? 'auto' : 'smooth', block: 'center' });
  el.classList.remove('flash');
  void el.offsetWidth; // restart the animation
  el.classList.add('flash');
  el.focus({ preventScroll: true });
}
window.addEventListener('hashchange', () => highlightTarget());

let pending = 0;
function scheduleRender(): void {
  cancelAnimationFrame(pending);
  pending = requestAnimationFrame(render);
}

// ------------------------------------------------------------------ render
interface Preset {
  id: ModeId;
  r: Result;
}

function render(): void {
  const r = evaluateScenario(scenario);
  const presets: Preset[] = MODE_IDS.map((id) => ({ id, r: evaluateScenario(buildScenario(id)) }));
  const changes = changesFromMode(scenario);
  renderScenarioBar(changes);
  renderKpis(r);
  renderWarnings(r);
  renderStaircase(r, presets, changes.length > 0);
  renderDesignCurves(r);
  renderTemperatureSweep(r);
  renderAltitude(r);
  renderMass(r, presets, changes.length > 0);
  renderTornado();
  renderTransport(r);
  renderAssumptions();
}

const fmtValue = (v: unknown) => (typeof v === 'number' ? String(+v.toPrecision(4)) : v === undefined ? '—' : typeof v === 'object' ? 'set' : String(v));

/** Reference case or modified? List what changed, collapsing a replaced source stack into one line. */
function renderScenarioBar(changes: Change[]): void {
  const name = esc(MODES[scenario.mode].name);
  const lines = new Map<string, string>();
  for (const c of changes) {
    const stack = c.path.startsWith('heatSource.stages');
    if (stack) lines.set('heatSource.stages', 'source stack changed');
    else lines.set(c.path, `${fmtValue(c.from)} → ${fmtValue(c.to)}`);
  }
  byId('scenario-status').innerHTML = changes.length
    ? `<span class="badge modified">Modified</span> <span>${name}, with ${lines.size} change${lines.size === 1 ? '' : 's'}</span>
       <details class="changes"><summary>Show changes</summary><ul>${[...lines].map(([path, what]) => `<li><span class="mono">${esc(path)}</span> ${esc(what)}</li>`).join('')}</ul></details>`
    : `<span class="badge reference">Reference case</span> <span>${name}, as published</span>`;
  byId('reset').hidden = changes.length === 0;
}

function renderKpis(r: Result): void {
  const c = r.chain;
  const tiles: [string, string, string][] = [
    ['Radiator area', `${fmt(r.radiatorArea_m2)} m²`, `${fmt(r.netFlux_W_m2)} W/m² net, two-sided panel`],
    ['Solar array area', `${fmt(r.solarArrayArea_m2)} m²`, `${fmt(r.solarArraySpecific_W_m2)} W/m² in sunlight`],
    ['Solar array : radiator area', `${fmt(r.solarToRadiatorAreaRatio, 1)} : 1`, 'the "5:1" rule of thumb, recomputed'],
    ['Power + thermal mass', fmtT(r.totalMass_kg), `${fmt(r.specificMass_kg_per_kW, 1)} kg per kW of heat load`],
    ['Radiating fluid temperature', `${fmt(c.fluidEffective_K)} K`, `${fmt(c.fluidEffective_K - 273.15)} °C · ${fmt(scenario.heatSource.maxTemperature_K - c.fluidEffective_K)} K below the source limit, +${fmt(c.fluidEffective_K - c.radiatingEquivalent_K)} K fin-equivalent`],
    ['Rejection effectiveness', `${fmt(100 * r.rejectionEffectiveness)} %`, 'vs a black panel at the source limit in deep space'],
  ];
  if (r.storage.mass_kg > 0) tiles.push(['Energy storage', fmtT(r.storage.mass_kg), `${fmt(r.storage.energy_Wh / 1000)} kWh nameplate, ${fmt(100 * (1 - r.sunlight.sunlitFraction))} % dark`]);
  byId('kpis').innerHTML = tiles
    .map(([k, v, sub]) => `<div class="kpi"><div class="kpi-label">${k}</div><div class="kpi-value">${v}</div><div class="kpi-sub">${sub}</div></div>`)
    .join('');

  const rep = byId('reported');
  const check = r.reportedCheck;
  rep.hidden = !check;
  if (!check) return;
  const gap = check.modelChainDrop_K - check.budgetLeft_K;
  rep.innerHTML = `<h3>Reality check: the reported ${fmt(check.radiatorArea_m2)} m² radiator</h3>
    <p>Rejecting ${fmt(r.heatToReject_W / 1000)} kW on ${fmt(check.radiatorArea_m2)} m² means ${fmt(check.target_W_m2)} W/m² of panel, with no sizing margin.
    In this environment that needs radiating fluid at <b>${fmtK(check.requiredFluid_K)}</b>. That leaves <b>${fmt(check.budgetLeft_K)} K</b> between the ${fmt(scenario.heatSource.maxTemperature_K)} K source limit and the radiator.
    The modelled chain spends <b>${fmt(check.modelChainDrop_K)} K</b> and delivers ${fmtK(check.modelFluid_K)}.
    ${gap > 0 ? `To close the gap, remove ${fmt(gap)} K from the chain, run the source hotter, or the reported area is not two-sided planform.` : 'The modelled chain fits.'}</p>`;
}

function renderWarnings(r: Result): void {
  const icon = { error: '✕', warn: '!', info: 'i' } as const;
  byId('warnings').innerHTML = r.warnings
    .map((w) => `<div class="warning ${w.level}"><span class="icon" aria-hidden="true">${icon[w.level]}</span><span class="sr-only">${w.level}:</span>${esc(w.text)}</div>`)
    .join('');
}

const staircasePoints = (chain: ChainResult) => chain.steps.map((s) => ({ x: Math.max(1e-4, s.x_m), y: s.T_K }));

/**
 * Comparison series: the selected case is drawn strong; the other reference cases are
 * faint context. When the user has edited the selected case, its published version is
 * kept as a dashed line and the edited scenario becomes the strong line.
 */
function comparisonSeries(presets: Preset[], modified: boolean, current: Result, points: (r: Result) => Series['points']): Series[] {
  const out: Series[] = presets.map((p) => {
    const selected = p.id === scenario.mode;
    const name = MODES[p.id].name;
    if (!selected) return { name, color: MODE_COLORS[p.id], points: points(p.r), width: 1.5, muted: true };
    if (!modified) return { name: `${name} · selected`, label: name, color: MODE_COLORS[p.id], points: points(p.r), width: 3 };
    return { name: `${name} as published`, label: 'published', color: MODE_COLORS[p.id], points: points(p.r), width: 1.75, dash: true };
  });
  if (modified) out.push({ name: 'Your scenario', label: 'your scenario', color: YOURS, points: points(current), width: 3 });
  return out;
}

function renderStaircase(r: Result, presets: Preset[], modified: boolean): void {
  const series = comparisonSeries(presets, modified, r, (x) => staircasePoints(x.chain));
  const lowest = Math.min(...series.flatMap((x) => x.points.map((p) => p.y)));
  lineChart(byId('chart-staircase'), {
    series,
    x: { label: 'Distance from heat source', log: true, toggle: true, format: fmtLen, min: 1e-4, max: 100 },
    y: { label: 'Temperature (K)', format: (v) => fmt(v), min: Math.floor((lowest - 10) / 20) * 20 },
    height: 320,
  });
  const steps = r.chain.steps;
  byId('stage-table').innerHTML =
    `<tr><th>Stage</th><th>ΔT</th><th>Temperature after</th></tr>` +
    steps
      .slice(1)
      .map((s, i) => `<tr><td>${esc(s.label)}</td><td>${fmt((steps[i]?.T_K ?? s.T_K) - s.T_K, 1)} K</td><td>${fmtK(s.T_K)}</td></tr>`)
      .join('');
}

function renderDesignCurves(r: Result): void {
  const temps = Array.from({ length: 81 }, (_, i) => 200 + i * 10);
  const series: Series[] = Object.entries(ENVIRONMENTS).map(([id, e], i) => {
    const absorbed = absorbedFluxPerFace(e.environment, scenario.radiator.orientation, scenario.radiator);
    return {
      name: e.short,
      color: `var(--s${i + 1})`,
      points: temps.map((T) => ({ x: T, y: netRejectionPerPanelArea(T, scenario.radiator, absorbed) })),
      width: id === scenario.environmentId ? 3 : 1.75,
    };
  });
  lineChart(byId('chart-design'), {
    series,
    x: { label: 'Effective radiating fluid temperature (K)', format: (v) => fmt(v), min: 200, max: 1000 },
    y: { label: 'Net rejection, W per m² of panel', log: true, toggle: true, format: (v) => fmt(v), min: 10, max: 2e5 },
    markers: [{ x: r.chain.fluidEffective_K, y: r.netFlux_W_m2, label: 'your design point' }],
    height: 340,
  });
}

function renderTemperatureSweep(r: Result): void {
  const temps = Array.from({ length: 71 }, (_, i) => 300 + i * 10);
  lineChart(byId('chart-temperature'), {
    series: [
      { name: 'Radiator area', color: 'var(--s1)', points: sweep(scenario, 'heatSource.maxTemperature_K', temps, (x) => x.radiatorArea_m2) },
      { name: 'Solar array area', color: 'var(--s2)', points: sweep(scenario, 'heatSource.maxTemperature_K', temps, (x) => x.solarArrayArea_m2) },
    ],
    x: { label: 'Heat source temperature limit (K)', format: (v) => fmt(v), min: 300, max: 1000 },
    y: { label: 'Area (m²)', log: true, toggle: true, format: (v) => fmt(v) },
    markers: [{ x: scenario.heatSource.maxTemperature_K, y: r.radiatorArea_m2, label: 'you' }],
    height: 300,
  });
}

function renderAltitude(r: Result): void {
  const alts = Array.from({ length: 61 }, (_, i) => 100 * 10 ** (i / 20));
  const T = r.chain.fluidEffective_K;
  const deepPerFace = scenario.radiator.finEfficiency * emittedFlux(T, scenario.radiator.emissivity);
  const beta = scenario.environment.kind === 'orbit' ? scenario.environment.beta_deg : 0;
  const curve = (body: BodyId, orientation: Orientation) =>
    alts.map((h) => {
      const abs = absorbedFluxPerFace({ kind: 'orbit', body, altitude_km: h, beta_deg: beta }, orientation, scenario.radiator);
      return { x: h, y: (100 * netRejectionPerPanelArea(T, scenario.radiator, abs)) / (deepPerFace * abs.length) };
    });
  lineChart(byId('chart-altitude'), {
    series: [
      { name: 'Earth, edge-on', color: 'var(--s1)', points: curve('earth', 'edgeOn') },
      { name: 'Earth, face at Earth', color: 'var(--s2)', points: curve('earth', 'nadirZenith') },
      { name: 'Moon, edge-on', color: 'var(--s3)', points: curve('moon', 'edgeOn') },
      { name: 'Moon, face at Moon', color: 'var(--s4)', points: curve('moon', 'nadirZenith') },
    ],
    x: { label: 'Altitude above the body (km)', log: true, toggle: true, format: (v) => fmt(v), min: 100, max: 100000 },
    y: { label: '% of deep-space rejection', format: (v) => `${fmt(v)}%`, max: 100 },
    rules: [{ y: 100, label: 'deep space' }],
    height: 300,
  });
  byId('altitude-note').textContent = `At ${fmtK(T)}, β = ${fmt(beta)}°. Lunar infrared uses the global mean (~${fmt(BODIES.moon.infrared_W_m2)} W/m²); over the dayside it is up to ~4× higher.`;
}

const MASS_SEGMENTS: [MassKey, string, string][] = [
  ['radiator', 'Radiator', 'var(--s1)'],
  ['thermalLoop', 'Pumps & loop', 'var(--s2)'],
  ['solarArray', 'Solar array', 'var(--s3)'],
  ['battery', 'Battery', 'var(--s4)'],
  ['harness', 'Harness', 'var(--s5)'],
];

function renderMass(r: Result, presets: Preset[], modified: boolean): void {
  const segments = (rows: { r: Result }[]) => MASS_SEGMENTS.map(([k, name, color]) => ({ name, color, values: rows.map((x) => x.r.mass_kg[k]) }));
  const rows = presets.map((p) => ({ name: p.id === scenario.mode ? `${MODES[p.id].name}${modified ? ' as published' : ' · selected'}` : MODES[p.id].name, r: p.r }));
  if (modified) rows.push({ name: 'Your scenario', r });
  const selectedIdx = MODE_IDS.indexOf(scenario.mode);
  stackedBars(byId('chart-mass'), {
    categories: rows.map((x) => x.name),
    segments: segments(rows),
    format: fmtT,
    highlight: modified ? rows.length - 1 : selectedIdx,
    muted: rows.map((_, i) => i < presets.length && i !== selectedIdx),
  });
  const envRows = Object.entries(ENVIRONMENTS).map(([id, e]) => ({ id, name: e.short, r: evaluateScenario({ ...scenario, environment: structuredClone(e.environment) }) }));
  stackedBars(byId('chart-mass-env'), {
    categories: envRows.map((x) => (x.id === scenario.environmentId ? `${x.name} (current)` : x.name)),
    segments: segments(envRows),
    format: fmtT,
    normalize: true,
    highlight: envRows.findIndex((x) => x.id === scenario.environmentId),
  });
}

function renderTornado(): void {
  const params = PARAMETERS.filter((p) => p.tornadoStep !== undefined && (!p.when || p.when(scenario)));
  const specs = params.map((p) => ({ path: p.path, label: p.label, step: p.tornadoStep ?? 0, relative: p.relative, min: p.min, max: p.max }));
  const rows = tornado(scenario, specs, (x) => x.totalMass_kg).map((t) => {
    const p = params.find((q) => q.path === t.path);
    const k = p?.display ?? 1;
    const show = (v: number) => `${fmt(v * k, Math.abs(v * k) < 10 ? 2 : 0)} ${p?.unit ?? ''}`;
    return { ...t, lowValue: show(t.lowValue), highValue: show(t.highValue) };
  });
  tornadoChart(byId('chart-tornado'), { rows: rows.slice(0, 12), metricLabel: 'Mass' });
}

function renderTransport(r: Result): void {
  const c = r.chain;
  const src = scenario.heatSource.maxTemperature_K;
  const curves = transportCurves({
    distances_m: Array.from({ length: 81 }, (_, i) => 0.01 * 10 ** (i / 20)),
    busVoltage_V: scenario.power.busVoltage_V,
    conversionEfficiency: scenario.power.conversionEfficiency,
    loopEffectiveness: (c.radiatingEquivalent_K / src) ** 4,
    sourceMax_K: src,
    stackDrop_K: c.stackDrop_K,
    loopFixedDrop_K: c.coolantHot_K - c.fluidEffective_K,
    finEfficiency: scenario.radiator.finEfficiency,
  });
  lineChart(byId('chart-transport'), {
    series: [
      { name: `Electricity: ${fmt(scenario.power.busVoltage_V)} V wire`, color: 'var(--s1)', points: curves.wire, label: 'wire' },
      { name: 'Electricity + conversion', color: 'var(--s2)', points: curves.converted, label: '+ conversion' },
      { name: 'Heat: pumped loop (your chain)', color: 'var(--s3)', points: curves.loop, label: 'pumped loop' },
      { name: 'Heat: solid copper bar 10×10 cm', color: 'var(--s4)', points: curves.bar, label: 'copper bar' },
    ],
    x: { label: 'Distance from source to panel', log: true, toggle: true, format: fmtLen, min: 0.01, max: 100 },
    y: { label: '% of ideal panel area doing useful work', format: (v) => `${fmt(v)}%`, min: 0, max: 100 },
    height: 300,
  });
  const budget = src - c.radiatingEquivalent_K;
  const v = wiedemannFranzEquivalentVoltage((src + c.radiatingEquivalent_K) / 2, Math.max(budget, 1));
  byId('wf-note').innerHTML = `Your chain spends a <b>${fmt(budget)} K</b> budget. Conducting heat through copper with that budget behaves like distributing electricity at <b>${fmt(v * 1000)} mV</b> (Wiedemann–Franz). Your bus runs at ${fmt(scenario.power.busVoltage_V)} V, and loss scales as 1/V².`;
}

const EXTRA_LABELS: Record<string, string> = {
  'heatSource.stages': 'Source stack (first centimetre)',
  'reported.radiatorArea_m2': 'Reported radiator area (m²)',
  'loop.coolant': 'Radiator coolant',
  'loop.coolantCap_K': 'Heritage coolant setpoint (K)',
  'radiator.orientation': 'Radiator orientation',
  'radiator.loopSpecificMass_kg_per_kW': 'Pumps and loop hardware (kg/kW)',
  'power.packingFactor': 'Solar array packing factor',
};

function renderAssumptions(): void {
  const label = (path: string) => PARAMETERS.find((p) => p.path === path)?.label ?? EXTRA_LABELS[path] ?? path;
  const value = (path: string) => {
    const v = getPath(scenario, path);
    if (Array.isArray(v)) return `${v.length} stages`;
    if (typeof v !== 'number') return esc(v ?? '—');
    const p = PARAMETERS.find((q) => q.path === path);
    const shown = v * (p?.display ?? 1);
    return `${fmt(shown, Math.abs(shown) < 10 ? 2 : 0)} ${p?.unit ?? ''}`;
  };
  // Every visible tunable parameter appears; ones without a note are flagged as gaps to fill.
  const visible = PARAMETERS.filter((p) => !p.when || p.when(scenario)).map((p) => p.path);
  const paths = [...new Set([...Object.keys(scenario.notes), ...visible])];
  byId('assumptions').innerHTML =
    '<tr><th>Parameter</th><th>Value</th><th>Provenance</th></tr>' +
    paths
      .map((path) => {
        const note = scenario.notes[path];
        const prov = note ? cite(note) : '<span class="gap">ASSUMPTION, undocumented. Contributors: please source this value.</span>';
        return `<tr id="note-${path}" tabindex="-1"><td>${esc(label(path))}<div class="muted mono">${esc(path)}</div></td><td>${value(path)}</td><td>${prov}</td></tr>`;
      })
      .join('');
}

function renderReferences(): void {
  byId('references').innerHTML = Object.entries(SOURCES)
    .map(([id, s]) => `<li id="ref-${id}" tabindex="-1"><span class="mono">[${id}]</span> <a href="${s.url}" rel="noopener">${esc(s.title)}</a></li>`)
    .join('');
}

byId('reset').addEventListener('click', () => {
  scenario = buildScenario(scenario.mode);
  buildControls();
  render();
});

byId('export').addEventListener('click', () => {
  const modified = changesFromMode(scenario).length > 0;
  const url = URL.createObjectURL(new Blob([exportScenario(scenario)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `watts-to-space-${scenario.mode}${modified ? '-modified' : ''}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

const MAX_IMPORT_BYTES = 1_000_000;
byId<HTMLInputElement>('import-file').addEventListener('change', async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  const status = byId('io-status');
  try {
    if (file.size > MAX_IMPORT_BYTES) throw new ScenarioImportError([`file is ${fmt(file.size / 1e6, 1)} MB; assumption sets are a few kB`]);
    scenario = importScenario(await file.text());
    status.className = 'io-status ok';
    status.textContent = `Loaded ${file.name}.`;
    buildControls();
    render();
  } catch (err) {
    status.className = 'io-status error';
    status.innerHTML =
      err instanceof ScenarioImportError
        ? `<b>${esc(file.name)} was not loaded.</b><ul>${err.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`
        : `<b>${esc(file.name)} was not loaded:</b> ${esc(err)}`;
  }
});
let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(render, 150);
});

buildControls();
renderReferences();
render();
