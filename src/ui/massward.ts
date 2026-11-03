/**
 * The "watts per kilogram" sister page: lines of equal W/kg across radiator temperature and
 * radiator mass per m², the full model's reference cases as points, and your radiator.
 */
import { MODES, buildScenario } from '../model/scenarios.ts';
import { arealDensityFor_kg_m2, loopCeiling_W_kg, panelFlux_W_m2, wattsPerKg } from '../model/specificRejection.ts';
import { evaluateScenario } from '../model/system.ts';
import type { ModeId } from '../model/types.ts';
import { lineChart, setChartStamp, type Series } from './charts.ts';
import { sliderPanel, type Slider } from './sliders.ts';

const byId = (id: string) => document.getElementById(id) as HTMLElement;
const fmt = (v: number, digits = 0) => v.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
const ALTITUDE_KM = 600;
const LEVELS = [10, 30, 100, 300, 1000, 3000];

const state = { T_C: 50, arealDensity: 6, loop: 5, emissivity: 0.9 };
const inputs = (T_C = state.T_C) => ({ T_K: T_C + 273.15, emissivity: state.emissivity, arealDensity_kg_m2: state.arealDensity, loop_kg_per_kW: state.loop, altitude_km: ALTITUDE_KM });

const SLIDERS: Slider<keyof typeof state>[] = [
  { key: 'T_C', label: 'Radiator temperature', unit: '°C', min: -50, max: 150, step: 1, hint: 'The temperature the panel radiates at. Chips at 100 °C leave a radiator around 50–60 °C.' },
  { key: 'arealDensity', label: 'Radiator mass per m²', unit: 'kg/m²', min: 0.3, max: 30, step: 0.1, log: true, hint: 'Panel, tubes and coolant, micrometeoroid armour and deployment. ISS heritage is about 14.', explain: '../index.html#note-radiator.arealDensity_kg_m2' },
  { key: 'loop', label: 'Pumps and loop', unit: 'kg/kW', min: 0, max: 25, step: 0.1, hint: 'Pumps, accumulators, valves and joints per kW carried. ISS heritage is about 22.', explain: '../index.html#note-radiator.loopSpecificMass_kg_per_kW' },
  { key: 'emissivity', label: 'IR emissivity ε', unit: '', min: 0.5, max: 1, step: 0.01, hint: 'How well the coating radiates heat; 0.9 is typical for white paint.', explain: '../index.html#note-radiator.emissivity' },
];

const CASE_COLORS: Record<ModeId, string> = { iss: 'var(--s1)', starmind: 'var(--s2)', ideal: 'var(--s3)', physics: 'var(--s4)' };
const SHORT: Record<ModeId, string> = { iss: 'ISS heritage', starmind: 'Starmind', ideal: 'Aggressive', physics: 'Idealized bound' };
const SHORTER: Record<ModeId, string> = { iss: 'ISS', starmind: 'Starmind', ideal: 'Aggressive', physics: 'Bound' };
/** The full model's reference cases: where each radiates, its radiator mass per m², and its own W/kg. */
const CASES = (Object.keys(MODES) as ModeId[]).map((id) => {
  const s = buildScenario(id);
  const r = evaluateScenario(s);
  return { id, T_C: r.chain.fluidEffective_K - 273.15, m: s.radiator.arealDensity_kg_m2, wkg: r.thermalRejection_W_per_kg };
});

