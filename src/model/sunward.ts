/**
 * The "sun" sister page: what direct sunlight and Earth below do to a radiator panel.
 *
 * Geometry: a flat two-sided panel held edge-on to Earth (both faces see the horizon, as in
 * the main model's 'edgeOn' orientation), turned so the Sun strikes one face at `sunAngle`
 * from its normal: 0° is face-on, 90° is knife-edge (no direct sunlight). Earth's infrared
 * and reflected sunlight come from the main model (environment.ts) for a dawn-dusk orbit.
 * The panel is at one temperature (fin efficiency 1).
 */
import { SOLAR_CONSTANT_W_M2 } from './constants.ts';
import { absorbedFluxPerFace } from './environment.ts';
import { emittedFlux } from './thermalEmission.ts';

/** IAU 2015 Resolution B3 nominal solar values, and the IAU 2012 astronomical unit. */
export const SUN = { effectiveTemperature_K: 5772, radius_km: 695_700, au_km: 149_597_870.7 };

/** Solid angle of the Sun's disc seen from 1 au, sr. */
export function sunSolidAngle_sr(): number {
  return 2 * Math.PI * (1 - Math.cos(Math.asin(SUN.radius_km / SUN.au_km)));
}

/** Share of a flat face's view (a hemisphere, 2π sr) that the Sun's disc covers. */
export function sunShareOfView(): number {
  return sunSolidAngle_sr() / (2 * Math.PI);
}

/** Sunlight at 1 au from a black body at the Sun's temperature: σT⁴(R/d)², W/m². Checks the 1,361 W/m² constant. */
export function blackBodySunlight_W_m2(): number {
  return emittedFlux(SUN.effectiveTemperature_K, 1, 0) * (SUN.radius_km / SUN.au_km) ** 2;
}

/** β of a dawn-dusk orbit like the main model's Starmind case: Earth's reflected light is small. */
export const DAWN_DUSK_BETA_DEG = 70;

export interface SunwardInputs {
  T_K: number;
  emissivity: number;
  solarAbsorptance: number;
  /** Angle between the Sun and the sunlit face's normal, degrees: 0 face-on, 90 knife-edge. */
  sunAngle_deg: number;
  altitude_km: number;
}

/** Heat budget per m² of two-sided panel, W/m². Losses are positive numbers. */
export interface SunwardBudget {
  emitted: number;
  sun: number;
  earthInfrared: number;
  earthReflected: number;
  net: number;
  /** Net with no Sun and no Earth: the dark-sky reference. */
  darkSky: number;
}

export function sunwardBudget(i: SunwardInputs): SunwardBudget {
  const surface = { emissivity: i.emissivity, solarAbsorptance: i.solarAbsorptance };
  const emitted = 2 * emittedFlux(i.T_K, i.emissivity);
  const sun = i.solarAbsorptance * SOLAR_CONSTANT_W_M2 * Math.max(0, Math.cos((i.sunAngle_deg * Math.PI) / 180));
  const earth = (s: typeof surface) =>
    absorbedFluxPerFace({ kind: 'orbit', body: 'earth', altitude_km: i.altitude_km, beta_deg: DAWN_DUSK_BETA_DEG }, 'edgeOn', s).reduce((a, b) => a + b, 0);
  const earthInfrared = earth({ ...surface, solarAbsorptance: 0 });
  const earthReflected = earth(surface) - earthInfrared;
  return { emitted, sun, earthInfrared, earthReflected, net: emitted - sun - earthInfrared - earthReflected, darkSky: emitted };
}
