/**
 * The everyday sister page: pick a familiar device, see what its case would do in a vacuum,
 * how big a radiator it would need, and why air makes cooling easy.
 */
import {
  CASE_EMISSIVITY,
  CONVECTION,
  DEVICES,
  EVERYDAY_SOURCES,
  PLACES,
  RADIATOR_EMISSIVITY,
  caseArea_m2,
  caseTemperature_K,
  footprint_m2,
  nearestObject,
  OBJECTS,
  radiativeCoefficient_W_m2K,
  radiatorArea_m2,
  type DeviceId,
  type PlaceId,
} from '../model/everyday.ts';
import { rangeBars, setChartStamp } from './charts.ts';

const byId = (id: string) => document.getElementById(id) as HTMLElement;
const esc = (s: unknown) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
const fmt = (v: number, digits = 0) => v.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
/** Two significant figures, so 0.048 and 7,968 both read naturally. */
const sig = (v: number) => (v >= 100 ? fmt(Math.round(v / 10 ** (Math.floor(Math.log10(v)) - 1)) * 10 ** (Math.floor(Math.log10(v)) - 1)) : fmt(v, v >= 10 ? 0 : v >= 1 ? 1 : 3));
/** A ratio as "77 %" below one and "1.1 ×" above, so small fractions read naturally. */
const ratio = (v: number) => (v < 1 ? `${fmt(100 * v)} %` : `${sig(v)} ×`);
const power = (W: number) => (W >= 1e6 ? `${fmt(W / 1e6, 1)} MW` : W >= 1e3 ? `${fmt(W / 1e3)} kW` : `${fmt(W)} W`);
const cite = (note: string) => esc(note).replace(/\[([a-z0-9-]+)\]/g, (_, id: string) => (EVERYDAY_SOURCES[id] ? `<a href="#src-${id}">[${id}]</a>` : `[${id}]`));

const IDS = Object.keys(DEVICES) as DeviceId[];
let device: DeviceId = 'laptop';
let radiator_C = 60;

/** Plain-language reading of a case temperature. */
function verdict(C: number): string {
  if (C < 0) return 'below freezing';
  if (C < 45) return 'fine';
  if (C < 70) return 'too hot to hold';
  if (C < 100) return 'electronics in trouble';
  if (C < 525) return 'electronics fail';
  return 'glowing red hot'; // ~525 °C (Draper point): the visible glow of a hot object begins
}

const PLACE_NOTES: Record<PlaceId, string> = {
  desk: 'Still air at 20 °C, as on a desk with the fans switched off: the air carries some heat away and the case radiates to the room.',
  chamber: 'No air. The chamber walls are at 20 °C and radiate heat back.',
  space: 'No air, but the dark sky sends almost nothing back.',
};

function renderDevices(): void {
  const nav = byId('devices');
  nav.replaceChildren();
  for (const id of IDS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = DEVICES[id].name;
    b.setAttribute('aria-pressed', String(id === device));
    b.addEventListener('click', () => {
      device = id;
      render();
    });
    nav.appendChild(b);
  }
  const d = DEVICES[device];
  byId('device-summary').innerHTML = `<b>${power(d.power_W)}</b> of heat, running flat out · ${cite(d.note.size)}<br><span class="small">Heat: ${cite(d.note.power)}</span>`;
}

function renderPlaces(): void {
  const d = DEVICES[device];
  const A = caseArea_m2(d);
  byId('places').innerHTML = (Object.keys(PLACES) as PlaceId[])
    .map((id) => {
      const C = caseTemperature_K(d.power_W, A, CASE_EMISSIVITY, PLACES[id]) - 273.15;
      return `<div class="kpi"><div class="kpi-label">${esc(PLACES[id].name)}</div><div class="kpi-value">${fmt(C)} °C</div><div class="kpi-delta">${verdict(C)}</div><div class="kpi-sub">${PLACE_NOTES[id]}</div></div>`;
    })
    .join('');
}

function renderRadiator(): void {
  const d = DEVICES[device];
  const T = radiator_C + 273.15;
  const area = radiatorArea_m2(d.power_W, T);
  const foot = footprint_m2(d);
  const obj = nearestObject(area);
  const times = area / obj.area_m2;
  byId('radiator-readout').innerHTML = [
    ['Radiator area', `${sig(area)} m²`, `two-sided panel at ${fmt(radiator_C)} °C`],
    ['About', times >= 0.95 && times <= 1.05 ? obj.name : times < 1 ? `${ratio(times)} of ${obj.name}` : `${ratio(times)} ${obj.name}`, `${obj.name}: ${sig(obj.area_m2)} m²`],
    ['Compared with its footprint', ratio(area / foot), `the ${d.name} covers ${sig(foot)} m²`],
  ]
    .map(([k, v, sub]) => `<div class="kpi"><div class="kpi-label">${esc(k)}</div><div class="kpi-value">${esc(v)}</div><div class="kpi-sub">${esc(sub)}</div></div>`)
    .join('');
  renderToScale(area, foot, obj);
  byId('scaling').innerHTML =
    '<tr><th>Device</th><th>Heat</th><th>Radiator</th><th>Times its footprint</th></tr>' +
    IDS.map((id) => {
      const x = DEVICES[id];
      const a = radiatorArea_m2(x.power_W, T);
      return `<tr${id === device ? ' class="current"' : ''}><td>${esc(x.name)}</td><td>${power(x.power_W)}</td><td>${sig(a)} m²</td><td>${ratio(a / footprint_m2(x))}</td></tr>`;
    }).join('');
}

