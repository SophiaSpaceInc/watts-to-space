/**
 * Page wiring: mode switch, grouped controls, scenario import/export, KPI tiles,
 * charts, assumptions. All physics lives in ../model/. This file only reads results
 * and draws them.
 */
import { BODIES, COOLANTS } from '../model/constants.ts';
import { absorbedFluxPerFace, orientationLabel } from '../model/environment.ts';
import { emittedFlux, netRejectionPerPanelArea } from '../model/thermalEmission.ts';
import { buildScenario, ENVIRONMENTS, HEAT_SOURCES, MODES, PARAMETERS, SOURCES, type Param, type Part } from '../model/scenarios.ts';
import { harness, sizePowerSupply } from '../model/power.ts';
import { eclipseFreeBeta_deg } from '../model/orbit.ts';
import { changesFromMode, exportScenario, importScenario, overrideOf, presetBaseline, ScenarioImportError, type Change } from '../model/scenarioIO.ts';
import { decodeShareDetailed, encodeShare } from '../model/shareLink.ts';
import { EXPLANATIONS } from '../model/glossary.ts';
import { getPath, sweep, tornado, withPath } from '../model/sensitivity.ts';
import { evaluateScenario, type MassKey, type Result } from '../model/system.ts';
import type { ChainResult } from '../model/thermalChain.ts';
import { transportCurves, wiedemannFranzEquivalentVoltage } from '../model/transport.ts';
import type { BodyId, CoolantId, ModeId, Orientation, Scenario } from '../model/types.ts';
import { lineChart, setChartStamp, stackedBars, tornadoChart, type Series } from './charts.ts';

const MODE_COLORS: Record<ModeId, string> = { iss: 'var(--s1)', starmind: 'var(--s2)', ideal: 'var(--s3)', physics: 'var(--s4)', tileShared: 'var(--s5)', tileSolar: 'var(--s6)' };
const MODE_IDS = Object.keys(MODES) as ModeId[];
const YOURS = 'var(--ink)';

let scenario: Scenario = buildScenario('starmind');

/**
 * Pinned baseline: a frozen scenario every chart draws behind the live one (dashed grey) and
 * the readout tiles compare against, so one change can be judged without remembering the
 * curves. Not part of share links.
 */
let pinned: Scenario | null = null;
let pinnedResult: Result | null = null;
/** The sensitivity step (chart 8) applied to the baseline, while the live scenario is exactly that step. */
let activeStep: { path: string; value: number } | null = null;
const GHOST = 'var(--ink-2)';
// Ghost lines are named in the legend only; end labels would crowd the live lines' labels.
const ghost = (name: string, points: Series['points']): Series => ({ name, label: '', color: GHOST, points, width: 1.75, dash: true });
type Marker = { x: number; y: number; label: string; color?: string };
/** Adds the pinned point under the live one, unless they coincide (then the labels would collide). */
function withPinnedMarker(markers: Marker[], x: number, y: number): Marker[] {
  const live = markers[0];
  const near = (a: number, b: number) => Math.abs(a - b) <= 0.005 * Math.max(Math.abs(a), Math.abs(b), 1e-9);
  return live && near(live.x, x) && near(live.y, y) ? markers : [{ x, y, label: 'pinned', color: GHOST }, ...markers];
}
const sameScenario = (a: Scenario, b: Scenario) => JSON.stringify(a) === JSON.stringify(b);

// ------------------------------------------------------------------ helpers
function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing element #${id}`);
  return node as T;
}
const nf = (d: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const fmt = (v: number, d = 0) => (Number.isFinite(v) ? nf(d).format(v).replace(/^-(?=[0.]+$)/, '') : '∞'); // no minus on values that round to zero
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

  // Each part of the model gets its own control panel beside its own charts; inputs
  // that feed several parts (load, location) sit in the shared strip at the top.
  // Within a panel, one collapsible group per parameter group, with that group's
  // selector beside its sliders. Open/closed state survives rebuilds (mode switch,
  // import); groups start open on wide screens and closed on narrow ones.
  for (const part of PARTS) buildPart(part);
}

const PARTS: Part[] = ['shared', 'heatPath', 'radiator', 'power'];

