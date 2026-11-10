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
import { sizePowerSupply, type Harness, type Storage } from './power.ts';
import { fluidTemperatureForRejection, idealRejectionPerPanelArea, netRejectionPerPanelArea } from './thermalEmission.ts';
import { evaluateChain, type ChainResult } from './thermalChain.ts';
import { sharedSolarTiles, sizeIntegratedTiles, type TileSummary } from './tile.ts';
import type { Scenario } from './types.ts';

/** 'powerConversion' and 'tileOverhead' are zero except for the Tile architectures (tile.ts). */
export type MassKey = 'radiator' | 'thermalLoop' | 'solarArray' | 'battery' | 'harness' | 'powerConversion' | 'tileOverhead';

export interface Warning {
  level: 'error' | 'warn' | 'info';
  text: string;
}

export interface ReportedCheck {
  radiatorArea_m2: number;
  /** Net rejection the reported area must achieve at PEAK heat, W/m² of panel (no margin: best case). */
  target_W_m2: number;
  requiredFluid_K: number;
  /** The same at AVERAGE heat: the reported area works at this fluid temperature if thermal mass rides through peaks. */
  targetAverage_W_m2: number;
  requiredFluidAverage_K: number;
  modelFluid_K: number;
  /** Source limit minus the required fluid temperature: the chain budget the report allows. */
  budgetLeft_K: number;
  modelChainDrop_K: number;
  /** Whole-vehicle mass implied by a published kW-per-ton figure at peak payload, if given. */
  vehicleMass_kg: number | null;
  /** This model's power-and-thermal mass as a share of that vehicle mass. */
  powerThermalShareOfVehicle: number | null;
  /** The published radiator flux, if given, and the fluid temperature it needs under this case's radiator assumptions. */
  statedFlux_W_m2: number | null;
  statedFluxFluid_K: number | null;
  /** Published solar array area : published radiator area, if both are given. */
  publishedAreaRatio: number | null;
}

export interface Result {
  chain: ChainResult;
  absorbedPerFace_W_m2: number[];
  netFlux_W_m2: number;
  feasible: boolean;
  /** Peak payload power; the radiator is sized for this. */
  payload_W: number;
  payloadAverage_W: number;
  /** Peak bus load (payload, conversion losses, overhead, pumps). */
  busLoad_W: number;
  /** Average bus load; the solar array and battery are sized for this. */
  busLoadAverage_W: number;
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
  /** Figure of merit for the thermal side: heat rejected per kg of radiator and pumped loop, W/kg. */
  thermalRejection_W_per_kg: number;
  /** Net rejection relative to a perfect two-sided black panel at the source limit in deep space. */
  rejectionEffectiveness: number;
  reportedCheck: ReportedCheck | null;
  /** Tile count, per-Tile power and temperatures; null unless the scenario is a Tile architecture. */
  tile: TileSummary | null;
  warnings: Warning[];
}

/**
 * The model is three nearly independent parts joined by three quantities (see
 * assets/system-diagram.svg): heat path → coolant temperature; radiator × location →
 * flux per m²; power supply × location → solar array and battery. The heat load Q
 * couples the radiator and the power supply.
 */
