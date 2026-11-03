import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { blackBodySunlight_W_m2, sunShareOfView, sunwardBudget } from '../src/model/sunward.ts';

const base = { T_K: 333.15, emissivity: 0.9, solarAbsorptance: 0.2, sunAngle_deg: 90, altitude_km: 600 };

test('the Sun covers about 0.001 % of a face\'s view, yet a 5,772 K black body at 1 au gives the 1,361 W/m² solar constant', () => {
  const share = sunShareOfView();
  assert.ok(share > 1e-5 && share < 1.2e-5, `share ${share}`);
  assert.ok(Math.abs(blackBodySunlight_W_m2() / 1361 - 1) < 0.002, `black body ${blackBodySunlight_W_m2()}`);
});

test('knife-edge to the Sun and far from Earth is the dark-sky case', () => {
  const b = sunwardBudget({ ...base, altitude_km: 1e7 });
  assert.ok(b.sun < 1e-9);
  assert.ok(Math.abs(b.net / b.darkSky - 1) < 1e-4);
});

test('face-on, the sunlit face absorbs α × 1,361 W/m²; the budget adds up', () => {
  const b = sunwardBudget({ ...base, sunAngle_deg: 0 });
  assert.ok(Math.abs(b.sun - 0.2 * 1361) < 1);
  assert.ok(Math.abs(b.emitted - b.sun - b.earthInfrared - b.earthReflected - b.net) < 1e-9);
  assert.ok(b.earthInfrared > 0 && b.earthReflected > 0);
});

test('Earth\'s pull fades with altitude', () => {
  const low = sunwardBudget({ ...base, altitude_km: 400 });
  const high = sunwardBudget({ ...base, altitude_km: 2000 });
  assert.ok(low.earthInfrared > high.earthInfrared && low.net < high.net);
});
