import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { emittedFlux } from '../src/model/thermalEmission.ts';
import { SOLAR_ARRAY_W_M2, solarArrayArea_m2, CASE_EMISSIVITY, DEVICES, EVERYDAY_SOURCES, OBJECTS, PLACES, caseArea_m2, caseHeatLoss_W, caseTemperature_K, nearestObject, radiativeCoefficient_W_m2K, radiatorArea_m2 } from '../src/model/everyday.ts';

test('case temperature balances the heat: every device, every place', () => {
  for (const d of Object.values(DEVICES))
    for (const place of Object.values(PLACES)) {
      const A = caseArea_m2(d);
      const T = caseTemperature_K(d.power_W, A, CASE_EMISSIVITY, place);
      assert.ok(Math.abs(caseHeatLoss_W(T, A, CASE_EMISSIVITY, place) / d.power_W - 1) < 1e-6, `${d.name} ${place.name}`);
    }
});

test('warm chamber walls radiate back, and air carries heat away', () => {
  const d = DEVICES.laptop;
  const A = caseArea_m2(d);
  const t = (id: keyof typeof PLACES) => caseTemperature_K(d.power_W, A, CASE_EMISSIVITY, PLACES[id]);
  assert.ok(t('chamber') > t('space'), 'warm chamber walls radiate back');
  assert.ok(t('desk') < t('chamber'), 'air carries heat away');
});

test('radiator area sheds the power from both faces', () => {
  const A = radiatorArea_m2(60, 333.15);
  assert.ok(Math.abs(2 * A * emittedFlux(333.15, 0.9) - 60) < 1e-9);
});

test('solar array area powers the device at the stated 250 W/m², about five times a 60 °C radiator', () => {
  assert.equal(SOLAR_ARRAY_W_M2, 250);
  assert.ok(Math.abs(solarArrayArea_m2(60) * 250 - 60) < 1e-12);
  const ratio = solarArrayArea_m2(1000) / radiatorArea_m2(1000, 333.15);
  assert.ok(ratio > 4.5 && ratio < 5.5, `ratio ${ratio}`);
});

test('radiation to the dark sky near 60 °C moves about as much heat per degree as still air', () => {
  const h = radiativeCoefficient_W_m2K(333.15);
  assert.ok(h > 2 && h < 25, `h_rad ${h}`);
});

test('provenance: every device note carries a known source or ESTIMATE; objects are sorted', () => {
  for (const d of Object.values(DEVICES))
    for (const note of [d.note.power, d.note.size]) {
      const ids = [...note.matchAll(/\[([a-z0-9-]+)\]/g)].map((m) => m[1] as string);
      assert.ok(ids.length > 0 || note.includes('ESTIMATE'), `${d.name}: ${note}`);
      for (const id of ids) assert.ok(EVERYDAY_SOURCES[id], `unknown source ${id}`);
    }
  for (let i = 1; i < OBJECTS.length; i++) assert.ok((OBJECTS[i]?.area_m2 ?? 0) > (OBJECTS[i - 1]?.area_m2 ?? 0));
  assert.equal(nearestObject(250).name, 'a tennis court');
  assert.equal(nearestObject(0.004).name, 'a credit card');
});