export function evaluateScenario(s: Scenario): Result {
  if (s.tile?.kind === 'integratedSolar') return evaluateIntegratedTiles(s);
  // Heat-path part: its only output is the coolant temperature reaching the radiator.
  const chain = evaluateChain(s.heatSource, s.loop, s.radiator.finEfficiency);
  // Radiator part: net flux per m² at that temperature, given what the radiator sees.
  const absorbed = absorbedFluxPerFace(s.environment, s.radiator.orientation, s.radiator);
  const netFlux_W_m2 = netRejectionPerPanelArea(chain.fluidEffective_K, s.radiator, absorbed);
  const feasible = netFlux_W_m2 > 0;

  // Peak and average load. The radiator and pumped loop are sized for the peak (no thermal
  // storage is modelled, so peaks are not ridden through); the solar array and battery
  // for the average over each light/dark cycle; the harness for the peak current.
  const p = s.power;
  const bus = (payload: number) => payload / p.conversionEfficiency + payload * (p.overheadFraction + p.pumpFraction);
  const payload_W = s.heatSource.totalPower_W;
  const payloadAverage_W = payload_W * s.heatSource.averageFraction;
  const busLoad_W = bus(payload_W);
  const busLoadAverage_W = bus(payloadAverage_W);
  const heatToReject_W = busLoad_W;

  const radiatorArea_m2 = feasible ? (heatToReject_W * s.radiator.sizingMargin) / netFlux_W_m2 : Infinity;

  // Power-supply part: needs only the load and the sunlight.
  const sun = sunlight(s.environment);
  const supply = sizePowerSupply(busLoadAverage_W, p, sun, busLoad_W);
  const { storage, harness: wire } = supply;
  const solarArraySpecific_W_m2 = supply.specific_W_m2;
  const solarArrayOutput_W = supply.output_W;
  const solarArrayArea_m2 = supply.area_m2;

  const mass_kg: Record<MassKey, number> = {
    radiator: radiatorArea_m2 * s.radiator.arealDensity_kg_m2,
    thermalLoop: (heatToReject_W / 1000) * s.radiator.loopSpecificMass_kg_per_kW,
    solarArray: supply.solarArrayMass_kg,
    battery: storage.mass_kg,
    harness: wire.mass_kg,
    powerConversion: s.tile ? (busLoad_W / 1000) * s.tile.converterSpecificMass_kg_per_kW : 0,
    tileOverhead: 0,
  };
  const tile = s.tile ? sharedSolarTiles(s, radiatorArea_m2, heatToReject_W, chain) : null;
  if (tile && s.tile && Number.isFinite(tile.count)) mass_kg.tileOverhead = tile.count * s.tile.extraMass_kg;
  const totalMass_kg = Object.values(mass_kg).reduce((a, b) => a + b, 0);

  return {
    chain,
    absorbedPerFace_W_m2: absorbed,
    netFlux_W_m2,
    feasible,
    payload_W,
    payloadAverage_W,
    busLoad_W,
    busLoadAverage_W,
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
    thermalRejection_W_per_kg: heatToReject_W / (mass_kg.radiator + mass_kg.thermalLoop),
    rejectionEffectiveness: netFlux_W_m2 / idealRejectionPerPanelArea(s.heatSource.maxTemperature_K, 2),
    reportedCheck: s.reported ? reportedCheck(s, s.reported.radiatorArea_m2, heatToReject_W, bus(payloadAverage_W), absorbed, chain, totalMass_kg) : null,
    tile,
    warnings: warnings(s, chain, feasible, mass_kg, totalMass_kg),
  };
}

/**
 * Tiles with solar cells on their sunlit face (tile.ts). The solar array area and the
 * Tile area are one number, there is no harness from a central solar array, and the
 * radiator rides behind the cells. Same loads, same outputs as the main path.
 */
