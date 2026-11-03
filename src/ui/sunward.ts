/**
 * The "sun" sister page: turn a radiator panel toward the Sun and change its orbit height,
 * and watch net rejection change. Sliders sit beside the chart.
 */
import { SOLAR_CONSTANT_W_M2 } from '../model/constants.ts';
import { DAWN_DUSK_BETA_DEG, SUN, sunShareOfView, sunwardBudget, type SunwardInputs } from '../model/sunward.ts';
import { lineChart, setChartStamp } from './charts.ts';

const byId = (id: string) => document.getElementById(id) as HTMLElement;
const fmt = (v: number, digits = 0) => v.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 }).replace(/^-/, '−');
/** A loss shown as a negative number, or 0 when it rounds away. */
const loss = (v: number) => (v < 0.5 ? '0' : `−${fmt(v)}`);

const state = { sunAngle_deg: 45, altitude_km: 600, solarAbsorptance: 0.2, emissivity: 0.9, T_C: 60 };
const inputs = (T_C = state.T_C): SunwardInputs => ({ ...state, T_K: T_C + 273.15 });

interface Slider {
  key: keyof typeof state;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  hint: string;
  /** Parameter explanation on the main page (opens the Assumptions row), if it has one. */
  explain?: string;
  /** Log-scaled slider (the number box still shows the plain value). */
  log?: boolean;
}

const SLIDERS: Slider[] = [
  { key: 'sunAngle_deg', label: 'Sun angle', unit: '°', min: 0, max: 90, step: 1, hint: 'Between the Sun and the sunlit face: 0° face-on, 90° knife-edge.' },
  { key: 'altitude_km', label: 'Orbit height', unit: 'km', min: 200, max: 40000, step: 1, hint: 'Above Earth. Geostationary is 35,786 km.', explain: 'environment.altitude_km', log: true },
  { key: 'solarAbsorptance', label: 'Solar absorptance α', unit: '', min: 0, max: 1, step: 0.01, hint: 'Share of sunlight the coating absorbs: about 0.1 for optical solar reflectors, 0.2 white paint, 0.95 black paint.', explain: 'radiator.solarAbsorptance' },
  { key: 'emissivity', label: 'IR emissivity ε', unit: '', min: 0.5, max: 1, step: 0.01, hint: 'How well the coating radiates heat; 0.9 is typical for white paint.', explain: 'radiator.emissivity' },
  { key: 'T_C', label: 'Radiator temperature', unit: '°C', min: 0, max: 150, step: 1, hint: 'Where to read the budget below. Chips at 100 °C leave a radiator around 60 °C.' },
];

function buildControls(): void {
  const box = byId('sun-controls');
  box.replaceChildren();
  for (const s of SLIDERS) {
    const id = `sun-${s.key}`;
    const row = document.createElement('div');
    row.className = 'param';
    const toRange = (v: number) => (s.log ? Math.log10(v) : v);
    const fromRange = (r: number) => (s.log ? 10 ** r : r);
    const [rmin, rmax] = [toRange(s.min), toRange(s.max)];
    row.innerHTML = `<div class="param-head">
        <label class="control-label" for="${id}">${s.label}</label>
        ${s.explain ? `<a class="info-anchor" href="../index.html#note-${s.explain}" target="_blank" rel="noopener" title="What is ${s.label}? Opens its explanation in the full model" aria-label="What is ${s.label}? Opens the full model's explanation in a new tab">i</a>` : ''}
        <span class="param-value"><input id="${id}" type="number" inputmode="decimal" min="${s.min}" max="${s.max}" step="any"><span class="unit">${s.unit}</span></span>
      </div>
      <input type="range" min="${rmin}" max="${rmax}" step="${s.log ? (rmax - rmin) / 400 : s.step}" aria-label="${s.label}" tabindex="-1">
      <p class="param-hint">${s.hint}</p>`;
    const [num, range] = Array.from(row.querySelectorAll('input')) as [HTMLInputElement, HTMLInputElement];
    const sync = () => {
      const v = state[s.key];
      num.value = String(s.log ? Math.round(v) : +v.toPrecision(4));
      range.value = String(toRange(v));
    };
    const set = (v: number) => {
      if (Number.isFinite(v)) state[s.key] = Math.min(s.max, Math.max(s.min, v));
      sync();
      render();
    };
    range.addEventListener('input', () => set(fromRange(Number(range.value))));
    num.addEventListener('change', () => set(Number(num.value)));
    sync();
    box.appendChild(row);
  }
}

