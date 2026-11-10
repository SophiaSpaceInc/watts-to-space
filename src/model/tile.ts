/**
 * Distributed "Tile" architectures (see `Tile` in types.ts).
 *
 * A Tile is a flat panel of about 1 m² that carries its own compute. The chip sits on a
 * passive oscillating-heat-pipe panel, and that panel is the radiator: there is no pumped
 * loop, so no pumps, no transport lines and no pump power.
 *
 * 'sharedSolar' Tiles need no physics of their own. They are a two-sided radiator held
 * edge-on to the Sun, fed by the central solar array; system.ts sizes them with the same
 * equations as a pumped radiator and this file only counts the Tiles and their extras.
 *
 * 'integratedSolar' Tiles are different: the sunlit face is solar cells, so the solar
 * array area and the Tile area are one number, and the sunlight the cells do not convert
 * is heat the Tile itself must radiate. Per m² of Tile, facing the Sun:
 *
 *     absorbed sunlight          α_cell S              (× cos of the Sun angle, as is e)
 *     electricity taken out      e = S η_cell × packing × operating factor × derate(T_cell)
 *     heat left in the cells     α_cell S − e
 *     heat from the electronics  q = e / (storage oversize × average fraction)   at peak
 *
 * Every watt of electricity ends as heat on the same Tile (conversion losses, overhead
 * and compute alike), so q is the bus load per m². The cells are sized for the average
 * load; the peak above it comes from the Tile's battery, and the radiator is sized for
 * that peak, as in the rest of the model.
 *
 * Two ways to close the balance (`radiatorCoupling`):
 *   'bonded'    one temperature T for the whole Tile; both faces radiate everything:
 *                 (ε_cell + η ε_rad / margin) σ T⁴ = α_cell S − e + q + absorbed from the body
 *               The chip must then sit above T by its stack drop, within its limit.
 *   'separate'  a heat-pipe radiator of area A_r < 1 behind the cells, insulated from
 *               them, at the temperature the chip's stack allows (the usual staircase):
 *                 A_r = q × margin / (η ε_rad σ T_r⁴ − absorbed)
 *               The cells radiate their own heat from the front and from the uncovered
 *               part (1 − A_r) of their back.
 *
 * Geometry: a Sun-facing Tile in a dawn-dusk orbit has both faces edge-on to the body,
 * so each face uses the 'edgeOn' view factor. That is only right near the terminator
 * (large β) or far from any body.
 */
import { SIGMA, SOLAR_CONSTANT_W_M2, T_CMB_K } from './constants.ts';
import { absorbedFluxPerFace, type Sunlight } from './environment.ts';
import { solarArraySpecificPower_W_m2, storageSizing, type Storage } from './power.ts';
import { netRejectionPerPanelArea } from './thermalEmission.ts';
import { evaluateChain, type ChainResult } from './thermalChain.ts';
import type { Scenario } from './types.ts';

export interface TileSummary {
  /** Number of Tiles (not rounded, so sweeps stay smooth). */
  count: number;
  /** Compute (payload) power per Tile at peak. */
  payloadPeak_W: number;
  /** Heat one Tile's radiator rejects at peak (compute, conversion losses, overhead). */
  heatPeak_W: number;
  /** Heat sources (for example Thor modules) per Tile at peak: payload per Tile / unit power. */
  unitsPerTile: number;
  /** Heat-pipe radiator planform on one Tile, m². */
  radiatorAreaPerTile_m2: number;
  /** Radiating temperature of the heat-pipe panel. */
  radiator_K: number;
  /** Hottest chip temperature reached. */
  junction_K: number;
  /** integratedSolar only: cell temperature, the free-flying solar array it is compared with, and the output derate. */
  cell_K: number | null;
  freeSolarArray_K: number | null;
  cellDerate: number | null;
  /** integratedSolar only: battery for peaks above the average (the eclipse battery is in `storage`). */
  peakBatteryMass_kg: number;
}

/** Networking on every Tile plus an enclosure allowance for every heat source (compute module). */
export function tileOverheadMass_kg(s: Scenario, tileCount: number): number {
  const tile = s.tile!;
  const units = s.heatSource.totalPower_W / s.heatSource.unitPower_W;
  return tileCount * tile.networkingMass_kg + units * tile.extraMassPerUnit_kg;
}

