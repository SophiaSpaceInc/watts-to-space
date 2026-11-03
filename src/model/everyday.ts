/**
 * The "everyday" sister page: what happens to familiar electronics in a vacuum, and how big a
 * radiator they would need. Deliberately simpler than the main model: a uniform-temperature
 * box or a two-sided panel radiating to the dark sky, with no heat path and no sunlight.
 *
 * Provenance tags follow scenarios.ts: [source-id] for a source in EVERYDAY_SOURCES, or
 * ESTIMATE for a round number chosen to be typical.
 */
import { SIGMA } from './constants.ts';
import { emittedFlux } from './thermalEmission.ts';
import { SOURCES } from './scenarios.ts';

export const EVERYDAY_SOURCES: Record<string, { title: string; url: string }> = {
  'apple-iphone-17-pro': { title: 'Apple, iPhone 17 Pro technical specifications', url: 'https://www.apple.com/iphone-17-pro/specs/' },
  'apple-mbp14-m4': { title: 'Apple, MacBook Pro (14-inch, M4 Pro or M4 Max, 2024) technical specifications', url: 'https://support.apple.com/en-us/121553' },
  'hpe-gb200-nvl72': { title: 'HPE QuickSpecs, NVIDIA GB200 NVL72 by HPE (rack TDP 132 kW nominal; 1,068 × 600 × 2,495 mm)', url: 'https://www.hpe.com/us/en/collaterals/collateral.a50009224enw.html' },
  'eia-310': { title: 'EIA-310 rack standard: 1U = 44.45 mm; 19-inch rack', url: 'https://en.wikipedia.org/wiki/19-inch_rack' },
  incropera: { title: 'Incropera et al., Fundamentals of Heat and Mass Transfer, 6th ed. (Wiley, 2007), Table 1.1, typical convection coefficients', url: 'https://pages.mtu.edu/~fmorriso/cm3120/typical_values_heat_transfer_coefficient.pdf' },
  // Shared with the main model, so both pages cite the same solar figure.
  'spacex-starmind': SOURCES['spacex-starmind'] as { title: string; url: string },
  'spacex-0608': SOURCES['spacex-0608'] as { title: string; url: string },
  'iso-7810': { title: 'ISO/IEC 7810 ID-1 card (a credit card): 85.60 × 53.98 mm', url: 'https://en.wikipedia.org/wiki/ISO/IEC_7810' },
  'iso-216': { title: 'ISO 216 paper sizes: A4 is 210 × 297 mm', url: 'https://en.wikipedia.org/wiki/ISO_216' },
  'tennis-court': { title: 'Tennis court: doubles 23.77 × 10.97 m, set by the ITF Rules of Tennis', url: 'https://en.wikipedia.org/wiki/Tennis_court' },
  'football-pitch': { title: 'Football pitch: 105 × 68 m, the size FIFA recommends', url: 'https://en.wikipedia.org/wiki/Football_pitch' },
};

export type DeviceId = 'phone' | 'laptop' | 'gamingPc' | 'server1u' | 'gpuRack' | 'dataHall';

export interface Device {
  name: string;
  /** Heat it gives off under sustained heavy use: every watt it draws. */
  power_W: number;
  /** Outside dimensions of its case, m (length, width, height). */
  size_m: [number, number, number];
  note: { power: string; size: string };
}

export const DEVICES: Record<DeviceId, Device> = {
  phone: {
    name: 'Phone',
    power_W: 5,
    size_m: [0.15, 0.0719, 0.00875],
    note: { power: 'ESTIMATE: a phone under sustained heavy use (games, video calls).', size: 'iPhone 17 Pro, 150.0 × 71.9 × 8.75 mm [apple-iphone-17-pro].' },
  },
  laptop: {
    name: 'MacBook Pro 14"',
    power_W: 60,
    size_m: [0.3126, 0.2212, 0.0155],
    note: { power: 'ESTIMATE: sustained heavy load; it ships with a 70 W or 96 W charger [apple-mbp14-m4].', size: '31.26 × 22.12 × 1.55 cm, closed [apple-mbp14-m4].' },
  },
  gamingPc: {
    name: 'Gaming PC',
    power_W: 500,
    size_m: [0.45, 0.21, 0.47],
    note: { power: 'ESTIMATE: a high-end graphics card and processor under load.', size: 'ESTIMATE: a mid-tower case.' },
  },
  server1u: {
    name: '1U server',
    power_W: 500,
    size_m: [0.75, 0.434, 0.04445],
    note: { power: 'ESTIMATE: a two-processor 1U server under load.', size: '1U is 44.45 mm tall in a 19-inch rack [eia-310]; 434 mm wide and 750 mm deep is an ESTIMATE of a typical chassis.' },
  },
  gpuRack: {
    name: 'GPU rack (NVL72)',
    power_W: 132e3,
    size_m: [1.068, 0.6, 2.495],
    note: { power: 'NVIDIA GB200 NVL72 rack, 132 kW thermal design power, nominal [hpe-gb200-nvl72].', size: '1,068 × 600 × 2,495 mm [hpe-gb200-nvl72].' },
  },
  dataHall: {
    name: 'Data hall',
    power_W: 10e6,
    size_m: [50, 40, 6],
    note: { power: 'ESTIMATE: a 10 MW data hall.', size: 'ESTIMATE: a 50 × 40 m single-storey hall, 6 m high.' },
  },
};