function buildPart(part: Part): void {
  const box = byId(`controls-${part}`);
  for (const d of box.querySelectorAll<HTMLDetailsElement>('details.control-group')) groupOpen.set(d.dataset.group ?? '', d.open);
  box.replaceChildren();
  for (const group of [...new Set(PARAMETERS.filter((p) => p.part === part).map((p) => p.group))]) {
    const key = group.toLowerCase().replace(/[^a-z]+/g, '-');
    const details = document.createElement('details');
    details.className = 'control-group';
    details.dataset.group = key;
    // Battery inputs matter less for most cases (terminator orbits have no eclipse), so they start collapsed.
    details.open = groupOpen.get(key) ?? (part === 'shared' || (WIDE.matches && group !== 'Energy storage'));
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
  'Radiator surface': () =>
    selectRow('Orientation', (['edgeOn', 'nadirZenith', 'zenithOnly'] as Orientation[]).map((o) => [o, orientationLabel(scenario.environment, o)]), scenario.radiator.orientation, (o) => {
      scenario = { ...scenario, radiator: { ...scenario.radiator, orientation: o as Orientation } };
      render();
    }),
  Location: () =>
    selectRow('Place', Object.entries(ENVIRONMENTS).map(([id, e]) => [id, e.label]), scenario.environmentId, (id) => {
      const env = ENVIRONMENTS[id];
      if (!env) return;
      scenario = { ...scenario, environmentId: id, environment: structuredClone(env.environment), notes: { ...scenario.notes, ...env.notes }, reported: null };
      buildControls();
      render();
    }),
};

/** Slider plus a typed number box, kept in sync; typed values are clamped to the slider range. */
/** Absolute temperatures also shown in °C ("a 100 °C junction" is the figure most readers know). Not the K-difference inputs. */
const CELSIUS = new Set(['heatSource.maxTemperature_K', 'environment.groundTemperature_K']);

function paramRow(p: Param): HTMLElement {
  const k = p.display ?? 1;
  const id = `p-${p.path.replace(/\./g, '-')}`;
  const note = scenario.notes[p.path];
  const row = document.createElement('div');
  row.className = 'param';
  row.innerHTML = `<div class="param-head">
      <label class="control-label" for="${id}">${esc(p.label)}</label>
      ${note ? `<button type="button" class="info" aria-label="Show where ${esc(p.label)} comes from, in the assumptions table" title="${esc(note)}\n\nClick to jump to this row in the assumptions table (Back returns here).">i</button>` : ''}
      <span class="param-value"><input id="${id}" type="number" inputmode="decimal" min="${p.min * k}" max="${p.max * k}" step="any"><span class="unit">${esc(p.unit)}</span>${CELSIUS.has(p.path) ? '<span class="celsius"></span>' : ''}</span>
    </div>
    <input type="range" min="${p.min * k}" max="${p.max * k}" step="${p.step * k}" aria-label="${esc(p.label)}" tabindex="-1">`;
  const [box, range] = Array.from(row.querySelectorAll('input')) as [HTMLInputElement, HTMLInputElement];
  const celsius = row.querySelector<HTMLElement>('.celsius');
  const sync = () => {
    const v = num(p.path) * k;
    box.value = String(+v.toPrecision(6));
    range.value = String(v);
    if (celsius) celsius.textContent = `${fmt(v - 273.15)} °C`;
  };
  const set = (shown: number) => {
    if (Number.isFinite(shown)) scenario = withPath(scenario, p.path, Math.min(p.max, Math.max(p.min, shown / k)));
    sync();
    scheduleRender();
  };
  range.addEventListener('input', () => set(Number(range.value)));
  box.addEventListener('change', () => set(Number(box.value)));
  row.querySelector('.info')?.addEventListener('click', () => {
    setExplanationOpen(p.path, true);
    jumpTo(`note-${p.path}`);
  });
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
  // A link to an Assumptions row (e.g. from the sensitivity chart) also opens its explanation.
  if (el.id.startsWith('note-')) setExplanationOpen(el.id.slice('note-'.length), true);
  // A target inside a collapsed control group (the default on phones) is invisible: open it first.
  for (let d = el.closest('details'); d; d = d.parentElement?.closest('details') ?? null) {
    if (!d.open) {
      d.open = true;
      rescroll = true;
    }
  }
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
  pinnedResult = pinned ? evaluateScenario(pinned) : null;
  if (activeStep && !(pinned && sameScenario(withPath(pinned, activeStep.path, activeStep.value), scenario))) activeStep = null;
  const r = evaluateScenario(scenario);
  const presets: Preset[] = MODE_IDS.map((id) => ({ id, r: evaluateScenario(buildScenario(id)) }));
  const changes = changesFromMode(scenario);
  setChartStamp(scenarioContext(changes.length > 0));
  syncShareUrl();
  renderScenarioBar(changes);
  renderKpis(r);
  const issWkg = presets.find((p) => p.id === 'iss')?.r.thermalRejection_W_per_kg;
  if (issWkg) byId('iss-wkg').textContent = `${fmt(issWkg)} W/kg`;
  renderWarnings(r);
  renderStaircase(r, presets, changes.length > 0);
  renderDesignCurves(r);
  renderTemperatureSweep(r);
  renderAltitude(r);
  renderPowerSupply(r);
  renderMass(r, presets, changes.length > 0);
  renderTornado();
  renderTransport(r);
  renderAssumptions();
}

/** The conditions every chart is drawn under (see setChartStamp), so a screenshot or a quoted number travels with its assumptions. */
function scenarioContext(modified: boolean): string {
  const env = scenario.environment;
  const where =
    env.kind === 'orbit'
      ? `${env.body === 'earth' ? 'Earth' : 'Moon'} orbit, ${fmt(env.altitude_km)} km, β ${fmt(env.beta_deg)}°`
      : env.kind === 'deepSpace'
        ? `deep space, ${fmt(100 * env.sunlitFraction)} % sunlit`
        : `lunar surface, ground ${fmt(env.groundTemperature_K)} K, Sun ${fmt(env.sunElevation_deg)}° up`;
  return `${MODES[scenario.mode].name}${modified ? ', modified' : ''} · ${where} · ${loadText()} · source limit ${fmt(scenario.heatSource.maxTemperature_K)} K${pinned ? ' · dashed grey: pinned baseline' : ''} · watts-to-space by Chris Lewicki, CC BY 4.0`;
}

/** "150 kW peak / 120 kW average", or "150 kW heat load" when they are the same. */
function loadText(): string {
  const hs = scenario.heatSource;
  const peak = fmt(hs.totalPower_W / 1000);
  return hs.averageFraction < 1 ? `${peak} kW peak / ${fmt((hs.totalPower_W * hs.averageFraction) / 1000)} kW average` : `${peak} kW heat load`;
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
    : `<span class="badge reference">Reference case</span> <span>${name}, reference assumptions</span>`;
  if (pinned) {
    const pinMods = changesFromMode(pinned).length;
    byId('scenario-status').insertAdjacentHTML(
      'beforeend',
      `<span class="pin-status"><span class="badge pinned">Pinned</span> baseline: ${esc(MODES[pinned.mode].name)}${pinMods ? `, ${pinMods} change${pinMods === 1 ? '' : 's'}` : ''}. Dashed grey on the charts; the tiles show the change from it.</span>`,
    );
  }
  byId('reset').hidden = changes.length === 0;
  const pin = byId('pin');
  pin.textContent = pinned ? 'Unpin baseline' : 'Pin as baseline';
  pin.setAttribute('aria-pressed', String(!!pinned));
}

function renderKpis(r: Result): void {
  const c = r.chain;
  const p = pinnedResult;
  // Change from the pinned baseline, if one is pinned.
  const same = 'same as pinned';
  const pct = (now: number, was: number | undefined) => {
    if (!p || was === undefined || !Number.isFinite(now) || !Number.isFinite(was) || was === 0) return '';
    const d = 100 * (now / was - 1);
    return Math.abs(d) < 0.5 ? same : `${d > 0 ? '+' : '−'}${fmt(Math.abs(d), Math.abs(d) < 10 ? 1 : 0)} % vs pinned`;
  };
  const diff = (now: number, was: number | undefined, unit: string) => {
    if (!p || was === undefined || !Number.isFinite(now) || !Number.isFinite(was)) return '';
    const d = now - was;
    return Math.abs(d) < 0.5 ? same : `${d > 0 ? '+' : '−'}${fmt(Math.abs(d))} ${unit} vs pinned`;
  };
  // Three headline readouts first; the rest are supporting detail.
  const primary: [string, string, string, string][] = [
    ['Radiator area', `${fmt(r.radiatorArea_m2)} m²`, `${fmt(r.netFlux_W_m2)} W/m² net, two-sided panel`, pct(r.radiatorArea_m2, p?.radiatorArea_m2)],
    ['Solar array area', `${fmt(r.solarArrayArea_m2)} m²`, `${fmt(r.solarArraySpecific_W_m2)} W/m² in sunlight; sized for ${fmt(r.payloadAverage_W / 1000)} kW average`, pct(r.solarArrayArea_m2, p?.solarArrayArea_m2)],
    ['Power + thermal mass', fmtT(r.totalMass_kg), `${fmt(r.specificMass_kg_per_kW, 1)} kg per kW of peak payload. Storage for brief power peaks is not included.`, pct(r.totalMass_kg, p?.totalMass_kg)],
    ['Thermal rejection', `${fmt(r.thermalRejection_W_per_kg)} W/kg`, `heat rejected per kg of radiator and pumped loop: the thermal figure of merit`, pct(r.thermalRejection_W_per_kg, p?.thermalRejection_W_per_kg)],
  ];
  const secondary: [string, string, string, string][] = [
    ['Heat to reject', `${fmt(r.heatToReject_W / 1000)} kW`, `${fmt(r.payload_W / 1000)} kW peak payload, plus conversion losses and overhead`, pct(r.heatToReject_W, p?.heatToReject_W)],
    ['Radiating fluid temperature', `${fmt(c.fluidEffective_K)} K`, `${fmt(c.fluidEffective_K - 273.15)} °C · ${fmt(scenario.heatSource.maxTemperature_K - c.fluidEffective_K)} K below the source limit, +${fmt(c.fluidEffective_K - c.radiatingEquivalent_K)} K fin-equivalent`, diff(c.fluidEffective_K, p?.chain.fluidEffective_K, 'K')],
    [
      'Solar array : radiator area',
      `${fmt(r.solarToRadiatorAreaRatio, 1)} : 1`,
      r.reportedCheck?.publishedAreaRatio
        ? `SpaceX's Starmind figures work out to ${fmt(r.reportedCheck.publishedAreaRatio, 2)} : 1 (${fmt(scenario.reported?.solarArrayArea_m2 ?? 0)} / ${fmt(r.reportedCheck.radiatorArea_m2)} m²)${r.radiatorArea_m2 > r.reportedCheck.radiatorArea_m2 ? '; this model sizes a larger radiator' : ''}`
        : 'compare Musk\'s "~5 times the area of the radiator"',
      pct(r.solarToRadiatorAreaRatio, p?.solarToRadiatorAreaRatio),
    ],
    ['Rejection effectiveness', `${fmt(100 * r.rejectionEffectiveness)} %`, 'vs a black panel at the source limit in deep space', diff(100 * r.rejectionEffectiveness, p ? 100 * p.rejectionEffectiveness : undefined, 'points')],
  ];
  if (r.storage.mass_kg > 0) secondary.push(['Eclipse/night battery', fmtT(r.storage.mass_kg), `${fmt(r.storage.energy_Wh / 1000)} kWh nameplate, ${fmt(100 * (1 - r.sunlight.sunlitFraction))} % dark`, pct(r.storage.mass_kg, p?.storage.mass_kg)]);
  const tile = (cls: string) => ([k, v, sub, delta]: [string, string, string, string]) =>
    `<div class="kpi ${cls}"><div class="kpi-label">${k}</div><div class="kpi-value">${v}</div>${delta ? `<div class="kpi-delta${delta === same ? ' same' : ''}">${delta}</div>` : ''}<div class="kpi-sub">${sub}</div></div>`;
  byId('kpis').innerHTML = `<div class="kpi-row primary">${primary.map(tile('primary')).join('')}</div><div class="kpi-row secondary">${secondary.map(tile('secondary')).join('')}</div>`;

  const rep = byId('reported');
  const check = r.reportedCheck;
  rep.hidden = !check;
  if (!check) return;
  const limit = scenario.heatSource.maxTemperature_K;
  const avgBudget = limit - check.requiredFluidAverage_K;
  const row = (label: string, flux: number, fluid: string) => `<tr><td>${label}</td><td>${fmt(flux)}</td><td>${fluid}</td></tr>`;
  const vsLimit = (T: number) => (T > limit ? `${fmtK(T)}, ${fmt(T - limit)} K above the source limit` : fmtK(T));
  rep.innerHTML = `<h3>What the reported ${fmt(check.radiatorArea_m2)} m² radiator would require</h3>
    <p class="callout-caveat">Reported figures + assumed hardware: this is not a reconstruction of SpaceX's design. The assumed values are marked in the Assumptions table.</p>
    ${
      check.statedFluxFluid_K !== null && check.statedFlux_W_m2 !== null
        ? `<p>The published ~${fmt(check.statedFlux_W_m2)} W/m² matches this model's radiator at <b>${fmtK(check.statedFluxFluid_K)}</b> fluid. This case's assumed heat path (${esc(scenario.heatSource.name)}, ${fmt(limit)} K source limit) delivers <b>${fmtK(check.modelFluid_K)}</b>, where the same radiator rejects ${fmt(r.netFlux_W_m2)} W/m². ${
            check.statedFluxFluid_K > check.modelFluid_K
              ? `At the same fluid temperature the radiator figures agree; the ${fmt(check.statedFluxFluid_K - check.modelFluid_K)} K gap is in the heat path.`
              : 'This heat path delivers enough temperature for the published flux.'
          }</p>`
        : ''
    }
    <table class="data fork">
      <tr><th>On ${fmt(check.radiatorArea_m2)} m², with no sizing margin</th><th>W/m² of panel</th><th>Radiating fluid needed</th></tr>
      ${check.statedFlux_W_m2 !== null && check.statedFluxFluid_K !== null ? row('Published flux', check.statedFlux_W_m2, fmtK(check.statedFluxFluid_K)) : ''}
      ${row(`Peak: ${fmt(r.heatToReject_W / 1000)} kW of heat (${fmt(r.payload_W / 1000)} kW payload plus losses and overhead)`, check.target_W_m2, vsLimit(check.requiredFluid_K))}
      ${r.payloadAverage_W < r.payload_W ? row(`Average: ${fmt((check.targetAverage_W_m2 * check.radiatorArea_m2) / 1000)} kW of heat`, check.targetAverage_W_m2, vsLimit(check.requiredFluidAverage_K)) : ''}
      ${row('This heat path delivers', r.netFlux_W_m2, fmtK(check.modelFluid_K))}
    </table>
    <p>Ways the reported area can work under this model:</p>
    <ul>
      ${r.payloadAverage_W < r.payload_W ? `<li>Size for the average and carry peaks on thermal mass or the battery. ${avgBudget > 0 ? `At the average, a heat path that spends at most ${fmt(avgBudget)} K closes; this one spends ${fmt(check.modelChainDrop_K)} K.` : 'Even the average needs fluid hotter than the source limit.'} This steady-state model does not simulate peaks.</li>` : ''}
      <li>${check.budgetLeft_K < 0 ? 'At peak, no heat path closes at this source limit under these radiator assumptions.' : `At peak, a heat path that spends at most ${fmt(check.budgetLeft_K)} K closes; this one spends ${fmt(check.modelChainDrop_K)} K.`}</li>
      <li>Run the source hotter, use radiator surfaces better than assumed here (ε, α, fin efficiency), or add a heat pump, which lifts the radiator temperature by spending electrical power (not modelled).</li>
    </ul>
    ${
      check.vehicleMass_kg && check.powerThermalShareOfVehicle !== null
        ? `<p>Mass: reading the published ${fmt(scenario.reported?.vehicleSpecificPower_kW_per_t ?? 0)} kW per ton as peak compute per ton of the whole satellite gives about <b>${fmtT(check.vehicleMass_kg)}</b> at ${fmt(r.payload_W / 1000)} kW. This model's power and thermal hardware, with its assumed areal densities, comes to <b>${fmtT(r.totalMass_kg)}</b> (${fmt(100 * check.powerThermalShareOfVehicle)} % of that). ${
            check.powerThermalShareOfVehicle > 1
              ? 'These selected assumptions exceed the inferred vehicle mass.'
              : `That leaves ${fmtT(check.vehicleMass_kg - r.totalMass_kg)} for the compute, structure and everything else; this model does not estimate those.`
          }</p>`
        : ''
    }`;
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
    return { name: `${name}, reference`, label: 'reference', color: MODE_COLORS[p.id], points: points(p.r), width: 1.75, dash: true };
  });
  if (pinnedResult) out.push(ghost('Pinned baseline', points(pinnedResult)));
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
  let markers: Marker[] = [{ x: r.chain.fluidEffective_K, y: r.netFlux_W_m2, label: 'your design point' }];
  const pin = pinned;
  if (pin && pinnedResult) {
    const abs = absorbedFluxPerFace(pin.environment, pin.radiator.orientation, pin.radiator);
    series.push(ghost(`Pinned (${ENVIRONMENTS[pin.environmentId]?.short ?? 'baseline'})`, temps.map((T) => ({ x: T, y: netRejectionPerPanelArea(T, pin.radiator, abs) }))));
    markers = withPinnedMarker(markers, pinnedResult.chain.fluidEffective_K, pinnedResult.netFlux_W_m2);
  }
  lineChart(byId('chart-design'), {
    series,
    x: { label: 'Effective radiating fluid temperature (K)', format: (v) => fmt(v), min: 200, max: 1000 },
    bands: [{ from: COOLANTS[scenario.loop.coolant].min_K, to: COOLANTS[scenario.loop.coolant].max_K, label: `${COOLANTS[scenario.loop.coolant].name} works here` }],
    y: { label: 'Net rejection, W per m² of panel', log: true, toggle: true, format: (v) => fmt(v), min: 10, max: 2e5 },
    markers,
    height: 340,
  });
}

