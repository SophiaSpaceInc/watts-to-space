import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { arealDensityFor_kg_m2, loopCeiling_W_kg, panelFlux_W_m2, wattsPerKg } from '../src/model/specificRejection.ts';

const base = { T_K: 323.15, emissivity: 0.9, arealDensity_kg_m2: 6, loop_kg_per_kW: 5, altitude_km: 600 };

test('at 50 °C in low orbit a two-sided panel sheds about 1,000 W/m²', () => {
  const q = panelFlux_W_m2(base);
  assert.ok(q > 950 && q < 1050, `q ${q}`);
});

test('W/kg is heat per m² over mass per m², panel plus pumps', () => {
  const q = panelFlux_W_m2(base);
  assert.ok(Math.abs(wattsPerKg(base) - q / (6 + q * 0.005)) < 1e-9);
});

test('the pumps set a ceiling no panel can beat; the contour inverts W/kg', () => {
  assert.equal(loopCeiling_W_kg(5), 200);
  assert.ok(wattsPerKg({ ...base, arealDensity_kg_m2: 1e-9 }) < 200);
  assert.equal(arealDensityFor_kg_m2(250, 1000, 5), null);
  const q = panelFlux_W_m2(base);
  const m = arealDensityFor_kg_m2(100, q, 5) as number;
  assert.ok(Math.abs(wattsPerKg({ ...base, arealDensity_kg_m2: m }) - 100) < 1e-6);
});