/** Count the Tiles of a 'sharedSolar' design from the radiator area the main model sized. */
export function sharedSolarTiles(s: Scenario, radiatorArea_m2: number, heatToReject_W: number, chain: ChainResult): TileSummary {
  const tile = s.tile!;
  const count = radiatorArea_m2 / tile.area_m2;
  const payloadPeak_W = s.heatSource.totalPower_W / count;
  return {
    count,
    payloadPeak_W,
    heatPeak_W: heatToReject_W / count,
    unitsPerTile: payloadPeak_W / s.heatSource.unitPower_W,
    radiatorAreaPerTile_m2: tile.area_m2,
    radiator_K: chain.fluidEffective_K,
    junction_K: chain.sourceActual_K,
    cell_K: null,
    freeSolarArray_K: null,
    cellDerate: null,
    peakBatteryMass_kg: 0,
  };
}

export interface IntegratedTileSizing {
  feasible: boolean;
  /** Why not, when infeasible. */
  problem: string | null;
  chain: ChainResult;
  /** Total Tile area = solar cell area, m². */
  tileArea_m2: number;
  /** Total heat-pipe radiator planform, m². */
  radiatorArea_m2: number;
  /** Net rejection per m² of heat-pipe radiator. */
  netFlux_W_m2: number;
  absorbedPerFace_W_m2: number[];
  /** Electrical output per m² of cells in sunlight, after the temperature derate. */
  solarSpecific_W_m2: number;
  storage: Storage;
  summary: TileSummary;
}

/** Temperature at which a surface set with total emissivity `emissivitySum` sheds `heat_W_m2`. */
function balanceTemperature(heat_W_m2: number, emissivitySum: number): number {
  return (Math.max(0, heat_W_m2) / (emissivitySum * SIGMA) + T_CMB_K ** 4) ** 0.25;
}

/**
 * Size a field of 'integratedSolar' Tiles for a peak and an average bus load.
 * `busLoadAverage_W` sets the cell (so Tile) area; `busLoad_W` (peak) sets the radiator.
 */