function renderTemperatureSweep(r: Result): void {
  // Points where the model raises an error (e.g. the coolant leaves its working range) are
  // drawn dashed: a mathematical extrapolation, not a design this hardware can reach.
  const sweepOf = (s: Scenario) => Array.from({ length: 71 }, (_, i) => 300 + i * 10).map((t) => ({ t, x: evaluateScenario(withPath(s, 'heatSource.maxTemperature_K', t)) }));
  const curve = (runs: ReturnType<typeof sweepOf>, metric: (x: Result) => number) => runs.map(({ t, x }) => ({ x: t, y: metric(x), outside: x.warnings.some((w) => w.level === 'error') }));
  const runs = sweepOf(scenario);
  const series: Series[] = [
    { name: 'Radiator area', color: 'var(--s1)', points: curve(runs, (x) => x.radiatorArea_m2) },
    { name: 'Solar array area', color: 'var(--s2)', points: curve(runs, (x) => x.solarArrayArea_m2) },
  ];
  let markers: Marker[] = [{ x: scenario.heatSource.maxTemperature_K, y: r.radiatorArea_m2, label: 'you' }];
  if (pinned && pinnedResult) {
    const pinRuns = sweepOf(pinned);
    series.push(ghost('Pinned radiator area', curve(pinRuns, (x) => x.radiatorArea_m2)));
    series.push(ghost('Pinned solar array area', curve(pinRuns, (x) => x.solarArrayArea_m2)));
    markers = withPinnedMarker(markers, pinned.heatSource.maxTemperature_K, pinnedResult.radiatorArea_m2);
  }
  lineChart(byId('chart-temperature'), {
    series,
    x: { label: 'Heat source temperature limit (K)', format: (v) => fmt(v), min: 300, max: 1000 },
    bands: [{ from: 350, to: 400, label: 'chip limits, ~350–400 K' }],
    y: { label: 'Area (m²)', log: false, toggle: true, format: (v) => fmt(v), min: 0 },
    markers,
    height: 300,
  });
}

