/**
 * The "watts per kilogram" sister page. Every point is a radiator: heat rejected per m² of
 * installed radiator (x) against thermal hardware per m², panel plus pumps (y). W/kg is x / y,
 * so each line of equal W/kg is a straight diagonal on log axes, the same for every case.
 * The reference cases come from the full model (sizing margin, fin losses and their own pumps
 * included), so each dot sits exactly on its own W/kg; your radiator moves with the sliders.
 */
import { MODES, buildScenario } from '../model/scenarios.ts';
import { loopCeiling_W_kg, panelFlux_W_m2, wattsPerKg } from '../model/specificRejection.ts';
import { evaluateScenario } from '../model/system.ts';
import type { ModeId } from '../model/types.ts';
import { lineChart, setChartStamp, type Series } from './charts.ts';
import { sliderPanel, type Slider } from './sliders.ts';

const byId = (id: string) => document.getElementById(id) as HTMLElement;
const fmt = (v: number, digits = 0) => v.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 }).replace(/^-(?=[0.]+$)/, '');
const ALTITUDE_KM = 600;
const LEVELS = [10, 30, 100, 300, 1000, 3000];
const X_RANGE: [number, number] = [100, 4000];

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
/** The full model's reference cases, placed by the same arithmetic as the lines: heat and mass per installed m². */
const CASES = (Object.keys(MODES) as ModeId[]).map((id) => {
  const r = evaluateScenario(buildScenario(id));
  return {
    id,
    heat_W_m2: r.heatToReject_W / r.radiatorArea_m2,
    mass_kg_m2: (r.mass_kg.radiator + r.mass_kg.thermalLoop) / r.radiatorArea_m2,
    wkg: r.thermalRejection_W_per_kg,
  };
});

/** Points spaced evenly on a log axis, so straight lines stay smooth for hover. */
const LOG_X = Array.from({ length: 41 }, (_, i) => X_RANGE[0] * (X_RANGE[1] / X_RANGE[0]) ** (i / 40));

function render(): void {
  const series: Series[] = LEVELS.map((level) => ({
    name: `${fmt(level)} W/kg`,
    label: `${fmt(level)} W/kg`,
    color: 'var(--ink-2)',
    width: 1.25,
    points: LOG_X.map((x) => ({ x, y: x / level })),
  }));
  const ceiling = loopCeiling_W_kg(state.loop);
  // Your pumps alone weigh q · m_P per m²: no radiator with these pumps can sit below this line (the ceiling's W/kg).
  // Cases with lighter pumps of their own can.
  if (state.loop > 0)
    series.push({
      name: `Your pumps alone (${fmt(state.loop, 1)} kg/kW): a ${fmt(ceiling)} W/kg ceiling`,
      label: 'your pumps alone',
      color: 'var(--accent)',
      width: 2,
      dash: true,
      points: LOG_X.map((x) => ({ x, y: (x * state.loop) / 1000 })),
    });
  const q = panelFlux_W_m2(inputs());
  const pumps = (q * state.loop) / 1000;
  const wkg = wattsPerKg(inputs());
  const narrow = window.matchMedia('(max-width: 640px)').matches;
  setChartStamp(`Your radiator: ${fmt(state.T_C)} °C, ${fmt(state.arealDensity, 1)} kg/m², pumps ${fmt(state.loop, 1)} kg/kW, ε ${state.emissivity}, ${ALTITUDE_KM} km, knife-edge to the Sun · watts-to-space by Chris Lewicki, CC BY 4.0`);
  lineChart(byId('chart-mass-map'), {
    series,
    x: { label: 'Heat rejected per m² of radiator (W/m²)', log: true, format: (v) => fmt(v), min: X_RANGE[0], max: X_RANGE[1] },
    y: { label: 'Thermal hardware per m²: panel + pumps (kg/m²)', log: true, toggle: true, format: (v) => fmt(v, v < 1 ? 1 : 0), min: 0.2, max: 150 },
    // What temperature buys: the heat a panel like yours rejects per m² at each temperature.
    vrules: [0, 50, 100, 150].map((T) => ({ x: panelFlux_W_m2(inputs(T)), label: `${T} °C` })),
    markers: [
      // Labels to the left for points near the right edge or with a neighbour to their right.
      ...CASES.map((c) => ({ x: c.heat_W_m2, y: c.mass_kg_m2, label: narrow ? `${SHORTER[c.id]} ${fmt(c.wkg)}` : `${SHORT[c.id]}, ${fmt(c.wkg)} W/kg`, color: CASE_COLORS[c.id], labelLeft: c.id === 'starmind' || c.id === 'physics' })),
      { x: q, y: state.arealDensity + pumps, label: narrow ? `you ${fmt(wkg)}` : `you, ${fmt(wkg)} W/kg`, color: 'var(--ink)' },
    ],
    height: window.matchMedia('(max-width: 900px)').matches ? 260 : 400,
  });
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
      ? 'Your radiator sits close to the dashed line: your pumps and loop now set the limit, and a lighter radiator adds little until they get lighter too.'
      : 'Moving right takes a hotter radiator (the temperature marks show what each one buys); moving down takes a lighter one. The dashed line is your pumps on their own: no radiator with those pumps can sit below it.';
}

byId('q50').textContent = `${fmt(panelFlux_W_m2({ T_K: 323.15, emissivity: 0.9, altitude_km: ALTITUDE_KM }))} W per m²`;
sliderPanel(byId('mass-controls'), byId('mass-reset') as HTMLButtonElement, SLIDERS, state, render);
let resize = 0;
window.addEventListener('resize', () => {
  cancelAnimationFrame(resize);
  resize = requestAnimationFrame(render);
});
