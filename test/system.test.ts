// Tests for the composed model: chain, power, scenarios, validation anchors.
import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { buildScenario, ENVIRONMENTS, HEAT_SOURCES, MODES, PARAMETERS, SOURCES } from '../src/model/scenarios.ts';
import { evaluateScenario } from '../src/model/system.ts';
import { evaluateChain, stageDeltaT } from '../src/model/thermalChain.ts';
import { harness, sizePowerSupply, storageSizing } from '../src/model/power.ts';
import { EXPLANATIONS } from '../src/model/glossary.ts';
import { sunlight } from '../src/model/environment.ts';
import { getPath, tornado } from '../src/model/sensitivity.ts';
import { wiedemannFranzEquivalentVoltage, wireDeliveredFraction } from '../src/model/transport.ts';
import type { ModeId, Stage } from '../src/model/types.ts';

const close = (a: number, b: number, tol: number, msg?: string) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b} ± ${tol}, got ${a}`);

test('validation anchor: ISS mode reproduces the EATCS 70 kW rating on 475 m² of radiator', () => {
  const s = buildScenario('iss');
  s.heatSource.totalPower_W = 70e3;
  Object.assign(s.power, { conversionEfficiency: 1, overheadFraction: 0, pumpFraction: 0 });
  const r = evaluateScenario(s);
  close(r.radiatorArea_m2, 6 * 23.3 * 3.4, 0.03 * 475, 'ISS radiator area');
  close(r.chain.radiatorOut_K, 233.15, 0.5, 'radiator outlet = −40 °F goal');
});

test('stage ΔT = Q·R; fixed-ΔT stages ignore power', () => {
  const stage: Stage = { id: 'x', label: 'x', kind: 'resistance', resistance_K_W: 0.01, lengthScale_m: 0 };
  assert.equal(stageDeltaT(stage, 1000), 10);
  assert.equal(stageDeltaT({ id: 'y', label: 'y', kind: 'deltaT', deltaT_K: 7, lengthScale_m: 0 }, 1e6), 7);
});

test('lidded Rubin-class stack at 1.8 kW spends ≈31 K in the first centimetre', () => {
  const hs = HEAT_SOURCES['gpu-lidded']!.heatSource;
  const c = evaluateChain(hs, { coolant: 'water', transportDrop_K: 0, transportLength_m: 1, hxApproach_K: 0, rise_K: 0, coolantCap_K: null }, 1);
  close(c.stackDrop_K, 30.8, 0.5);
});

test('a heritage coolant setpoint caps the loop and leaves source margin unused', () => {
  const r = evaluateScenario(buildScenario('iss'));
  assert.ok(r.chain.capped);
  assert.ok(r.chain.sourceActual_K < 373);
  assert.ok(r.warnings.some((w) => w.level === 'info'));
});

test('energy balance: heat rejected equals bus load; solar array covers load + storage + harness loss', () => {
  for (const id of Object.keys(MODES) as ModeId[]) {
    const r = evaluateScenario(buildScenario(id));
    assert.equal(r.heatToReject_W, r.busLoad_W);
    const expected = (r.busLoadAverage_W * r.storage.solarArrayOversize) / (1 - r.harness.lossFraction);
    close(r.solarArrayOutput_W, expected, 1e-6 * expected, id);
    const sum = Object.values(r.mass_kg).reduce((a, b) => a + b, 0);
    close(r.totalMass_kg, sum, 1e-9 * sum, id);
  }
});

test('storage: no darkness → no battery and no oversize; lunar night → hundreds of hours', () => {
  const none = storageSizing({ load_W: 1e5, sunlitFraction: 1, cyclePeriod_h: 1.5, roundTripEfficiency: 0.9, depthOfDischarge: 0.5, specificEnergy_Wh_kg: 200 });
  assert.equal(none.solarArrayOversize, 1);
  assert.equal(none.mass_kg, 0);
  const moon = storageSizing({ load_W: 1, sunlitFraction: 0.5, cyclePeriod_h: 29.53 * 24, roundTripEfficiency: 1, depthOfDischarge: 1, specificEnergy_Wh_kg: 1 });
  close(moon.energy_Wh, 354.4, 0.1);
  close(moon.solarArrayOversize, 2, 1e-12);
});

test('harness sized for a loss target: copper mass scales as 1/V² and 1/loss', () => {
  const a = harness({ power_W: 1e5, busVoltage_V: 100, oneWayLength_m: 30, lossFraction: 0.01 });
  const b = harness({ power_W: 1e5, busVoltage_V: 200, oneWayLength_m: 30, lossFraction: 0.01 });
  const c = harness({ power_W: 1e5, busVoltage_V: 100, oneWayLength_m: 30, lossFraction: 0.02 });
  close(a.mass_kg / b.mass_kg, 4, 1e-9);
  close(a.mass_kg / c.mass_kg, 2, 1e-9);
  // hand check: 164 kW over 35 m at 120 V for 1 % loss needs ≈1,339 mm² and ≈840 kg of copper
  const h = harness({ power_W: 163900, busVoltage_V: 120, oneWayLength_m: 35, lossFraction: 0.01 });
  close(h.conductorArea_mm2, 1339, 1);
  close(h.mass_kg, 839.5, 1);
  // and the delivered-power check: R from that area gives back the target loss
  const R = (1.68e-8 * 70) / (h.conductorArea_mm2 * 1e-6);
  close((163900 * R) / 120 ** 2, 0.01, 1e-9);
});

test('electricity vs heat: 1 kW at 120 V over 10 m loses ≈0.5 %; 50 K of copper conduction ≈ 20 mV bus', () => {
  close(1 - wireDeliveredFraction({ power_W: 1000, voltage_V: 120, oneWayLength_m: 10, conductorArea_mm2: 5.26, connectors_ohm: 4e-3 }), 0.0049, 0.0003);
  close(wiedemannFranzEquivalentVoltage(320, 50), 0.0198, 0.0003);
});

test('Starmind reported 110 m² implies a fluid hotter than the lidded chain delivers', () => {
  const r = evaluateScenario(buildScenario('starmind'));
  assert.ok(r.reportedCheck);
  assert.ok(r.reportedCheck!.requiredFluid_K > r.chain.fluidEffective_K);
});

test('lunar equator at noon: a vertical fin at the Starmind chain temperature nets almost nothing', () => {
  const r = evaluateScenario(buildScenario('starmind', { environment: 'moon-equator' }));
  assert.ok(r.netFlux_W_m2 < 100);
  const cold = evaluateScenario({ ...buildScenario('starmind', { environment: 'moon-equator' }), heatSource: { ...HEAT_SOURCES['gpu-lidded']!.heatSource, maxTemperature_K: 360 } });
  assert.equal(cold.feasible, false);
});

test('raising the source temperature shrinks the radiator; tornado agrees in sign', () => {
  const s = buildScenario('starmind');
  const rows = tornado(s, [{ path: 'heatSource.maxTemperature_K', label: 'T', step: 10 }], (r) => r.radiatorArea_m2);
  const row = rows[0]!;
  assert.ok(row.highPct < 0 && row.lowPct > 0);
});

test('modes are physically ordered: physics limit ≤ ideal ≤ Starmind ≤ ISS in radiator area', () => {
  const area = (id: ModeId) => evaluateScenario(buildScenario(id)).radiatorArea_m2;
  assert.ok(area('physics') < area('ideal'));
  assert.ok(area('ideal') < area('starmind'));
  assert.ok(area('starmind') < area('iss'));
});

test('provenance hygiene: every note cites a known source or carries a tag; every default fits its slider', () => {
  const tag = /\[([a-z0-9-]+)\]|ASSUMPTION|CALIBRATED|SECONDARY|Placeholder|placeholder|bound/;
  for (const modeId of Object.keys(MODES) as ModeId[]) {
    for (const envId of Object.keys(ENVIRONMENTS)) {
      for (const hsId of Object.keys(HEAT_SOURCES)) {
        const s = buildScenario(modeId, { environment: envId, heatSource: hsId });
        for (const [path, note] of Object.entries(s.notes)) {
          for (const [, id = ''] of note.matchAll(/\[([a-z0-9-]+)\]/g)) assert.ok(SOURCES[id], `unknown source [${id}] in ${path}`);
          assert.match(note, tag, `untagged note at ${path}`);
        }
        for (const p of PARAMETERS) {
          if (p.when && !p.when(s)) continue;
          const v = getPath(s, p.path) as number;
          assert.ok(v >= p.min && v <= p.max, `${modeId}/${envId}/${hsId}: ${p.path}=${v} outside [${p.min}, ${p.max}]`);
        }
      }
    }
  }
});

test('power-supply part sized on its own matches the whole-system result', () => {
  for (const env of ['iss-leo', 'moon-equator', 'cislunar-deep']) {
    const s = buildScenario('starmind', { environment: env });
    const r = evaluateScenario(s);
    const supply = sizePowerSupply(r.busLoadAverage_W, s.power, sunlight(s.environment), r.busLoad_W);
    assert.equal(supply.area_m2, r.solarArrayArea_m2);
    assert.equal(supply.storage.mass_kg, r.mass_kg.battery);
  }
});

test('more sunlight never needs more battery or more solar array', () => {
  const s = buildScenario('iss');
  let prev = { battery: Infinity, area: Infinity };
  for (let f = 0.3; f <= 1.0001; f += 0.05) {
    const sup = sizePowerSupply(150e3, s.power, { sunlitFraction: Math.min(f, 1), cyclePeriod_h: 1.55 });
    assert.ok(sup.storage.mass_kg <= prev.battery && sup.area_m2 <= prev.area);
    prev = { battery: sup.storage.mass_kg, area: sup.area_m2 };
  }
});

test('every input that can appear in the Assumptions table has a plain-language explanation', () => {
  const paths = new Set(PARAMETERS.map((p) => p.path));
  for (const modeId of Object.keys(MODES) as ModeId[])
    for (const envId of Object.keys(ENVIRONMENTS))
      for (const hsId of Object.keys(HEAT_SOURCES)) Object.keys(buildScenario(modeId, { environment: envId, heatSource: hsId }).notes).forEach((p) => paths.add(p));
  const missing = [...paths].filter((p) => !EXPLANATIONS[p]);
  assert.deepEqual(missing, [], `no explanation for: ${missing.join(', ')}`);
  const stale = Object.keys(EXPLANATIONS).filter((p) => !paths.has(p));
  assert.deepEqual(stale, [], `explanations for inputs that no longer exist: ${stale.join(', ')}`);
  for (const [path, text] of Object.entries(EXPLANATIONS)) {
    assert.doesNotMatch(text, /\bradiation\b/i, `${path}: say "thermal emission" or "radiates", not "radiation"`);
    assert.doesNotMatch(text.replace(/solar arrays?/gi, ''), /\barrays?\b/i, `${path}: say "solar array", never a bare "array"`);
  }
});

test('peak sizes the radiator, average sizes the solar array and battery', () => {
  const base = buildScenario('starmind', { environment: 'iss-leo' });
  const flat = evaluateScenario({ ...base, heatSource: { ...base.heatSource, averageFraction: 1 } });
  const duty = evaluateScenario({ ...base, heatSource: { ...base.heatSource, averageFraction: 0.5 } });
  assert.equal(duty.radiatorArea_m2, flat.radiatorArea_m2);
  assert.equal(duty.heatToReject_W, flat.heatToReject_W);
  close(duty.busLoadAverage_W / flat.busLoadAverage_W, 0.5, 1e-12);
  close(duty.mass_kg.battery / flat.mass_kg.battery, 0.5, 1e-9);
  assert.ok(duty.solarArrayArea_m2 < 0.55 * flat.solarArrayArea_m2);
  assert.equal(duty.mass_kg.harness, flat.mass_kg.harness, 'harness carries the peak current either way');
});

test('Starmind check: the published flux needs fluid between the delivered and the source temperatures; published areas are about 5:1', () => {
  const c = evaluateScenario(buildScenario('starmind')).reportedCheck!;
  assert.ok(c.statedFluxFluid_K! > c.modelFluid_K && c.statedFluxFluid_K! < 373, `stated-flux fluid ${c.statedFluxFluid_K}`);
  assert.ok(Math.abs(c.publishedAreaRatio! - 840 / 160) < 1e-9);
});

test('thermal rejection per kg: heat over radiator + loop mass; heritage < Starmind < aggressive < bound', () => {
  const w = (id: ModeId) => evaluateScenario(buildScenario(id)).thermalRejection_W_per_kg;
  const r = evaluateScenario(buildScenario('starmind'));
  assert.ok(Math.abs(r.thermalRejection_W_per_kg - r.heatToReject_W / (r.mass_kg.radiator + r.mass_kg.thermalLoop)) < 1e-9);
  assert.ok(w('iss') < w('starmind') && w('starmind') < w('ideal') && w('ideal') < w('physics'));
});
