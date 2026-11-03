/**
 * Whole-system evaluation: one scenario in, every number the page shows out.
 * Pure function with no DOM and no hidden state, so it is easy to test and audit.
 *
 * Energy balance (steady state):
 *   bus load   = payload / η_conversion + payload × (overhead + pumps)
 *   heat to reject by the payload radiator = bus load   (every delivered watt becomes heat)
 *   solar array output in sunlight = bus load × storage oversize / (1 − harness loss)
 * Not counted: harness I²R (dissipated along the wires) and the solar array's own
 * unconverted sunlight (radiated by the solar array itself).
 */
import { COOLANTS } from './constants.ts';
import { absorbedFluxPerFace, sunlight, type Sunlight } from './environment.ts';
import { solarArraySpecificPower_W_m2, harness, storageSizing, type Harness, type Storage } from './power.ts';
import { fluidTemperatureForRejection, idealRejectionPerPanelArea, netRejectionPerPanelArea } from './radiation.ts';
import { evaluateChain, type ChainResult } from './thermalChain.ts';
import type { Scenario } from './types.ts';

export type MassKey = 'radiator' | 'thermalLoop' | 'solarArray' | 'battery' | 'harness';

export interface Warning {
  level: 'error' | 'warn' | 'info';
  text: string;
}

export interface ReportedCheck {
  radiatorArea_m2: number;
  /** Net rejection the reported area must achieve, W/m² of panel (no margin: best case). */
  target_W_m2: number;
  requiredFluid_K: number;
  modelFluid_K: number;
  /** Source limit minus the required fluid temperature: the chain budget the report allows. */
  budgetLeft_K: number;
  modelChainDrop_K: number;
}

export interface Result {
  chain: ChainResult;
  absorbedPerFace_W_m2: number[];
  netFlux_W_m2: number;
  feasible: boolean;
  payload_W: number;
  busLoad_W: number;
  heatToReject_W: number;
  radiatorArea_m2: number;
  solarArraySpecific_W_m2: number;
  solarArrayOutput_W: number;
  solarArrayArea_m2: number;
  solarToRadiatorAreaRatio: number;
  sunlight: Sunlight;
  storage: Storage;
  harness: Harness;
  mass_kg: Record<MassKey, number>;
  totalMass_kg: number;
  specificMass_kg_per_kW: number;
  /** Net rejection relative to a perfect two-sided black panel at the source limit in deep space. */
  rejectionEffectiveness: number;
  reportedCheck: ReportedCheck | null;
  warnings: Warning[];
}

export function evaluateScenario(s: Scenario): Result {
  const chain = evaluateChain(s.heatSource, s.loop, s.radiator.finEfficiency);
  const absorbed = absorbedFluxPerFace(s.environment, s.radiator.orientation, s.radiator);
  const netFlux_W_m2 = netRejectionPerPanelArea(chain.fluidEffective_K, s.radiator, absorbed);
  const feasible = netFlux_W_m2 > 0;

  const p = s.power;
  const payload_W = s.heatSource.totalPower_W;
  const busLoad_W = payload_W / p.conversionEfficiency + payload_W * (p.overheadFraction + p.pumpFraction);
  const heatToReject_W = busLoad_W;

  const radiatorArea_m2 = feasible ? (heatToReject_W * s.radiator.sizingMargin) / netFlux_W_m2 : Infinity;

  const sun = sunlight(s.environment);
  const storage = storageSizing({ load_W: busLoad_W, ...sun, ...p.battery });
  const wire = harness({
    power_W: busLoad_W,
    busVoltage_V: p.busVoltage_V,
    oneWayLength_m: p.harnessOneWayLength_m,
    conductorArea_mm2: p.conductorArea_mm2,
  });
  const solarArraySpecific_W_m2 = solarArraySpecificPower_W_m2(p);
  const solarArrayOutput_W = (busLoad_W * storage.solarArrayOversize) / (1 - Math.min(wire.lossFraction, 0.99));
  const solarArrayArea_m2 = solarArrayOutput_W / solarArraySpecific_W_m2;

  const mass_kg: Record<MassKey, number> = {
    radiator: radiatorArea_m2 * s.radiator.arealDensity_kg_m2,
    thermalLoop: (heatToReject_W / 1000) * s.radiator.loopSpecificMass_kg_per_kW,
    solarArray: solarArrayArea_m2 * p.solarArrayArealDensity_kg_m2,
    battery: storage.mass_kg,
    harness: wire.mass_kg,
  };
  const totalMass_kg = Object.values(mass_kg).reduce((a, b) => a + b, 0);

  return {
    chain,
    absorbedPerFace_W_m2: absorbed,
    netFlux_W_m2,
    feasible,
    payload_W,
    busLoad_W,
    heatToReject_W,
    radiatorArea_m2,
    solarArraySpecific_W_m2,
    solarArrayOutput_W,
    solarArrayArea_m2,
    solarToRadiatorAreaRatio: solarArrayArea_m2 / radiatorArea_m2,
    sunlight: sun,
    storage,
    harness: wire,
    mass_kg,
    totalMass_kg,
    specificMass_kg_per_kW: totalMass_kg / (payload_W / 1000),
    rejectionEffectiveness: netFlux_W_m2 / idealRejectionPerPanelArea(s.heatSource.maxTemperature_K, 2),
    reportedCheck: s.reported ? reportedCheck(s, s.reported.radiatorArea_m2, heatToReject_W, absorbed, chain) : null,
    warnings: warnings(s, chain, feasible, mass_kg, totalMass_kg),
  };
}

