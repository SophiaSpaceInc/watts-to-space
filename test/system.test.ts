// Tests for the composed model: chain, power, scenarios, validation anchors.
import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { buildScenario, ENVIRONMENTS, HEAT_SOURCES, MODES, PARAMETERS, SOURCES } from '../src/model/scenarios.ts';
import { evaluateScenario } from '../src/model/system.ts';
import { evaluateChain, stageDeltaT } from '../src/model/thermalChain.ts';
import { storageSizing, harness } from '../src/model/power.ts';
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
    const expected = (r.busLoad_W * r.storage.solarArrayOversize) / (1 - r.harness.lossFraction);
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

test('harness loss scales as 1/V²', () => {
  const a = harness({ power_W: 1e5, busVoltage_V: 100, oneWayLength_m: 30, conductorArea_mm2: 50 });
  const b = harness({ power_W: 1e5, busVoltage_V: 200, oneWayLength_m: 30, conductorArea_mm2: 50 });
  close(a.lossFraction / b.lossFraction, 4, 1e-9);
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