function render(): void {
  const temps = Array.from({ length: 101 }, (_, i) => -50 + 2 * i);
  const flux = temps.map((T) => panelFlux_W_m2(inputs(T)));
  // Only levels the pumps allow; each line keeps the temperatures where it is reachable.
  const series: Series[] = LEVELS.filter((level) => level < loopCeiling_W_kg(state.loop)).map((level) => ({
    name: `${fmt(level)} W/kg`,
    label: `${fmt(level)} W/kg`,
    color: 'var(--ink-2)',
    width: 1.5,
    points: temps.flatMap((T, i) => {
      const m = arealDensityFor_kg_m2(level, flux[i] ?? NaN, state.loop);
      return m === null ? [] : [{ x: T, y: m }];
    }),
  }));
  const wkg = wattsPerKg(inputs());
  const narrow = window.matchMedia('(max-width: 640px)').matches;
  const q = panelFlux_W_m2(inputs());
  setChartStamp(`Pumps and loop ${fmt(state.loop, 1)} kg/kW, ε ${state.emissivity}, ${ALTITUDE_KM} km, knife-edge to the Sun · watts-to-space by Chris Lewicki, CC BY 4.0`);
  lineChart(byId('chart-mass-map'), {
    series,
    x: { label: 'Radiator temperature (°C)', format: (v) => fmt(v), min: -50, max: 150 },
    y: { label: 'Radiator mass per m² (kg/m²)', log: true, toggle: true, format: (v) => fmt(v, v < 1 ? 1 : 0), min: 0.1, max: 400 },
    markers: [
      // Phones get short labels so neighbouring points stay readable.
      ...CASES.map((c) => ({ x: c.T_C, y: c.m, label: narrow ? `${SHORTER[c.id]} ${fmt(c.wkg)}` : `${SHORT[c.id]}, ${fmt(c.wkg)} W/kg`, color: CASE_COLORS[c.id] })),
      { x: state.T_C, y: state.arealDensity, label: narrow ? `you ${fmt(wkg)}` : `you, ${fmt(wkg)} W/kg`, color: 'var(--accent)', labelLeft: true },
    ],
    height: window.matchMedia('(max-width: 900px)').matches ? 240 : 380,
  });
  const ceiling = loopCeiling_W_kg(state.loop);
  const pumps = (q * state.loop) / 1000;
  const tile = (k: string, v: string, sub: string, strong = false) =>
    `<div class="kpi${strong ? ' strong' : ''}"><div class="kpi-label">${k}</div><div class="kpi-value">${v}</div><div class="kpi-sub">${sub}</div></div>`;
  byId('mass-budget').innerHTML = [
    tile('Heat per m²', `${fmt(q)} W/m²`, `both faces at ${fmt(state.T_C)} °C, set by physics`),
    tile('Mass per m²', `${fmt(state.arealDensity + pumps, 1)} kg/m²`, `${fmt(state.arealDensity, 1)} radiator + ${fmt(pumps, 1)} pumps and loop`),
    tile('Thermal rejection', `${fmt(wkg)} W/kg`, 'heat per m² ÷ mass per m²', true),
    tile('Ceiling set by the pumps', Number.isFinite(ceiling) ? `${fmt(ceiling)} W/kg` : 'none', 'no radiator, however light, beats this'),
  ].join('');
  byId('ceiling-why').innerHTML =
    state.loop > 0
      ? `Every watt the radiator rejects has to be carried to it by the coolant loop, and the loop's mass grows with
         the heat it carries, not with the radiator's area: pumps, accumulators, valves and rotary joints are sized in
         kilograms per kilowatt. With <b>${fmt(state.loop, 1)} kg per kW</b>, each kilowatt arrives with
         ${fmt(state.loop, 1)} kg of loop hardware before the radiator adds anything. So even a radiator that weighed
         nothing would reach only 1,000 W ÷ ${fmt(state.loop, 1)} kg = <b>${fmt(ceiling)} W/kg</b>, and any real radiator
         mass pulls it below that. In the formula, as <var>m</var><sub>A</sub> goes to zero,
         <var>q</var> / (<var>m</var><sub>A</sub> + <var>q</var>·<var>m</var><sub>P</sub>) tends to
         1 / <var>m</var><sub>P</sub>, whatever the temperature. Raising the ceiling takes lighter pumps and plumbing per
         kilowatt: for example a two-phase loop, which carries more heat per kilogram of coolant, or heat pipes, which
         move heat without pumps but have their own mass.`
      : 'With no pump or loop mass there is no ceiling: the radiator alone sets the watts per kilogram, and a lighter or hotter radiator always does better.';
  byId('mass-note').textContent =
    wkg > 0.8 * ceiling
      ? `The pumps and loop now set the limit: a lighter radiator adds little until they get lighter too.`
      : `Each line is one value of W/kg for these pumps; reaching the next line down needs a lighter radiator or a hotter one. Lines stop where the pumps alone rule that value out.`;
}

byId('q50').textContent = `${fmt(panelFlux_W_m2({ T_K: 323.15, emissivity: 0.9, altitude_km: ALTITUDE_KM }))} W per m²`;
sliderPanel(byId('mass-controls'), byId('mass-reset') as HTMLButtonElement, SLIDERS, state, render);
let resize = 0;
window.addEventListener('resize', () => {
  cancelAnimationFrame(resize);
  resize = requestAnimationFrame(render);
});