function evaluateIntegratedTiles(s: Scenario): Result {
  const p = s.power;
  const t = s.tile!;
  const bus = (payload: number) => payload / p.conversionEfficiency + payload * (p.overheadFraction + p.pumpFraction);
  const payload_W = s.heatSource.totalPower_W;
  const payloadAverage_W = payload_W * s.heatSource.averageFraction;
  const busLoad_W = bus(payload_W);
  const busLoadAverage_W = bus(payloadAverage_W);
  const sun = sunlight(s.environment);
  const z = sizeIntegratedTiles(s, busLoad_W, busLoadAverage_W, sun);

  const mass_kg: Record<MassKey, number> = {
    radiator: z.radiatorArea_m2 * s.radiator.arealDensity_kg_m2,
    thermalLoop: (busLoad_W / 1000) * s.radiator.loopSpecificMass_kg_per_kW,
    solarArray: z.tileArea_m2 * t.cellLayerArealDensity_kg_m2,
    battery: z.storage.mass_kg + z.summary.peakBatteryMass_kg,
    harness: 0,
    powerConversion: (busLoad_W / 1000) * t.converterSpecificMass_kg_per_kW,
    tileOverhead: z.summary.count * t.extraMass_kg,
  };
  const totalMass_kg = Object.values(mass_kg).reduce((a, b) => a + b, 0);
  const out = warnings(s, z.chain, true, mass_kg, totalMass_kg);
  if (z.problem) out.unshift({ level: 'error', text: z.problem });
  if (s.environment.kind === 'orbit' && Math.abs(s.environment.beta_deg) < 60) {
    out.push({ level: 'warn', text: 'A Sun-facing Tile is modelled with both faces edge-on to the body, which holds near the terminator (β above about 60°). At this β one face would look at the body for part of each orbit.' });
  }
  return {
    chain: z.chain,
    absorbedPerFace_W_m2: z.absorbedPerFace_W_m2,
    netFlux_W_m2: z.netFlux_W_m2,
    feasible: z.feasible,
    payload_W,
    payloadAverage_W,
    busLoad_W,
    busLoadAverage_W,
    heatToReject_W: busLoad_W,
    radiatorArea_m2: z.radiatorArea_m2,
    solarArraySpecific_W_m2: z.solarSpecific_W_m2,
    solarArrayOutput_W: z.tileArea_m2 * z.solarSpecific_W_m2,
    solarArrayArea_m2: z.tileArea_m2,
    solarToRadiatorAreaRatio: z.tileArea_m2 / z.radiatorArea_m2,
    sunlight: sun,
    storage: z.storage,
    harness: { lossFraction: 0, conductorArea_mm2: 0, mass_kg: 0 },
    mass_kg,
    totalMass_kg,
    specificMass_kg_per_kW: totalMass_kg / (payload_W / 1000),
    thermalRejection_W_per_kg: busLoad_W / (mass_kg.radiator + mass_kg.thermalLoop),
    rejectionEffectiveness: z.netFlux_W_m2 / idealRejectionPerPanelArea(s.heatSource.maxTemperature_K, 2),
    reportedCheck: null,
    tile: z.summary,
    warnings: out,
  };
}

/** What a reported radiator area implies: the fluid temperature it would need. */
function reportedCheck(s: Scenario, area_m2: number, heatToReject_W: number, averageHeat_W: number, absorbed: number[], chain: ChainResult, totalMass_kg: number): ReportedCheck {
  const kWt = s.reported?.vehicleSpecificPower_kW_per_t;
  const vehicleMass_kg = kWt ? (s.heatSource.totalPower_W / 1000 / kWt) * 1000 : null;
  const target_W_m2 = heatToReject_W / area_m2;
  const requiredFluid_K = fluidTemperatureForRejection(target_W_m2, s.radiator, absorbed);
  const targetAverage_W_m2 = averageHeat_W / area_m2;
  return {
    radiatorArea_m2: area_m2,
    target_W_m2,
    requiredFluid_K,
    targetAverage_W_m2,
    requiredFluidAverage_K: fluidTemperatureForRejection(targetAverage_W_m2, s.radiator, absorbed),
    modelFluid_K: chain.fluidEffective_K,
    budgetLeft_K: s.heatSource.maxTemperature_K - requiredFluid_K,
    modelChainDrop_K: s.heatSource.maxTemperature_K - chain.fluidEffective_K,
    vehicleMass_kg,
    powerThermalShareOfVehicle: vehicleMass_kg ? totalMass_kg / vehicleMass_kg : null,
    statedFlux_W_m2: s.reported?.radiatorFlux_W_m2 ?? null,
    statedFluxFluid_K: s.reported?.radiatorFlux_W_m2 ? fluidTemperatureForRejection(s.reported.radiatorFlux_W_m2, s.radiator, absorbed) : null,
    publishedAreaRatio: s.reported?.solarArrayArea_m2 ? s.reported.solarArrayArea_m2 / area_m2 : null,
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
