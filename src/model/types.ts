/**
 * Shared types. A Scenario is plain data: the model reads nothing else.
 * Units are in the field names (_K, _W, _m2, ...); fractions are 0–1.
 */

export type BodyId = 'earth' | 'moon';
export type CoolantId = 'water' | 'ammonia' | 'nak78' | 'twoPhaseAmmonia';

/** Radiator orientation; the same three words apply in every environment (see environment.ts). */
export type Orientation = 'edgeOn' | 'nadirZenith' | 'zenithOnly';

export interface OrbitEnv {
  kind: 'orbit';
  body: BodyId;
  altitude_km: number;
  beta_deg: number;
}
export interface DeepSpaceEnv {
  kind: 'deepSpace';
  sunlitFraction: number;
  cyclePeriod_h: number;
}
export interface SurfaceEnv {
  kind: 'surface';
  body: 'moon';
  groundTemperature_K: number;
  groundEmissivity: number;
  groundAlbedo: number;
  sunElevation_deg: number;
  sunlitFraction: number;
  cyclePeriod_h: number;
}
export type Environment = OrbitEnv | DeepSpaceEnv | SurfaceEnv;

interface StageBase {
  id: string;
  label: string;
  /** Physical thickness/extent, used only for the distance plot. */
  lengthScale_m: number;
  /** Multiplier on R (e.g. hot-spot peaking). Default 1. */
  factor?: number;
}
/** Slab conduction: R = t / (k A). */
export interface ConductionStage extends StageBase {
  kind: 'conduction';
  thickness_m: number;
  conductivity_W_mK: number;
  area_m2: number;
}
/** Interface material: R = R'' / A. Datasheets quote K·cm²/W; 1 K·cm²/W = 1e-4 K·m²/W. */
export interface InterfaceStage extends StageBase {
  kind: 'interface';
  arealResistance_Km2_W: number;
  area_m2: number;
}
/** Convection into coolant: R = 1 / (h A). */
export interface ConvectionStage extends StageBase {
  kind: 'convection';
  h_W_m2K: number;
  area_m2: number;
}
/** Lumped vendor-style resistance. */
export interface ResistanceStage extends StageBase {
  kind: 'resistance';
  resistance_K_W: number;
}
/** Fixed temperature drop (e.g. a process heat-exchanger approach). */
export interface DeltaTStage extends StageBase {
  kind: 'deltaT';
  deltaT_K: number;
}
export type Stage = ConductionStage | InterfaceStage | ConvectionStage | ResistanceStage | DeltaTStage;

export interface HeatSource {
  name: string;
  /** Hottest point allowed: junction limit, process limit. */
  maxTemperature_K: number;
  /** Heat through ONE stack of `stages` (e.g. one GPU package). */
  unitPower_W: number;
  /** Total heat load of the installation. */
  totalPower_W: number;
  stages: Stage[];
}

export interface Loop {
  coolant: CoolantId;
  /** Loss along insulated transport lines (small). */
  transportDrop_K: number;
  /** For the distance plot only. */
  transportLength_m: number;
  /** Intermediate heat exchanger approach; 0 for a single loop. */
  hxApproach_K: number;
  /** Coolant rise across the sources = glide across the radiator; 0 if two-phase. */
  rise_K: number;
  /** Heritage setpoint: coolant leaving the sources may not exceed this. */
  coolantCap_K: number | null;
}

export interface RadiatorSurface {
  emissivity: number;
  solarAbsorptance: number;
  finEfficiency: number;
}
export interface Radiator extends RadiatorSurface {
  orientation: Orientation;
  /** Mass per m² of panel planform, including structure and fluid. */
  arealDensity_kg_m2: number;
  /** Area multiplier over the nominal model (hot case, degradation, reserve). */
  sizingMargin: number;
  /** Pumps, accumulators, rotary joints. */
  loopSpecificMass_kg_per_kW: number;
}

export interface Battery {
  roundTripEfficiency: number;
  depthOfDischarge: number;
  specificEnergy_Wh_kg: number;
}
export interface Power {
  cellEfficiency: number;
  packingFactor: number;
  /** Lumps cell temperature, mismatch, wiring and end-of-life degradation. */
  operatingFactor: number;
  solarArrayArealDensity_kg_m2: number;
  /** Bus to payload power conversion. */
  conversionEfficiency: number;
  /** Avionics, comms, attitude control, as a fraction of payload. */
  overheadFraction: number;
  pumpFraction: number;
  busVoltage_V: number;
  harnessOneWayLength_m: number;
  conductorArea_mm2: number;
  battery: Battery;
}

export type ModeId = 'iss' | 'starmind' | 'ideal' | 'physics';

export interface Scenario {
  mode: ModeId;
  name: string;
  summary: string;
  heatSourceId: string;
  environmentId: string;
  heatSource: HeatSource;
  environment: Environment;
  loop: Loop;
  radiator: Radiator;
  power: Power;
  /** A published radiator area to check against, if any. */
  reported: { radiatorArea_m2: number } | null;
  /** Provenance note per dot-path (see scenarios.ts for the tags). */
  notes: Record<string, string>;
}