/** Footprint, radiator and the nearest familiar object, side by side at one scale. */
function renderToScale(area: number, foot: number, obj: (typeof OBJECTS)[number]): void {
  const box = byId('to-scale');
  const W = Math.max(300, box.clientWidth);
  const d = DEVICES[device];
  const side = Math.sqrt(area);
  const shapes = [
    { label: `${d.name} footprint`, w: d.size_m[0], h: d.size_m[1], cls: 'device' },
    { label: 'radiator', w: side, h: side, cls: 'radiator' },
    { label: obj.name.replace(/^an? /, ''), w: obj.size_m[0], h: obj.size_m[1], cls: 'object' },
  ];
  const gap = 24;
  // One scale for all three, limited by the width and by a 170 px drawing height.
  const k = Math.min((W - 4 * gap) / shapes.reduce((s, x) => s + x.w, 0), 170 / Math.max(...shapes.map((x) => x.h)));
  const tallest = Math.max(...shapes.map((x) => x.h * k));
  const H = tallest + 46; // room for two staggered label rows, so narrow shapes' labels do not overlap
  let x = gap;
  const parts = shapes.map((s, i) => {
    const w = Math.max(1, s.w * k);
    const h = Math.max(1, s.h * k);
    const g = `<rect class="${s.cls}" x="${x}" y="${tallest + 4 - h}" width="${w}" height="${h}" rx="2"/><text class="tick" x="${x}" y="${tallest + (i % 2 ? 38 : 22)}">${esc(s.label)}</text>`;
    x += w + gap;
    return g;
  });
  box.innerHTML = `<svg class="chart scale-drawing" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="To scale: the ${esc(d.name)} footprint (${sig(foot)} m²), its radiator (${sig(area)} m²) and ${esc(obj.name)} (${sig(obj.area_m2)} m²)">${parts.join('')}</svg>
    <p class="chart-stamp">Drawn to scale. ${esc(d.name)}, ${power(d.power_W)}, radiator at ${fmt(radiator_C)} °C · watts-to-space by Chris Lewicki, CC BY 4.0</p>`;
}

function renderAir(): void {
  const h = radiativeCoefficient_W_m2K(radiator_C + 273.15, RADIATOR_EMISSIVITY);
  rangeBars(byId('chart-air'), {
    rows: [
      ...CONVECTION.map((c, i) => ({ name: c.name, low: c.low, high: c.high, color: `var(--s${[1, 3, 2, 5][i] ?? 1})` })),
      { name: `Radiating to space at ${fmt(radiator_C)} °C`, low: h, high: h, color: 'var(--accent)', strong: true },
    ],
    axisLabel: 'Heat moved, W per m² per °C of temperature difference (log scale)',
    format: (v) => (v >= 1000 ? `${fmt(v / 1000)}k` : fmt(v, v < 10 ? 1 : 0)),
  });
}

function renderSources(): void {
  byId('sources').innerHTML = Object.entries(EVERYDAY_SOURCES)
    .map(([id, s]) => `<li id="src-${id}"><span class="mono">[${id}]</span> <a href="${esc(s.url)}" rel="noopener">${esc(s.title)}</a></li>`)
    .join('');
}

function render(): void {
  setChartStamp(`${DEVICES[device].name}, ${power(DEVICES[device].power_W)} · radiator at ${fmt(radiator_C)} °C · watts-to-space by Chris Lewicki, CC BY 4.0`);
  renderDevices();
  renderPlaces();
  renderRadiator();
  renderAir();
}

const box = byId('radiator-temp') as HTMLInputElement;
const range = byId('radiator-temp-range') as HTMLInputElement;
const setTemp = (v: number) => {
  if (Number.isFinite(v)) radiator_C = Math.min(100, Math.max(30, v));
  box.value = String(radiator_C);
  range.value = String(radiator_C);
  render();
};
range.addEventListener('input', () => setTemp(Number(range.value)));
box.addEventListener('change', () => setTemp(Number(box.value)));
let resize = 0;
window.addEventListener('resize', () => {
  cancelAnimationFrame(resize);
  resize = requestAnimationFrame(render);
});

renderSources();
render();