function render(): void {
  const temps = Array.from({ length: 76 }, (_, i) => i * 2); // 0–150 °C
  const curve = (f: (b: ReturnType<typeof sunwardBudget>) => number, over: Partial<SunwardInputs> = {}) =>
    temps.map((T) => ({ x: T, y: f(sunwardBudget({ ...inputs(T), ...over })) }));
  const b = sunwardBudget(inputs());
  setChartStamp(
    `Sun angle ${fmt(state.sunAngle_deg)}°, ${fmt(state.altitude_km)} km, α ${state.solarAbsorptance}, ε ${state.emissivity}, dawn–dusk orbit · watts-to-space by Chris Lewicki, CC BY 4.0`,
  );
  lineChart(byId('chart-sun'), {
    series: [
      { name: 'Dark sky: no Sun, no Earth', label: 'dark sky', color: 'var(--ink-2)', width: 1.75, dash: true, points: curve((x) => x.darkSky) },
      { name: `Earth below at ${fmt(state.altitude_km)} km`, label: 'Earth only', color: 'var(--s1)', width: 2, points: curve((x) => x.net, { sunAngle_deg: 90 }) },
      { name: `Earth below, Sun at ${fmt(state.sunAngle_deg)}°`, label: 'Earth + Sun', color: 'var(--accent)', width: 3, points: curve((x) => x.net) },
    ],
    x: { label: 'Radiator temperature (°C)', format: (v) => fmt(v), min: 0, max: 150 },
    y: { label: 'W per m² of panel', format: (v) => fmt(v) },
    rules: [{ y: 0, label: 'below this line the panel absorbs more than it rejects' }],
    markers: [{ x: state.T_C, y: b.net, label: `${fmt(b.net)} W/m²` }],
    // Shorter on phones, where the chart stays pinned above the sliders.
    height: window.matchMedia('(max-width: 900px)').matches ? 220 : 340,
  });
  const share = b.darkSky > 0 ? (100 * b.net) / b.darkSky : NaN;
  const tile = (k: string, v: string, sub: string, strong = false) =>
    `<div class="kpi${strong ? ' strong' : ''}"><div class="kpi-label">${k}</div><div class="kpi-value">${v}</div><div class="kpi-sub">${sub}</div></div>`;
  byId('sun-budget').innerHTML = [
    tile('Sent out, both faces', `${fmt(b.emitted)} W/m²`, `at ${fmt(state.T_C)} °C, ε ${state.emissivity}`),
    tile('Sunlight absorbed', `${loss(b.sun)} W/m²`, `α × ${fmt(SOLAR_CONSTANT_W_M2)} W/m² × cos ${fmt(state.sunAngle_deg)}°, on the sunlit face`),
    tile('From Earth', `${loss(b.earthInfrared + b.earthReflected)} W/m²`, `${fmt(b.earthInfrared)} infrared + ${fmt(b.earthReflected)} reflected sunlight`),
    tile('Net rejected', `${fmt(b.net)} W/m²`, Number.isFinite(share) ? `${fmt(share)} % of the dark-sky value` : '', true),
  ].join('');
  byId('sun-note').textContent =
    b.net < 0
      ? 'At this temperature the panel takes in more heat than it sends out: it would warm up until it found a new balance.'
      : `The Sun costs ${fmt(b.darkSky > 0 ? (100 * b.sun) / b.darkSky : 0)} % of the dark-sky rejection here, and Earth ${fmt(b.darkSky > 0 ? (100 * (b.earthInfrared + b.earthReflected)) / b.darkSky : 0)} %. Earth's reflected sunlight is averaged over a dawn–dusk orbit (β = ${DAWN_DUSK_BETA_DEG}°).`;
}

// The numbers in the introduction come from the same model.
byId('sun-share').textContent = `${fmt(100 * sunShareOfView(), 3)} %`;
byId('sun-temp').textContent = `${fmt(SUN.effectiveTemperature_K)} K`;
byId('sun-flux').textContent = `${fmt(SOLAR_CONSTANT_W_M2)} W per m²`;

buildControls();
render();
let resize = 0;
window.addEventListener('resize', () => {
  cancelAnimationFrame(resize);
  resize = requestAnimationFrame(render);
});