function renderAltitude(r: Result): void {
  const alts = Array.from({ length: 61 }, (_, i) => 100 * 10 ** (i / 20));
  const T = r.chain.fluidEffective_K;
  const deepPerFace = scenario.radiator.finEfficiency * emittedFlux(T, scenario.radiator.emissivity);
  const beta = scenario.environment.kind === 'orbit' ? scenario.environment.beta_deg : 0;
  const curveFor = (s: Scenario, temp: number, b: number, body: BodyId, orientation: Orientation) => {
    const deep = s.radiator.finEfficiency * emittedFlux(temp, s.radiator.emissivity);
    return alts.map((h) => {
      const abs = absorbedFluxPerFace({ kind: 'orbit', body, altitude_km: h, beta_deg: b }, orientation, s.radiator);
      return { x: h, y: (100 * netRejectionPerPanelArea(temp, s.radiator, abs)) / (deep * abs.length) };
    });
  };
  const curve = (body: BodyId, orientation: Orientation) => curveFor(scenario, T, beta, body, orientation);
  const series: Series[] = [
    { name: 'Earth, edge-on', color: 'var(--s1)', points: curve('earth', 'edgeOn') },
    { name: 'Earth, face at Earth', color: 'var(--s2)', points: curve('earth', 'nadirZenith') },
    { name: 'Moon, edge-on', color: 'var(--s3)', points: curve('moon', 'edgeOn') },
    { name: 'Moon, face at Moon', color: 'var(--s4)', points: curve('moon', 'nadirZenith') },
  ];
  if (pinned && pinnedResult) {
    const env = pinned.environment;
    const body: BodyId = env.kind === 'orbit' ? env.body : 'earth';
    const o: Orientation = pinned.radiator.orientation === 'edgeOn' ? 'edgeOn' : 'nadirZenith';
    series.push(ghost(`Pinned (${body === 'earth' ? 'Earth' : 'Moon'}, ${o === 'edgeOn' ? 'edge-on' : 'face at body'})`, curveFor(pinned, pinnedResult.chain.fluidEffective_K, env.kind === 'orbit' ? env.beta_deg : 0, body, o)));
  }
  lineChart(byId('chart-altitude'), {
    series,
    x: { label: 'Altitude above the body (km)', log: true, toggle: true, format: (v) => fmt(v), min: 100, max: 100000 },
    // Earth only: SpaceX's FCC letter [spacex-fcc-2026-09]; the inner belt as in the altitude glossary entry.
    bands: [
      { from: 500, to: 1002, label: 'Starmind filing (Earth)' },
      { from: 1000, to: 2000, label: 'inner Van Allen belt (Earth)', avoid: true },
    ],
    y: { label: '% of deep-space rejection', format: (v) => `${fmt(v)}%`, max: 100 },
    rules: [{ y: 100, label: 'deep space' }],
    height: 300,
  });
  byId('altitude-note').textContent = `At ${fmtK(T)}, β = ${fmt(beta)}°. Lunar infrared uses the global mean (~${fmt(BODIES.moon.infrared_W_m2)} W/m²); over the dayside it is up to ~4× higher.`;
}

