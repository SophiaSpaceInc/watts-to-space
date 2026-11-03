// Unit tests for the physics primitives: radiation, view factors, orbit geometry.
import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { BODIES, SIGMA } from '../src/model/constants.ts';
import { emittedFlux, fluidTemperatureForRejection, netRejectionPerPanelArea, t4MeanTemperature } from '../src/model/radiation.ts';
import { viewFactorEdgeOn, viewFactorFacing } from '../src/model/viewFactor.ts';
import { circularPeriod_s, eclipseFraction, albedoGeometryFactor } from '../src/model/orbit.ts';

const close = (a: number, b: number, tol: number, msg?: string) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b} ± ${tol}, got ${a}`);

test('Stefan–Boltzmann: black body at 300 K emits ≈459 W/m²', () => {
  close(emittedFlux(300, 1, 0), 459.3, 0.1);
});

test('T⁴-mean of a linear glide sits between the ends, above the arithmetic mean', () => {
  const T = t4MeanTemperature(284, 233);
  assert.ok(T > (284 + 233) / 2 && T < 284);
  assert.equal(t4MeanTemperature(300, 300), 300);
});

test('fluidTemperatureForRejection inverts netRejectionPerPanelArea', () => {
  const surface = { emissivity: 0.9, finEfficiency: 0.9 };
  const absorbed = [60, 60];
  const q = netRejectionPerPanelArea(340, surface, absorbed);
  close(fluidTemperatureForRejection(q, surface, absorbed), 340, 1e-6);
});

/** Brute-force view factor: integrate cos θ over the hemisphere directions that hit the sphere. */
function numericViewFactor(R: number, h: number, normal: 'horizontal' | 'nadir'): number {
  const ang = Math.asin(R / (R + h));
  const n = 400;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const th = ((i + 0.5) * (Math.PI / 2)) / n;
    for (let j = 0; j < n; j++) {
      const ph = ((j + 0.5) * 2 * Math.PI) / n;
      // local frame: face normal = z'; build direction then rotate so normal points along `normal`
      const local = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
      const [a, b, c] = local as [number, number, number];
      const dir = normal === 'horizontal' ? [c, a, b] : [a, b, -c];
      // nadir is -z in the world frame
      const angleToNadir = Math.acos(Math.max(-1, Math.min(1, -(dir[2] as number))));
      if (angleToNadir < ang) sum += Math.cos(th) * Math.sin(th);
    }
  }
  return (sum * (Math.PI / 2 / n) * ((2 * Math.PI) / n)) / Math.PI;
}

test('edge-on view factor matches numerical integration (Earth 400–2000 km, Moon 100 km)', () => {
  const cases: [number, number][] = [
    [BODIES.earth.radius_km, 400],
    [BODIES.earth.radius_km, 600],
    [BODIES.earth.radius_km, 2000],
    [BODIES.moon.radius_km, 100],
  ];
  for (const [R, h] of cases) {
    close(viewFactorEdgeOn(R, h), numericViewFactor(R, h, 'horizontal'), 2e-3, `edge-on R=${R} h=${h}`);
  }
});

test('nadir view factor matches numerical integration', () => {
  close(viewFactorFacing(BODIES.earth.radius_km, 600), numericViewFactor(BODIES.earth.radius_km, 600, 'nadir'), 2e-3);
});

test('edge-on factor at 550 km is ≈0.26, about 6× the 5 %-of-nadir floor used in McCalip math.js', () => {
  const F = viewFactorEdgeOn(BODIES.earth.radius_km, 550);
  close(F, 0.258, 0.002);
  const floor = 0.05 * viewFactorFacing(BODIES.earth.radius_km, 550);
  close(F / floor, 6.1, 0.1);
});

test('ISS-like orbit: ~92.6 min period, ~39 % eclipse at β = 0', () => {
  close(circularPeriod_s(BODIES.earth, 420) / 60, 92.8, 0.3);
  close(eclipseFraction(BODIES.earth, 420, 0), 0.387, 0.003);
});

test('no eclipse above the critical beta angle', () => {
  assert.equal(eclipseFraction(BODIES.earth, 600, 70), 0);
  assert.ok(eclipseFraction(BODIES.earth, 600, 60) > 0);
});

test('albedo geometry factor: 1/π at β = 0, zero at β = 90°', () => {
  close(albedoGeometryFactor(0), 1 / Math.PI, 1e-12);
  close(albedoGeometryFactor(90), 0, 1e-12);
});

test('SIGMA is the CODATA value', () => {
  assert.equal(SIGMA, 5.670374419e-8);
});