export type PlaceId = 'desk' | 'chamber' | 'space';

export interface Place {
  name: string;
  /** What the case radiates to, K. */
  surroundings_K: number;
  /** Air convection coefficient on the case, W/m²K (0 in a vacuum). */
  air_W_m2K: number;
}

export const PLACES: Record<PlaceId, Place> = {
  // Still air: 5 W/m²K sits in the free-convection range for gases, 2–25 W/m²K [incropera].
  desk: { name: 'In still air, fans off', surroundings_K: 293.15, air_W_m2K: 5 },
  chamber: { name: 'In a vacuum chamber', surroundings_K: 293.15, air_W_m2K: 0 },
  // The dark sky: deep space, or a radiator held edge-on to the Sun.
  space: { name: 'In space, facing the dark sky', surroundings_K: 2.725, air_W_m2K: 0 },
};

/** Emissivity of a painted or anodized case. ESTIMATE. */
export const CASE_EMISSIVITY = 0.85;
/** Emissivity of a white-painted radiator panel, as in the main model's Starmind case. */
export const RADIATOR_EMISSIVITY = 0.9;

export function caseArea_m2(d: Device): number {
  const [l, w, h] = d.size_m;
  return 2 * (l * w + l * h + w * h);
}

export function footprint_m2(d: Device): number {
  return d.size_m[0] * d.size_m[1];
}

/** Heat the case sheds at temperature T, W: radiation plus air convection if there is air. */
export function caseHeatLoss_W(T_K: number, area_m2: number, emissivity: number, place: Place): number {
  return area_m2 * (emittedFlux(T_K, emissivity, place.surroundings_K) + place.air_W_m2K * (T_K - place.surroundings_K));
}

/**
 * Temperature the case settles at when it sheds `power_W`, assuming the heat spreads evenly over
 * the whole case (real devices have hot spots, and the chips run hotter than the case).
 * Solved by bisection: heat loss rises monotonically with temperature.
 */
export function caseTemperature_K(power_W: number, area_m2: number, emissivity: number, place: Place): number {
  let lo = place.surroundings_K;
  let hi = Math.max(lo + 1, Math.pow(power_W / (emissivity * SIGMA * area_m2) + place.surroundings_K ** 4, 0.25) + 1);
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (caseHeatLoss_W(mid, area_m2, emissivity, place) > power_W) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

/** Area of a two-sided radiator panel at T that sheds `power_W` to the dark sky, m². */
export function radiatorArea_m2(power_W: number, T_K: number, emissivity = RADIATOR_EMISSIVITY): number {
  return power_W / (2 * emittedFlux(T_K, emissivity));
}

/**
 * Solar array output in sunlight, W/m²: the figure SpaceX gives for its AI satellites
 * [spacex-starmind][spacex-0608], which the main model's Starmind case is calibrated to.
 * The page assumes an always-sunlit dawn-dusk orbit, so there is no battery, and ignores
 * conversion losses between the solar array and the device.
 */
export const SOLAR_ARRAY_W_M2 = 250;

/** Solar array area that powers the device in constant sunlight, m². */
export function solarArrayArea_m2(power_W: number): number {
  return power_W / SOLAR_ARRAY_W_M2;
}

/** Heat moved per m² per kelvin of temperature difference by radiation to the dark sky near T, W/m²K. */
export function radiativeCoefficient_W_m2K(T_K: number, emissivity = RADIATOR_EMISSIVITY): number {
  return emittedFlux(T_K + 0.5, emissivity) - emittedFlux(T_K - 0.5, emissivity);
}

/** Typical convection coefficients, W/m²K [incropera]. */
export const CONVECTION: { name: string; low: number; high: number }[] = [
  { name: 'Still air', low: 2, high: 25 },
  { name: 'Air blown by a fan', low: 25, high: 250 },
  { name: 'Pumped water', low: 100, high: 20000 },
  { name: 'Boiling or condensing', low: 2500, high: 1e5 },
];

/** Familiar areas to compare a radiator with, smallest first. */
export const OBJECTS: { name: string; area_m2: number; size_m: [number, number]; note: string }[] = [
  { name: 'a credit card', area_m2: 0.0856 * 0.05398, size_m: [0.0856, 0.05398], note: '[iso-7810]' },
  { name: 'a sheet of A4 paper', area_m2: 0.21 * 0.297, size_m: [0.297, 0.21], note: '[iso-216]' },
  { name: 'a desk', area_m2: 1.5 * 0.75, size_m: [1.5, 0.75], note: 'ESTIMATE: 1.5 × 0.75 m' },
  { name: 'a parking space', area_m2: 5 * 2.5, size_m: [5, 2.5], note: 'ESTIMATE: 5 × 2.5 m' },
  { name: 'a tennis court', area_m2: 23.77 * 10.97, size_m: [23.77, 10.97], note: 'doubles court [tennis-court]' },
  { name: 'a football pitch', area_m2: 105 * 68, size_m: [105, 68], note: '[football-pitch]' },
];

/** The familiar object closest in size (by ratio) to an area. */
export function nearestObject(area_m2: number): (typeof OBJECTS)[number] {
  return OBJECTS.reduce((best, o) => (Math.abs(Math.log(o.area_m2 / area_m2)) < Math.abs(Math.log(best.area_m2 / area_m2)) ? o : best));
}