/**
 * Power-supply part, chart 5. In orbit: power-and-thermal mass against the β angle, with
 * the eclipse-free threshold marked (why data centers want terminator orbits). Elsewhere
 * (deep space, a surface site): mass against sunlit fraction at this site's day length.
 */
function renderPowerSupply(r: Result): void {
  const t = (kg: number) => kg / 1000;
  const env = scenario.environment;
  if (env.kind === 'orbit') {
    const betas = Array.from({ length: 91 }, (_, i) => i);
    const metric = (k: MassKey) => sweep(scenario, 'environment.beta_deg', betas, (x) => t(x.mass_kg[k]));
    const total = sweep(scenario, 'environment.beta_deg', betas, (x) => t(x.totalMass_kg));
    const betaStar = eclipseFreeBeta_deg(BODIES[env.body], env.altitude_km);
    byId('power-heading').textContent = '5. Why terminator orbits: eclipses and the β angle';
    byId('power-lede').hidden = false;
    const series: Series[] = [
      { name: 'Solar array', color: 'var(--s3)', points: metric('solarArray') },
      { name: 'Eclipse/night battery', color: 'var(--s4)', points: metric('battery') },
      { name: 'Radiator', color: 'var(--s1)', points: metric('radiator') },
      { name: 'Power + thermal total', color: 'var(--ink)', width: 2.5, points: total },
    ];
    let markers: Marker[] = [{ x: env.beta_deg, y: t(r.totalMass_kg), label: 'you' }];
    if (pinned && pinnedResult && pinned.environment.kind === 'orbit') {
      series.push(ghost('Pinned total', sweep(pinned, 'environment.beta_deg', betas, (x) => t(x.totalMass_kg))));
      markers = withPinnedMarker(markers, pinned.environment.beta_deg, t(pinnedResult.totalMass_kg));
    }
    lineChart(byId('chart-power'), {
      series,
      x: { label: 'β angle: orbit plane to Sun (°)', format: (v) => `${fmt(v)}°`, min: 0, max: 90 },
      y: { label: 'Mass (t)', format: (v) => fmt(v, v < 10 ? 1 : 0), min: 0 },
      vrules: [{ x: betaStar, label: `no eclipse above ${fmt(betaStar)}° (circular orbit, ${fmt(env.altitude_km)} km${env.body === 'moon' ? ' above the Moon' : ''})` }],
      markers,
      height: 300,
    });
    const dark = 1 - r.sunlight.sunlitFraction;
    byId('power-note').textContent =
      dark > 0
        ? `At β = ${fmt(env.beta_deg)}° and ${fmt(env.altitude_km)} km you spend ${fmt(100 * dark)} % of each ${fmt(r.sunlight.cyclePeriod_h * 60)}-minute orbit in shadow.`
        : `At β = ${fmt(env.beta_deg)}° and ${fmt(env.altitude_km)} km the orbit never enters shadow (eclipse-free above ${fmt(betaStar)}° at this altitude).`;
    return;
  }
  const fractions = Array.from({ length: 81 }, (_, i) => 0.2 + i * 0.01);
  const cycle_h = r.sunlight.cyclePeriod_h;
  const sized = fractions.map((f) => ({ f, s: sizePowerSupply(r.busLoadAverage_W, scenario.power, { sunlitFraction: f, cyclePeriod_h: cycle_h }, r.busLoad_W) }));
  byId('power-heading').textContent = '5. Darkness is a mass problem: power supply versus sunlight';
  byId('power-lede').hidden = true;
  const surfaceSeries: Series[] = [
    { name: 'Solar array', color: 'var(--s3)', points: sized.map(({ f, s }) => ({ x: f, y: t(s.solarArrayMass_kg) })) },
    { name: 'Eclipse/night battery', color: 'var(--s4)', points: sized.map(({ f, s }) => ({ x: f, y: t(s.storage.mass_kg) })) },
    { name: 'Power supply total', color: 'var(--ink)', width: 2.5, points: sized.map(({ f, s }) => ({ x: f, y: t(s.solarArrayMass_kg + s.storage.mass_kg + s.harness.mass_kg) })) },
  ];
  if (pinned && pinnedResult && pinned.environment.kind !== 'orbit') {
    const pr = pinnedResult;
    const pin = pinned;
    const pinSized = fractions.map((f) => sizePowerSupply(pr.busLoadAverage_W, pin.power, { sunlitFraction: f, cyclePeriod_h: pr.sunlight.cyclePeriod_h }, pr.busLoad_W));
    surfaceSeries.push(ghost('Pinned total', fractions.map((f, i) => ({ x: f, y: t((pinSized[i]?.solarArrayMass_kg ?? NaN) + (pinSized[i]?.storage.mass_kg ?? NaN) + (pinSized[i]?.harness.mass_kg ?? NaN)) }))));
  }
  lineChart(byId('chart-power'), {
    series: surfaceSeries,
    x: { label: 'Sunlit fraction of each light/dark cycle', format: (v) => `${fmt(100 * v)}%`, min: 0.2, max: 1 },
    y: { label: 'Mass (t)', log: true, toggle: true, format: (v) => fmt(v, v < 1 ? 2 : 0) },
    markers: [{ x: r.sunlight.sunlitFraction, y: t(r.mass_kg.solarArray + r.mass_kg.battery + r.mass_kg.harness), label: 'you' }],
    height: 300,
  });
  const cycle = cycle_h > 48 ? `${fmt(cycle_h / 24, 1)} days` : `${fmt(cycle_h * 60)} minutes`;
  byId('power-note').textContent = `Away from orbit there is no β angle, only the length of the dark. Here each light/dark cycle lasts ${cycle}, and you are ${fmt(100 * r.sunlight.sunlitFraction)} % sunlit: the longer the dark, the more each lost percent of sunlight costs in battery.`;
}

