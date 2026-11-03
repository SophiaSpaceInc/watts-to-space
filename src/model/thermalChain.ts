/**
 * The temperature "staircase" from heat source to radiating surface.
 *
 * Thermal Ohm's law: ΔT = Q · R_th, with R_th in K/W. Temperature plays the role of
 * voltage, heat flow the role of current — but unlike a power bus there is no
 * transformer: the whole chain must fit inside (source limit − radiator temperature),
 * and every kelvin spent shrinks the radiator's T⁴ output.
 *
 * Two levels:
 *   1. Source stages (the "first centimeter"): die, interface materials, lid, cold
 *      plate. They carry the per-unit heat `unitPower_W` (one GPU package, one
 *      process heat exchanger, ...). Resistance-type stages scale with that power.
 *   2. Loop stages: transport, an optional intermediate heat exchanger, and the
 *      coolant's temperature glide across the radiator. Fin efficiency is applied
 *      to the emitted flux, and shown here as an equivalent temperature drop.
 */
import { finEquivalentTemperature, t4MeanTemperature } from './thermalEmission.ts';
import type { HeatSource, Loop, Stage } from './types.ts';

/** Thermal resistance of a stage in K/W, or null for fixed-ΔT stages. */
export function stageResistance(stage: Stage): number | null {
  const f = stage.factor ?? 1;
  switch (stage.kind) {
    case 'conduction':
      return (f * stage.thickness_m) / (stage.conductivity_W_mK * stage.area_m2);
    case 'interface':
      return (f * stage.arealResistance_Km2_W) / stage.area_m2;
    case 'convection':
      return f / (stage.h_W_m2K * stage.area_m2);
    case 'resistance':
      return f * stage.resistance_K_W;
    case 'deltaT':
      return null;
  }
}

/** Temperature drop across a stage carrying `power_W`. */
export function stageDeltaT(stage: Stage, power_W: number): number {
  if (stage.kind === 'deltaT') return stage.deltaT_K;
  return power_W * (stageResistance(stage) ?? 0);
}

export interface Step {
  /** Position from the heat source, m (for the distance plot). */
  x_m: number;
  T_K: number;
  label: string;
}

export interface ChainResult {
  sourceStages: (Stage & { deltaT_K: number })[];
  stackDrop_K: number;
  /** True when a heritage coolant setpoint, not the source limit, sets the loop temperature. */
  capped: boolean;
  /** Hottest source temperature actually reached (below the limit when capped). */
  sourceActual_K: number;
  coolantHot_K: number;
  radiatorIn_K: number;
  radiatorOut_K: number;
  fluidEffective_K: number;
  radiatingEquivalent_K: number;
  totalDrop_K: number;
  steps: Step[];
}

/**
 * Walk the chain from the source limit down to the radiator.
 * The hottest coolant (source outlet) is the conservative reference for the stack:
 * the hottest die sits nearest the outlet.
 */
export function evaluateChain(source: HeatSource, loop: Loop, finEfficiency: number): ChainResult {
  const sourceStages = source.stages.map((s) => ({ ...s, deltaT_K: stageDeltaT(s, source.unitPower_W) }));
  const stackDrop = sourceStages.reduce((sum, s) => sum + s.deltaT_K, 0);

  let coolantHot_K = source.maxTemperature_K - stackDrop;
  const capped = loop.coolantCap_K !== null && loop.coolantCap_K < coolantHot_K;
  if (loop.coolantCap_K !== null && capped) coolantHot_K = loop.coolantCap_K;
  const sourceActual_K = coolantHot_K + stackDrop;

  const radiatorIn_K = coolantHot_K - loop.transportDrop_K - loop.hxApproach_K;
  const radiatorOut_K = radiatorIn_K - loop.rise_K;
  const fluidEffective_K = t4MeanTemperature(radiatorIn_K, radiatorOut_K);
  const radiatingEquivalent_K = finEquivalentTemperature(fluidEffective_K, finEfficiency);

  // Staircase for plotting.
  const steps: Step[] = [{ x_m: 0, T_K: sourceActual_K, label: 'Heat source' }];
  let x = 0;
  let T = sourceActual_K;
  for (const s of sourceStages) {
    x += s.lengthScale_m;
    T -= s.deltaT_K;
    steps.push({ x_m: x, T_K: T, label: s.label });
  }
  const push = (dx: number, T_K: number, label: string) => {
    x += dx;
    steps.push({ x_m: x, T_K, label });
  };
  push(loop.transportLength_m, coolantHot_K - loop.transportDrop_K, 'Pumped transport');
  if (loop.hxApproach_K > 0) push(0.2, radiatorIn_K, 'Intermediate heat exchanger');
  push(2, fluidEffective_K, 'Coolant glide across radiator (T⁴-mean)');
  push(0.1, radiatingEquivalent_K, 'Tube-to-fin (fin efficiency)');

  return {
    sourceStages,
    stackDrop_K: stackDrop,
    capped,
    sourceActual_K,
    coolantHot_K,
    radiatorIn_K,
    radiatorOut_K,
    fluidEffective_K,
    radiatingEquivalent_K,
    totalDrop_K: sourceActual_K - radiatingEquivalent_K,
    steps,
  };
}
