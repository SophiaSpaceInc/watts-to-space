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
  conductorArea_mm2: number;
  mass_kg: number;
}

/**
 * Two-wire copper DC harness from solar array to payload, sized the way a designer
 * would: pick the I²R loss you accept, then size the copper to meet it.
 *     loss fraction f = P R / V²,  R = ρ 2L / A   →   A = ρ 2L P / (V² f)
 *     copper mass = 2L A ρ_Cu  ∝  L² P / (V² f)
 * Voltage therefore trades copper mass, not efficiency: doubling it quarters the copper
 * for the same loss. That is electricity's "transformer" advantage, which heat lacks.
 * (A fixed-gauge model instead shows absurd losses at low voltage.)
 */
export function harness(args: { power_W: number; busVoltage_V: number; oneWayLength_m: number; lossFraction: number }): Harness {
  const area_m2 = (COPPER.resistivity_ohm_m * 2 * args.oneWayLength_m * args.power_W) / (args.busVoltage_V ** 2 * args.lossFraction);
  return {
    lossFraction: args.lossFraction,
    conductorArea_mm2: area_m2 * 1e6,
    mass_kg: 2 * args.oneWayLength_m * area_m2 * COPPER.density_kg_m3,
  };
}

export interface PowerSupply {
  storage: Storage;
  harness: Harness;
  specific_W_m2: number;
  /** Solar array output needed in sunlight. */
  output_W: number;
  area_m2: number;
  solarArrayMass_kg: number;
}

/**
 * The power-supply part of the model, on its own: given the bus load and the sunlight,
 * size the solar array, battery and harness. It needs nothing from the thermal side
 * except the load, which is why the page can plot it separately.
 */
export function sizePowerSupply(load_W: number, p: Power, sun: Sunlight): PowerSupply {
  const storage = storageSizing({ load_W, ...sun, ...p.battery });
  const wire = harness({ power_W: load_W, busVoltage_V: p.busVoltage_V, oneWayLength_m: p.harnessOneWayLength_m, lossFraction: p.harnessLossFraction });
  const specific_W_m2 = solarArraySpecificPower_W_m2(p);
  const output_W = (load_W * storage.solarArrayOversize) / (1 - Math.min(wire.lossFraction, 0.99));
  const area_m2 = output_W / specific_W_m2;
  return { storage, harness: wire, specific_W_m2, output_W, area_m2, solarArrayMass_kg: area_m2 * p.solarArrayArealDensity_kg_m2 };
}