const MASS_SEGMENTS: [MassKey, string, string][] = [
  ['radiator', 'Radiator', 'var(--s1)'],
  ['thermalLoop', 'Pumps & loop', 'var(--s2)'],
  ['solarArray', 'Solar array', 'var(--s3)'],
  ['battery', 'Eclipse/night battery', 'var(--s4)'],
  ['harness', 'Harness', 'var(--s5)'],
  ['powerConversion', 'Converters on Tiles', 'var(--s6)'],
  ['tileOverhead', 'Tile networking & boxes', 'var(--muted)'],
  ['tileStructure', 'Tile support structure', 'var(--ink-2)'],
];

function renderMass(r: Result, presets: Preset[], modified: boolean): void {
  const segments = (rows: { r: Result }[]) => MASS_SEGMENTS.map(([k, name, color]) => ({ name, color, values: rows.map((x) => x.r.mass_kg[k]) }));
  // The bound's masses are placeholders: it marks the physical floor, not a design.
  const caseName = (id: ModeId) => `${MODES[id].name}${id === 'physics' ? ' (placeholder masses)' : ''}`;
  const rows = presets.map((p) => ({ name: p.id === scenario.mode ? `${caseName(p.id)}${modified ? ', reference' : ' · selected'}` : caseName(p.id), r: p.r }));
  if (pinnedResult) rows.push({ name: 'Pinned baseline', r: pinnedResult });
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

/**
 * Chart 8. With a baseline pinned, the sensitivity is computed around the baseline, so the
 * bars stay put while you click through them. Clicking a bar applies that one step to the
 * baseline (pinning the current scenario first if nothing is pinned); clicking it again
 * returns to the baseline.
 */
/** What chart 8 ranks the inputs by. */
const TORNADO_METRICS = {
  mass: { label: 'Mass', heading: 'what moves the mass', of: (x: Result) => x.totalMass_kg },
  wkg: { label: 'W/kg', heading: 'what moves the thermal W/kg', of: (x: Result) => x.thermalRejection_W_per_kg },
} as const;
let tornadoMetric: keyof typeof TORNADO_METRICS = 'mass';

function renderTornadoSwitch(): void {
  const box = byId('tornado-switch');
  box.innerHTML = `<div class="segmented" role="group" aria-label="Rank the inputs by"><span class="segmented-label">Rank by</span>${(Object.keys(TORNADO_METRICS) as (keyof typeof TORNADO_METRICS)[])
    .map((k) => `<button type="button" data-metric="${k}" aria-pressed="${k === tornadoMetric}">${k === 'mass' ? 'Power + thermal mass' : 'Thermal W/kg'}</button>`)
    .join('')}</div>`;
  for (const b of box.querySelectorAll<HTMLButtonElement>('button'))
    b.addEventListener('click', () => {
      tornadoMetric = b.dataset.metric as keyof typeof TORNADO_METRICS;
      renderTornado();
    });
  byId('fig8-heading').textContent = `8. Sensitivity slopes: ${TORNADO_METRICS[tornadoMetric].heading}`;
}

function renderTornado(): void {
  renderTornadoSwitch();
  const base = pinned ?? scenario;
  const params = PARAMETERS.filter((p) => p.tornadoStep !== undefined && (!p.when || p.when(base)));
  const specs = params.map((p) => ({ path: p.path, label: p.label, step: p.tornadoStep ?? 0, relative: p.relative, min: p.min, max: p.max }));
  const metric = TORNADO_METRICS[tornadoMetric];
  const rows = tornado(base, specs, metric.of)
    .map((t) => {
      const p = params.find((q) => q.path === t.path);
      const k = p?.display ?? 1;
      const show = (v: number) => `${fmt(v * k, Math.abs(v * k) < 10 ? 2 : 0)} ${p?.unit ?? ''}`;
      return { ...t, lowRaw: t.lowValue, highRaw: t.highValue, lowValue: show(t.lowValue), highValue: show(t.highValue), href: `#note-${t.path}` };
    })
    .slice(0, 12);
  const activeRow = activeStep ? rows.findIndex((x) => x.path === activeStep?.path) : -1;
  const activeRowData = rows[activeRow];
  tornadoChart(byId('chart-tornado'), {
    rows,
    metricLabel: metric.label,
    active: activeRowData && activeStep ? { row: activeRow, side: activeStep.value === activeRowData.lowRaw ? 'low' : 'high' } : null,
    onPick: (i, side) => {
      const row = rows[i];
      if (!row) return;
      const value = side === 'low' ? row.lowRaw : row.highRaw;
      if (!pinned) pinned = structuredClone(scenario);
      const pin = pinned;
      const again = activeStep?.path === row.path && activeStep.value === value;
      scenario = again ? structuredClone(pin) : withPath(pin, row.path, value);
      activeStep = again ? null : { path: row.path, value };
      buildControls();
      render();
    },
  });
  byId('tornado-note').textContent = pinned
    ? 'Sensitivity around the pinned baseline. Click a bar to apply that step to the baseline and watch every chart; click it again to go back.'
    : 'Click a bar to try that step: the current scenario is pinned as the baseline, so every chart shows before (dashed grey) and after.';
}

function renderTransport(r: Result): void {
  const c = r.chain;
  const src = scenario.heatSource.maxTemperature_K;
  const curvesFor = (s: Scenario, res: Result) =>
    transportCurves({
      distances_m: Array.from({ length: 81 }, (_, i) => 0.01 * 10 ** (i / 20)),
      busVoltage_V: s.power.busVoltage_V,
      conversionEfficiency: s.power.conversionEfficiency,
      loopEffectiveness: (res.chain.radiatingEquivalent_K / s.heatSource.maxTemperature_K) ** 4,
      sourceMax_K: s.heatSource.maxTemperature_K,
      stackDrop_K: res.chain.stackDrop_K,
      loopFixedDrop_K: res.chain.coolantHot_K - res.chain.fluidEffective_K,
      finEfficiency: s.radiator.finEfficiency,
    });
  const curves = curvesFor(scenario, r);
  const series: Series[] = [
    { name: `Electricity: ${fmt(scenario.power.busVoltage_V)} V wire`, color: 'var(--s1)', points: curves.wire, label: 'wire' },
    { name: 'Electricity + conversion', color: 'var(--s2)', points: curves.converted, label: '+ conversion' },
    { name: 'Heat: pumped loop (your chain)', color: 'var(--s3)', points: curves.loop, label: 'pumped loop' },
    { name: 'Heat: solid copper bar 10×10 cm', color: 'var(--s4)', points: curves.bar, label: 'copper bar' },
  ];
  if (pinned && pinnedResult) series.push(ghost('Pinned pumped loop', curvesFor(pinned, pinnedResult).loop));
  lineChart(byId('chart-transport'), {
    series,
    x: { label: 'Distance from source to panel', log: true, toggle: true, format: fmtLen, min: 0.01, max: 100 },
    bands: [{ from: 0.01, to: scenario.power.harnessOneWayLength_m, label: `within one spacecraft (up to the ${fmt(scenario.power.harnessOneWayLength_m)} m harness run)` }],
    y: { label: '% of ideal panel area doing useful work', format: (v) => `${fmt(v)}%`, min: 0, max: 100 },
    height: 300,
  });
  const budget = src - c.radiatingEquivalent_K;
  const v = wiedemannFranzEquivalentVoltage((src + c.radiatingEquivalent_K) / 2, Math.max(budget, 1));
  byId('wf-note').innerHTML = `Electricity has a transformer: copper for a fixed loss scales as 1/V². ${copperComparison(r)}
    <details class="physics"><summary>For physicists: the equivalent voltage</summary>Your chain spends a <b>${fmt(budget)} K</b> budget. Conducting heat through copper with that budget behaves like distributing electricity at <b>${fmt(v * 1000)} mV</b> (Wiedemann–Franz: κ/σ = L·T).</details>`;
}

/** The voltage lesson in this scenario's own numbers: copper for the same loss at this bus voltage vs a 120 V heritage bus. */
function copperComparison(r: Result): string {
  const p = scenario.power;
  const at = (V: number) => harness({ power_W: r.busLoad_W, busVoltage_V: V, oneWayLength_m: p.harnessOneWayLength_m, lossFraction: p.harnessLossFraction }).mass_kg;
  const loss = `${fmt(100 * p.harnessLossFraction, 1)} %`;
  const ref = p.busVoltage_V > 300 ? 120 : 800; // contrast a high-voltage bus with a heritage one, and vice versa
  return `Your ${fmt(p.harnessOneWayLength_m)} m harness at ${fmt(p.busVoltage_V)} V needs <b>${fmtT(at(p.busVoltage_V))}</b> of copper for ${loss} loss; at ${ref} V it would need <b>${fmtT(at(ref))}</b>.`;
}

const EXTRA_LABELS: Record<string, string> = {
  'heatSource.stages': 'Source stack (first centimetre)',
  'reported.radiatorArea_m2': 'Reported radiator area (m²)',
  'reported.vehicleSpecificPower_kW_per_t': 'Reported payload power per ton of vehicle (kW/t)',
  'loop.coolant': 'Radiator coolant',
  'loop.coolantCap_K': 'Heritage coolant setpoint (K)',
  'radiator.orientation': 'Radiator orientation',
  'radiator.loopSpecificMass_kg_per_kW': 'Pumps and loop hardware (kg/kW)',
  'power.packingFactor': 'Solar array packing factor',
};

function renderAssumptions(): void {
  const label = (path: string) => PARAMETERS.find((p) => p.path === path)?.label ?? EXTRA_LABELS[path] ?? path;
  const value = (path: string, from: Scenario = scenario) => {
    const v = getPath(from, path);
    if (Array.isArray(v)) return `${v.length} stages`;
    if (typeof v !== 'number') return esc(v ?? '—');
    const p = PARAMETERS.find((q) => q.path === path);
    const shown = v * (p?.display ?? 1);
    return `${fmt(shown, Math.abs(shown) < 10 ? 2 : 0)} ${p?.unit ?? ''}`.trim();
  };
  // Every visible tunable parameter appears; ones without a note are flagged as gaps to fill.
  const visible = PARAMETERS.filter((p) => !p.when || p.when(scenario)).map((p) => p.path);
  const paths = [...new Set([...Object.keys(scenario.notes), ...visible])];
  const baseline = presetBaseline(scenario);
  const link = new URL(shareUrl(), location.href).href;
  byId('assumptions').innerHTML =
    '<tr><th>Parameter</th><th>Value</th><th>Provenance</th></tr>' +
    paths
      .map((path) => {
        const note = scenario.notes[path];
        // A changed value keeps the reference citation, labelled as supporting the reference only.
        const changed = overrideOf(scenario, path, baseline).overridden;
        const flag = changed ? `<p class="override">Your value. The reference is ${value(path, baseline)}; the note below supports the reference, not your value.</p>` : '';
        const prov = flag + (note ? cite(note) : '<span class="gap">ASSUMPTION, undocumented. Contributors: please source this value.</span>') + challengeLink(path, label(path), value(path), note, link);
        const open = openExplanations.has(path);
        const toggle = `<button type="button" class="explain-toggle" aria-expanded="${open}" aria-controls="explain-${path}" title="What does this mean?"><span class="chev" aria-hidden="true"></span><span>${esc(label(path))}</span></button>`;
        const explanation = EXPLANATIONS[path] ?? 'No explanation yet. Contributors: add one in src/model/glossary.ts.';
        return (
          `<tr id="note-${path}" tabindex="-1"${changed ? ' class="overridden"' : ''}><td>${toggle}<div class="muted mono">${esc(path)}</div></td><td>${value(path)}</td><td>${prov}</td></tr>` +
          `<tr class="explain-row" id="explain-${path}"${open ? '' : ' hidden'}><td colspan="3"><p>${esc(explanation)}</p></td></tr>`
        );
      })
      .join('');
}

const ISSUE_FORM = 'https://github.com/interplanetarychris/watts-to-space/issues/new?template=challenge-an-assumption.yml';

/** A pre-filled "Challenge an assumption" issue: no account of the code needed, only a reason and a source. */
function challengeLink(path: string, name: string, shown: string, note: string | undefined, share: string): string {
  const q = new URLSearchParams({
    title: `Challenge: ${name} (${path})`,
    scenario: share,
    assumption: `${name} (${path}) = ${shown.replace(/<[^>]+>/g, '')}${note ? `\nCurrent note: ${note}` : ''}`,
  });
  return ` <a class="challenge" href="${ISSUE_FORM}&${q}" target="_blank" rel="noopener">Challenge this value</a>`;
}

/**
 * Parameter explanations in the Assumptions table: every name is a disclosure button.
 * Open rows survive re-renders (the table is rebuilt on every change), and the "i"
 * buttons beside the sliders open the row they jump to.
 */
const openExplanations = new Set<string>();

function setExplanationOpen(path: string, open: boolean): void {
  if (open) openExplanations.add(path);
  else openExplanations.delete(path);
  document.getElementById(`explain-${path}`)?.toggleAttribute('hidden', !open);
  document.querySelector(`#note-${CSS.escape(path)} .explain-toggle`)?.setAttribute('aria-expanded', String(open));
}

byId('assumptions').addEventListener('click', (e) => {
  const button = (e.target as HTMLElement).closest<HTMLButtonElement>('.explain-toggle');
  const path = button?.getAttribute('aria-controls')?.slice('explain-'.length);
  if (path) setExplanationOpen(path, !openExplanations.has(path));
});

function renderReferences(): void {
  byId('references').innerHTML = Object.entries(SOURCES)
    .map(([id, s]) => `<li id="ref-${id}" tabindex="-1"><span class="mono">[${id}]</span> <a href="${s.url}" rel="noopener">${esc(s.title)}</a></li>`)
    .join('');
}

byId('pin').addEventListener('click', () => {
  pinned = pinned ? null : structuredClone(scenario);
  activeStep = null;
  render();
});

byId('reset').addEventListener('click', () => {
  scenario = buildScenario(scenario.mode);
  buildControls();
  render();
});

// ------------------------------------------------------------------ share links (?s=)
const DEFAULT_SHARE = encodeShare(buildScenario('starmind'));

/** The address bar always describes the current scenario, so copying it shares the case. */
function shareUrl(): string {
  const share = encodeShare(scenario);
  return `${location.pathname}${share === DEFAULT_SHARE ? '' : `?s=${share}`}`;
}
/** Remembers which ?s= this tab wrote, so a reload is recognised as a restore, not a link someone sent. */
const OWN_SHARE_KEY = 'watts-to-space:own-share';

function syncShareUrl(): void {
  try {
    const url = shareUrl();
    history.replaceState(history.state, '', `${url}${location.hash}`);
    const share = new URLSearchParams(url.split('?')[1] ?? '').get('s');
    if (share) sessionStorage.setItem(OWN_SHARE_KEY, share);
    else sessionStorage.removeItem(OWN_SHARE_KEY);
  } catch {
    // Some file:// contexts refuse history or storage; the Copy button still works.
  }
}

/** Load a scenario from ?s= at startup. A bad link leaves the default case and says why. */
function loadFromUrl(): void {
  const share = new URLSearchParams(location.search).get('s');
  if (!share) return;
  const status = byId('io-status');
  let ownAddress = false;
  try {
    ownAddress = sessionStorage.getItem(OWN_SHARE_KEY) === share;
  } catch {
    // storage unavailable: treat as a link
  }
  try {
    const decoded = decodeShareDetailed(share);
    scenario = decoded.scenario;
    const dropped = decoded.ignored.length ? ` These settings no longer exist and were dropped: ${decoded.ignored.join(', ')}.` : '';
    const changed = decoded.presetsChanged || decoded.ignored.length > 0;
    if (ownAddress) {
      // A reload of this tab's own address: restore quietly; mention only a model update.
      status.className = 'io-status info';
      status.textContent = changed
        ? `Restored your scenario. The model has been updated since, so values you did not change now come from the updated reference cases.${dropped}`
        : '';
    } else {
      status.className = changed ? 'io-status warn' : 'io-status ok';
      status.textContent = changed
        ? `Loaded the scenario from this link. It was made with an earlier version of the reference cases, so values its author did not change now come from the current ones and results may differ from what they saw.${dropped}`
        : 'Loaded the scenario from this link.';
    }
  } catch (err) {
    status.className = 'io-status error';
    status.innerHTML =
      err instanceof ScenarioImportError
        ? `<b>This link's scenario was not loaded.</b><ul>${err.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`
        : `<b>This link's scenario was not loaded:</b> ${esc(err)}`;
  }
}

byId('share').addEventListener('click', async () => {
  const url = new URL(shareUrl(), location.href).href;
  const status = byId('io-status');
  try {
    await navigator.clipboard.writeText(url);
    status.className = 'io-status ok';
    status.textContent = 'Share link copied. It encodes only the parameters of this scenario.';
  } catch {
    // Clipboard unavailable (e.g. some file:// pages): show the link for manual copying.
    status.className = 'io-status ok';
    status.innerHTML = `Copy this link: <input class="share-field" readonly value="${esc(url)}" aria-label="Share link">`;
    status.querySelector<HTMLInputElement>('.share-field')?.select();
  }
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

loadFromUrl();
buildControls();
renderReferences();
render();
// A link from a companion page to an Assumptions row (#note-…) scrolls to it and opens its explanation.
if (location.hash) highlightTarget(true);
