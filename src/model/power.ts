/**
 * Power supply: solar array, energy storage across darkness, and the distribution
 * harness. Every watt delivered to the payload ends up as heat the radiator must
 * reject, so this module and the thermal model are two halves of one energy balance.
 */
import { COPPER, SOLAR_CONSTANT_W_M2 } from './constants.ts';
import type { Battery, Power } from './types.ts';
import type { Sunlight } from './environment.ts';

/**
 * Electrical output per m² of solar array in sunlight:
 *     S × η_cell × packing × operatingFactor
 * `operatingFactor` lumps cell temperature, mismatch, string wiring, and end-of-life
 * degradation. (The solar array also radiates its own unconverted sunlight. That heat never
 * reaches the payload radiator.)
 */
export function solarArraySpecificPower_W_m2(p: Pick<Power, 'cellEfficiency' | 'packingFactor' | 'operatingFactor'>): number {
  return SOLAR_CONSTANT_W_M2 * p.cellEfficiency * p.packingFactor * p.operatingFactor;
}

export interface Storage {
  /** Solar array output needed in sunlight, per watt of load. */
  solarArrayOversize: number;
  /** Battery nameplate energy. */
  energy_Wh: number;
  mass_kg: number;
}

/**
 * Size the solar array and battery for a constant load through a light/dark cycle.
 * Energy balance over one cycle of length T with sunlit fraction f and battery
 * round-trip efficiency η_rt:
 *     P_solar f T = P_load f T + P_load (1−f) T / η_rt
 *  →  oversize = P_solar / P_load = 1 + (1−f) / (f η_rt)
 * Battery nameplate energy = P_load (1−f) T / DoD. (DoD is set by cycle life:
 * ~5,000 cycles/yr in LEO forces shallow DoD. One cycle per month on the Moon allows deep.)
 */
export function storageSizing(args: { load_W: number } & Sunlight & Battery): Storage {
  const { load_W, sunlitFraction, cyclePeriod_h, roundTripEfficiency, depthOfDischarge, specificEnergy_Wh_kg } = args;
  if (sunlitFraction <= 0) return { solarArrayOversize: Infinity, energy_Wh: Infinity, mass_kg: Infinity };
  const dark = 1 - sunlitFraction;
  const energy_Wh = (load_W * dark * cyclePeriod_h) / depthOfDischarge;
  return {
    solarArrayOversize: 1 + dark / (sunlitFraction * roundTripEfficiency),
    energy_Wh,
    mass_kg: energy_Wh / specificEnergy_Wh_kg,
  };
}

export interface Harness {
  lossFraction: number;
  mass_kg: number;
}

/**
 * Two-wire copper DC harness from solar array to payload.
 * Loss fraction = I R / V = P R / V². Doubling the bus voltage quarters the loss:
 * electricity's "transformer" advantage that heat does not have.
 */
export function harness(args: { power_W: number; busVoltage_V: number; oneWayLength_m: number; conductorArea_mm2: number }): Harness {
  const area_m2 = args.conductorArea_mm2 * 1e-6;
  const resistance_ohm = (COPPER.resistivity_ohm_m * 2 * args.oneWayLength_m) / area_m2;
  return {
    lossFraction: (args.power_W * resistance_ohm) / args.busVoltage_V ** 2,
    mass_kg: 2 * args.oneWayLength_m * area_m2 * COPPER.density_kg_m3,
  };
}