export function sizeIntegratedTiles(s: Scenario, busLoad_W: number, busLoadAverage_W: number, sun: Sunlight): IntegratedTileSizing {
  const tile = s.tile!;
  const rad = s.radiator;
  const cellFace = { emissivity: tile.cellEmissivity, solarAbsorptance: tile.cellAbsorptance };
  const cellBack = { emissivity: tile.cellBackEmissivity, solarAbsorptance: rad.solarAbsorptance };
  // Sun-facing in a terminator orbit: both faces are edge-on to the body.
  const absFront = absorbedFluxPerFace(s.environment, 'edgeOn', cellFace)[0] ?? 0;
  const absCellBack = absorbedFluxPerFace(s.environment, 'edgeOn', cellBack)[0] ?? 0;
  const absRadiator = absorbedFluxPerFace(s.environment, 'edgeOn', rad)[0] ?? 0;

  // The same cells on a free-flying solar array, face-on to the Sun and radiating from
  // both faces: the temperature the operating factor is taken to describe.
  const faceOn = solarArraySpecificPower_W_m2(s.power);
  const freeSolarArray_K = balanceTemperature(tile.cellAbsorptance * SOLAR_CONSTANT_W_M2 - faceOn + absFront + absCellBack, tile.cellEmissivity + tile.cellBackEmissivity);
  // Tilted away from the Sun, the Tile intercepts less sunlight: less power and less heat per m².
  const cosSun = Math.max(0, Math.cos((tile.sunAngle_deg * Math.PI) / 180));
  const sunHeat = tile.cellAbsorptance * SOLAR_CONSTANT_W_M2 * cosSun;
  const e0 = faceOn * cosSun;

  const storage = storageSizing({ load_W: busLoadAverage_W, ...sun, ...s.power.battery });
  const peakOverAverage = busLoad_W / busLoadAverage_W;

  // The chip's staircase with no setpoint: the hottest the heat-pipe panel may run.
  const freeChain = evaluateChain(s.heatSource, { ...s.loop, coolantCap_K: null }, rad.finEfficiency);
  const chainDrop_K = freeChain.sourceActual_K - freeChain.fluidEffective_K;

  let derate = 1;
  let cell_K = freeSolarArray_K;
  let radiator_K = freeChain.fluidEffective_K;
  let areaFraction = 1;
  let netFlux = 0;
  let e = e0;
  // Fixed point: cell temperature sets cell output, which sets the heat, which sets the temperature.
  for (let i = 0; i < 60; i++) {
    e = e0 * derate;
    const q = (e / storage.solarArrayOversize) * peakOverAverage;
    if (tile.radiatorCoupling === 'bonded') {
      const emissivitySum = tile.cellEmissivity + (rad.finEfficiency * rad.emissivity) / rad.sizingMargin;
      const T = balanceTemperature(sunHeat - e + q + absFront + absRadiator, emissivitySum);
      cell_K = T;
      radiator_K = T;
      areaFraction = 1;
      netFlux = q;
    } else {
      netFlux = netRejectionPerPanelArea(radiator_K, rad, [absRadiator]);
      areaFraction = netFlux > 0 ? (q * rad.sizingMargin) / netFlux : Infinity;
      const open = Math.max(0, 1 - Math.min(areaFraction, 1));
      cell_K = balanceTemperature(sunHeat - e + absFront + open * absCellBack, tile.cellEmissivity + open * tile.cellBackEmissivity);
    }
    const next = Math.max(0, 1 + tile.cellTemperatureCoefficient_per_K * (cell_K - freeSolarArray_K));
    if (Math.abs(next - derate) < 1e-12) break;
    derate = 0.5 * (derate + next);
  }

  const junction_K = radiator_K + chainDrop_K;
  let problem: string | null = null;
  if (e <= 0) problem = 'The cells are too hot to produce power.';
  else if (tile.radiatorCoupling === 'bonded' && junction_K > s.heatSource.maxTemperature_K + 1e-9)
    problem = `A bonded Tile settles at ${radiator_K.toFixed(0)} K, and the heat source would sit ${chainDrop_K.toFixed(0)} K above it: over its ${s.heatSource.maxTemperature_K.toFixed(0)} K limit. Use a separate radiator, a shorter heat path, or fewer watts per unit.`;
  else if (!(areaFraction <= 1 + 1e-9))
    problem = `The radiator needed behind each Tile (${Number.isFinite(areaFraction) ? areaFraction.toFixed(2) : '∞'} m² per m²) is larger than the Tile.`;
  const feasible = problem === null;

  const tileArea_m2 = feasible ? (busLoadAverage_W * storage.solarArrayOversize) / e : Infinity;
  const count = tileArea_m2 / tile.area_m2;
  const payloadPeak_W = s.heatSource.totalPower_W / count;
  const peakEnergy_Wh = ((busLoad_W - busLoadAverage_W) * tile.peakDuration_h) / s.power.battery.depthOfDischarge;

  // For the staircase plot: pin the loop at the bonded Tile's temperature when it is the colder one.
  const chain = tile.radiatorCoupling === 'bonded' && feasible ? evaluateChain(s.heatSource, { ...s.loop, coolantCap_K: radiator_K }, rad.finEfficiency) : freeChain;

  return {
    feasible,
    problem,
    chain,
    tileArea_m2,
    radiatorArea_m2: tileArea_m2 * areaFraction,
    netFlux_W_m2: netFlux,
    absorbedPerFace_W_m2: [absRadiator],
    solarSpecific_W_m2: e,
    storage,
    summary: {
      count,
      payloadPeak_W,
      heatPeak_W: busLoad_W / count,
      unitsPerTile: payloadPeak_W / s.heatSource.unitPower_W,
      radiatorAreaPerTile_m2: areaFraction * tile.area_m2,
      radiator_K,
      junction_K,
      cell_K,
      freeSolarArray_K,
      cellDerate: derate,
      peakBatteryMass_kg: peakEnergy_Wh / s.power.battery.specificEnergy_Wh_kg,
    },
  };
}
