/**
 * Distributed Tile architectures (src/model/tile.ts): energy balances checked by hand
 * and against the main radiator path.
 */
import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { SIGMA, SOLAR_CONSTANT_W_M2 } from '../src/model/constants.ts';
import { absorbedFluxPerFace } from '../src/model/environment.ts';
import { buildScenario } from '../src/model/scenarios.ts';
import { withPath } from '../src/model/sensitivity.ts';
import { evaluateScenario } from '../src/model/system.ts';

const near = (a: number, b: number, rel = 1e-6) => assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${a} vs ${b}`);

test('shared-solar Tiles: the radiator is the Tile field, with no pumped-loop mass or pump power', () => {
  const s = buildScenario('tileShared');
  const r = evaluateScenario(s);
  assert.ok(r.feasible);
  assert.equal(r.mass_kg.thermalLoop, 0);
  near(r.tile!.count * s.tile!.area_m2, r.radiatorArea_m2);
  // By default: 1 kg of networking per Tile, no per-module penalty, structure inside the panel density.
  near(r.mass_kg.tileOverhead, r.tile!.count * 1);
  assert.equal(r.mass_kg.tileStructure, 0);
  // Both optional penalties: 0.5 kg per Thor module, and 15 % structure on what the Tiles carry.
  const p = evaluateScenario(withPath(withPath(s, 'tile.extraMassPerUnit_kg', 0.5), 'tile.supportStructureFraction', 0.15));
  near(p.mass_kg.tileOverhead, p.tile!.count * 1 + (250e3 / 130) * 0.5);
  near(p.mass_kg.tileStructure, 0.15 * (p.mass_kg.radiator + p.mass_kg.powerConversion + p.mass_kg.tileOverhead));
  near(r.mass_kg.powerConversion, r.busLoad_W / 1000);
  // Per-Tile heat is the net flux divided by the sizing margin.
  near(r.tile!.heatPeak_W, r.netFlux_W_m2 / s.radiator.sizingMargin);
  // The Thor stack reaches its 100 °C limit and no more.
  near(r.tile!.junction_K, 373.15);
});

test('shared-solar Tiles: harness copper scales as 1/V²', () => {
  const s = buildScenario('tileShared');
  const at = (V: number) => evaluateScenario(withPath(s, 'power.busVoltage_V', V)).mass_kg.harness;
  near(at(28) / at(400), (400 / 28) ** 2);
});

test('integrated-solar Tiles: the separate radiator closes the energy balance by hand', () => {
  const s = buildScenario('tileSolar');
  const r = evaluateScenario(s);
  const t = r.tile!;
  assert.ok(r.feasible);
  // Cells are sized for the average bus load; no harness, no central solar array.
  near(r.solarArrayArea_m2 * r.solarArraySpecific_W_m2, r.busLoadAverage_W);
  assert.equal(r.mass_kg.harness, 0);
  near(t.count, r.solarArrayArea_m2);
  // Radiator: peak heat per m² of Tile × margin = area fraction × one-face net flux.
  const abs = absorbedFluxPerFace(s.environment, 'edgeOn', s.radiator)[0]!;
  const flux = s.radiator.finEfficiency * s.radiator.emissivity * SIGMA * t.radiator_K ** 4 - abs;
  near(r.netFlux_W_m2, flux, 1e-6);
  near(t.radiatorAreaPerTile_m2, ((r.busLoad_W / t.count) * s.radiator.sizingMargin) / flux, 1e-6);
  assert.ok(t.radiatorAreaPerTile_m2 < 1);
  // Cells: absorbed sunlight less electricity leaves by the front and the uncovered back.
  const open = 1 - t.radiatorAreaPerTile_m2;
  const absFront = absorbedFluxPerFace(s.environment, 'edgeOn', { emissivity: 0.85, solarAbsorptance: 0.9 })[0]!;
  const absBack = absorbedFluxPerFace(s.environment, 'edgeOn', { emissivity: 0.85, solarAbsorptance: 0.2 })[0]!;
  const heat = 0.9 * SOLAR_CONSTANT_W_M2 - r.solarArraySpecific_W_m2 + absFront + open * absBack;
  near((0.85 + open * 0.85) * SIGMA * t.cell_K! ** 4, heat, 1e-5);
  // Hotter than a free-flying solar array, so derated.
  assert.ok(t.cell_K! > t.freeSolarArray_K! && t.cellDerate! < 1);
});

test('integrated-solar Tiles: bonded Tile sits at one temperature set by sunlight plus compute', () => {
  const s = withPath(withPath(buildScenario('tileSolar'), 'tile.radiatorCoupling', 'bonded'), 'tile.cellTemperatureCoefficient_per_K', 0);
  const r = evaluateScenario(s);
  const t = r.tile!;
  const e = r.solarArraySpecific_W_m2;
  const q = e / s.heatSource.averageFraction;
  const absFront = absorbedFluxPerFace(s.environment, 'edgeOn', { emissivity: 0.85, solarAbsorptance: 0.9 })[0]!;
  const absBack = absorbedFluxPerFace(s.environment, 'edgeOn', s.radiator)[0]!;
  const emissivity = 0.85 + (0.9 * 0.9) / 1.25;
  near(emissivity * SIGMA * t.radiator_K ** 4, 0.9 * SOLAR_CONSTANT_W_M2 - e + q + absFront + absBack, 1e-6);
  assert.equal(t.cell_K, t.radiator_K);
  assert.equal(t.radiatorAreaPerTile_m2, 1);
  // The chip sits above the Tile by its stack drop; infeasible exactly when that passes the limit.
  assert.equal(r.feasible, t.junction_K <= s.heatSource.maxTemperature_K);
});

test('integrated-solar Tiles: better cells need fewer Tiles; a held peak adds battery', () => {
  const s = buildScenario('tileSolar');
  const base = evaluateScenario(s);
  const better = evaluateScenario(withPath(s, 'power.cellEfficiency', 0.28));
  assert.ok(better.tile!.count < base.tile!.count);
  assert.equal(base.mass_kg.battery, 0);
  const held = evaluateScenario(withPath(withPath(s, 'tile.peakDuration_h', 1), 'tile.supportStructureFraction', 0.15));
  near(held.mass_kg.battery, (held.busLoad_W - held.busLoadAverage_W) / 0.3 / 150);
  // Batteries ride on the Tiles, so the support structure grows with them.
  const m = held.mass_kg;
  near(m.tileStructure, 0.15 * (m.radiator + m.solarArray + m.battery + m.powerConversion + m.tileOverhead));
  assert.ok(m.tileStructure > 0.15 * (base.mass_kg.radiator + base.mass_kg.solarArray + base.mass_kg.powerConversion + base.mass_kg.tileOverhead));
});

test('integrated-solar Tiles: tilting away from the Sun cools the cells and needs more Tiles', () => {
  const s = buildScenario('tileSolar');
  const flat = evaluateScenario(s);
  const tilted = evaluateScenario(withPath(s, 'tile.sunAngle_deg', 40));
  assert.ok(tilted.tile!.cell_K! < flat.tile!.cell_K!);
  assert.ok(tilted.tile!.count > flat.tile!.count);
  // A bonded Tile that is too hot face-on becomes feasible once tilted far enough.
  const bonded = withPath(s, 'tile.radiatorCoupling', 'bonded');
  assert.equal(evaluateScenario(bonded).feasible, false);
  assert.equal(evaluateScenario(withPath(bonded, 'tile.sunAngle_deg', 60)).feasible, true);
});
