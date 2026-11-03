// Share links are posted publicly and pasted by strangers: they must round-trip exactly,
// stay short for typical edits, and reject damaged or hostile strings.
import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { buildScenario } from '../src/model/scenarios.ts';
import { exportScenario, importScenario, ScenarioImportError } from '../src/model/scenarioIO.ts';
import { withPath } from '../src/model/sensitivity.ts';
import { decodeShare, decodeShareDetailed, encodeShare, fnv1a, presetFingerprint, SHARE_PREFIX } from '../src/model/shareLink.ts';
import { MODES } from '../src/model/scenarios.ts';

const strip = (s: ReturnType<typeof buildScenario>) => ({ ...s, notes: {} });
const problemsOf = (share: string) => {
  try {
    decodeShare(share);
  } catch (e) {
    if (e instanceof ScenarioImportError) return e.problems;
    throw e;
  }
  return [];
};

test('an unmodified reference case is a very short link', () => {
  const share = encodeShare(buildScenario('ideal'));
  assert.ok(share.startsWith(`${SHARE_PREFIX}.`));
  assert.ok(share.length < 64, share);
  assert.deepEqual(strip(decodeShare(share)), strip(buildScenario('ideal')));
});

test('edits, preset swaps and whole-section changes round-trip exactly', () => {
  let s = buildScenario('starmind', { environment: 'moon-polar', heatSource: 'process-600K' });
  s = withPath(s, 'radiator.emissivity', 0.83);
  s = withPath(s, 'power.battery.depthOfDischarge', 0.7);
  s = withPath(s, 'heatSource.stages.0.deltaT_K', 12.5);
  s = withPath(s, 'loop.coolant', 'ammonia');
  const share = encodeShare(s);
  assert.deepEqual(strip(decodeShare(share)), strip(s));
  assert.ok(share.length < 450, `${share.length} chars`); // mostly the whole source stack, which travels intact once edited
});

test('an imported custom case (unknown environment, different shape) round-trips', () => {
  const custom = withPath(withPath(buildScenario('iss'), 'environmentId', 'my-site'), 'environment', {
    kind: 'surface', body: 'moon', groundTemperature_K: 250, groundEmissivity: 0.9, groundAlbedo: 0.1,
    sunElevation_deg: 10, sunlitFraction: 0.7, cyclePeriod_h: 708.72,
  });
  const imported = importScenario(exportScenario(custom));
  assert.deepEqual(strip(decodeShare(encodeShare(imported))), strip(imported));
});

test('damaged, foreign and hostile strings are rejected with a reason', () => {
  const good = encodeShare(withPath(buildScenario('starmind'), 'radiator.emissivity', 0.8));
  const [prefix, body, check] = good.split('.');
  assert.match(problemsOf(`${prefix}.${body}X.${check}`)[0] ?? '', /damaged/);
  assert.match(problemsOf(`w2s9.${body}.${check}`)[0] ?? '', /unsupported share format/);
  assert.match(problemsOf('nonsense')[0] ?? '', /must look like/);

  const hostile = (d: Record<string, unknown>) => {
    const b = Buffer.from(JSON.stringify({ m: 'starmind', d })).toString('base64url');
    return `${SHARE_PREFIX}.${b}.${fnv1a(b)}`;
  };
  assert.match(problemsOf(hostile({ '__proto__.polluted': 1 }))[0] ?? '', /unknown field/);
  assert.match(problemsOf(hostile({ 'radiator.constructor.prototype.x': 1 }))[0] ?? '', /unknown field/);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.ok(problemsOf(hostile({ 'radiator.emissivity': 4 })).some((p) => p.startsWith('radiator.emissivity = 4')));
});

test('configuration control: a link made against different preset values loads, and says so', () => {
  const share = encodeShare(withPath(buildScenario('starmind'), 'radiator.emissivity', 0.8));
  assert.equal(decodeShareDetailed(share).presetsChanged, false);
  const before = presetFingerprint();
  const original = MODES.starmind.radiator.arealDensity_kg_m2;
  try {
    MODES.starmind.radiator.arealDensity_kg_m2 = original + 1; // a later "correction" to a preset
    assert.notEqual(presetFingerprint(), before);
    const decoded = decodeShareDetailed(share);
    assert.equal(decoded.presetsChanged, true);
    assert.equal(decoded.scenario.radiator.emissivity, 0.8);
  } finally {
    MODES.starmind.radiator.arealDensity_kg_m2 = original;
  }
  assert.equal(presetFingerprint(), before, 'labels and notes do not affect the fingerprint; restoring the value restores it');
});

test('a link carrying a field the model no longer has loads, drops the field and says so', () => {
  const body = Buffer.from(JSON.stringify({ m: 'starmind', d: { 'power.conductorArea_mm2': 50, 'radiator.emissivity': 0.8 } })).toString('base64url');
  const decoded = decodeShareDetailed(`${SHARE_PREFIX}.${body}.${fnv1a(body)}`);
  assert.deepEqual(decoded.ignored, ['power.conductorArea_mm2']);
  assert.equal(decoded.scenario.radiator.emissivity, 0.8);
  assert.equal((decoded.scenario.power as unknown as Record<string, unknown>).conductorArea_mm2, undefined);
});
