/**
 * Shared types. A Scenario is plain data: the model reads nothing else.
 * Units are in the field names (_K, _W, _m2, ...); fractions are 0–1.
 */

export type BodyId = 'earth' | 'moon';
export type CoolantId = 'water' | 'ammonia' | 'nak78' | 'twoPhaseAmmonia' | 'passiveHeatPipe';

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
  /** Peak heat load of the installation: what the radiator and pumped loop are sized for. */
  totalPower_W: number;
  /** Average load as a share of peak (0–1]: what the solar array and battery must sustain. */
  averageFraction: number;
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
  /** I²R loss the copper harness is sized for, as a fraction of delivered power. */
  harnessLossFraction: number;
  battery: Battery;
}

/**
 * A distributed "Tile" architecture: flat ~1 m² panels that carry their own compute, with
 * the chip mounted on a passive oscillating-heat-pipe panel that is itself the radiator.
 * There is no pumped loop. Two kinds:
 *   - 'sharedSolar':     Tiles radiate from both faces, edge-on to the Sun, and take power
 *                        from the same central solar array and bus as the pumped cases.
 *   - 'integratedSolar': the sunlit face of each Tile is covered in solar cells; the Tile
 *                        faces the Sun, powers itself and carries its own battery.
 * `radiator.arealDensity_kg_m2` is the heat-pipe panel; `radiator.finEfficiency` its spreading.
 */
export interface Tile {
  kind: 'sharedSolar' | 'integratedSolar';
  /** Planform of one Tile. */
  area_m2: number;
  /** Extra mass per Tile for the networking and enclosures a centralized payload would not need. */
  extraMass_kg: number;
  /** Power converters on the Tiles (bus step-down, or cell regulation), per kW they carry. */
  converterSpecificMass_kg_per_kW: number;
  /** integratedSolar: how long the Tile batteries must hold the peak above the average, hours. */
  peakDuration_h: number;
  /**
   * integratedSolar: 'bonded' ties the whole Tile to one temperature (cells and heat-pipe
   * panel, both faces radiate everything); 'separate' puts a smaller heat-pipe radiator
   * behind the cells, insulated from them, sized for the compute heat alone.
   */
  radiatorCoupling: 'bonded' | 'separate';
  /** integratedSolar: angle between the Sun and the cell face's normal, degrees (0 = face-on). Tilting trades Tiles for temperature. */
  sunAngle_deg: number;
  /** integratedSolar: solar absorptance and infrared emissivity of the cell face. */
  cellAbsorptance: number;
  cellEmissivity: number;
  /** integratedSolar: emissivity of the back of the cell panel where no radiator covers it. */
  cellBackEmissivity: number;
  /** integratedSolar: cells, cover glass, wiring and their substrate, per m² of Tile. */
  cellLayerArealDensity_kg_m2: number;
  /** integratedSolar: fractional change in cell output per kelvin above a free-flying solar array (negative). */
  cellTemperatureCoefficient_per_K: number;
}

export type ModeId = 'iss' | 'starmind' | 'ideal' | 'physics' | 'tileShared' | 'tileSolar';

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
  /** Present only for the distributed Tile architectures. */
  tile?: Tile;
  /** Published figures to check the model against, if any. */
  reported: {
    radiatorArea_m2: number;
    /** Published payload power per ton of whole vehicle; implies a whole-vehicle mass at peak load. */
    vehicleSpecificPower_kW_per_t?: number;
    /** Published net rejection per m² of radiator panel; the check finds the fluid temperature it needs here. */
    radiatorFlux_W_m2?: number;
    /** Published solar array area, for the solar array : radiator area comparison. */
    solarArrayArea_m2?: number;
  } | null;
  /** Provenance note per dot-path (see scenarios.ts for the tags). */
  notes: Record<string, string>;
}