/** What a reported radiator area implies: the fluid temperature it would need. */
function reportedCheck(s: Scenario, area_m2: number, heatToReject_W: number, absorbed: number[], chain: ChainResult): ReportedCheck {
  const target_W_m2 = heatToReject_W / area_m2;
  const requiredFluid_K = fluidTemperatureForRejection(target_W_m2, s.radiator, absorbed);
  return {
    radiatorArea_m2: area_m2,
    target_W_m2,
    requiredFluid_K,
    modelFluid_K: chain.fluidEffective_K,
    budgetLeft_K: s.heatSource.maxTemperature_K - requiredFluid_K,
    modelChainDrop_K: s.heatSource.maxTemperature_K - chain.fluidEffective_K,
  };
}

function warnings(s: Scenario, chain: ChainResult, feasible: boolean, mass_kg: Record<MassKey, number>, totalMass_kg: number): Warning[] {
  const out: Warning[] = [];
  const coolant = COOLANTS[s.loop.coolant];
  if (!feasible) {
    out.push({
      level: 'error',
      text: `At ${chain.fluidEffective_K.toFixed(0)} K the environment heats this radiator faster than it radiates. Raise the radiator temperature or change its orientation.`,
    });
  }
  if (chain.radiatorOut_K < coolant.min_K) {
    out.push({
      level: 'error',
      text: `${coolant.name} freezes or leaves its working range below ${coolant.min_K.toFixed(0)} K; radiator outlet is ${chain.radiatorOut_K.toFixed(0)} K.`,
    });
  }
  if (chain.coolantHot_K > coolant.max_K) {
    out.push({
      level: 'error',
      text: `${coolant.name} exceeds its working ceiling of ${coolant.max_K.toFixed(0)} K; loop runs at ${chain.coolantHot_K.toFixed(0)} K. Choose a higher-temperature coolant.`,
    });
  }
  if (chain.capped) {
    out.push({
      level: 'info',
      text: `A heritage coolant setpoint caps the loop at ${chain.coolantHot_K.toFixed(0)} K: ${(s.heatSource.maxTemperature_K - chain.sourceActual_K).toFixed(0)} K of the source's temperature allowance goes unused.`,
    });
  }
  if (Number.isFinite(mass_kg.battery) && mass_kg.battery > 0.3 * totalMass_kg) {
    out.push({
      level: 'warn',
      text: `Energy storage is ${((100 * mass_kg.battery) / totalMass_kg).toFixed(0)} % of power-and-thermal mass: darkness, not heat, dominates this design.`,
    });
  }
  return out;
}
