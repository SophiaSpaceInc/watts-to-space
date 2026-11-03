// Import/export is a trust boundary: shared files must round-trip exactly, and bad
// files must be rejected with every problem listed.
import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { buildScenario } from '../src/model/scenarios.ts';
import { changesFromMode, diffScenario, exportScenario, importScenario, ScenarioImportError } from '../src/model/scenarioIO.ts';
import { withPath } from '../src/model/sensitivity.ts';

const problemsOf = (text: string) => {
  try {
    importScenario(text);
  } catch (e) {
    if (e instanceof ScenarioImportError) return e.problems;
    throw e;
  }
  return [];
};

test('export then import round-trips every mode exactly', () => {
  for (const mode of ['iss', 'starmind', 'ideal', 'physics'] as const) {
    const s = buildScenario(mode, { environment: 'moon-polar', heatSource: 'process-600K' });
    assert.deepEqual(importScenario(exportScenario(s)), s);
  }
});

test('a bare scenario object (no wrapper) is accepted', () => {
  const s = buildScenario('ideal');
  assert.deepEqual(importScenario(JSON.stringify(s)), s);
});

test('rejects non-JSON, wrong format and future versions', () => {
  assert.match(problemsOf('{nope')[0] ?? '', /not valid JSON/);
  assert.match(problemsOf('{"format":"other","version":1}')[0] ?? '', /format must be/);
  assert.match(problemsOf('{"format":"watts-to-space/scenario","version":99}')[0] ?? '', /unsupported version/);
});

test('reports every out-of-range or mistyped field, not just the first', () => {
  let s = buildScenario('starmind');
  s = withPath(s, 'radiator.emissivity', 1.7);
  s = withPath(s, 'loop.coolant', 'mercury');
  s = withPath(s, 'heatSource.stages', [{ id: 'x', label: 'x', kind: 'conduction', thickness_m: -1, conductivity_W_mK: 1, area_m2: 1, lengthScale_m: 0 }]);
  s = withPath(s, 'notes', { 'radiator.emissivity': 42 });
  const problems = problemsOf(exportScenario(s));
  assert.equal(problems.length, 4, problems.join('\n'));
  assert.ok(problems.some((p) => p.startsWith('radiator.emissivity = 1.7')));
  assert.ok(problems.some((p) => p.startsWith('loop.coolant')));
  assert.ok(problems.some((p) => p.startsWith('heatSource.stages[0].thickness_m')));
  assert.ok(problems.some((p) => p.startsWith('scenario.notes')));
});

test('a missing section is reported', () => {
  const s = JSON.parse(JSON.stringify(buildScenario('starmind')));
  delete s.power;
  assert.deepEqual(problemsOf(JSON.stringify(s)), ['scenario.power must be an object']);
});

test('an unmodified reference case has no changes; edits are listed by path', () => {
  const s = buildScenario('starmind');
  assert.deepEqual(changesFromMode(s), []);
  const edited = withPath(s, 'radiator.emissivity', 0.85);
  assert.deepEqual(changesFromMode(edited), [{ path: 'radiator.emissivity', from: 0.9, to: 0.85 }]);
});

test('switching environment counts as a change; notes do not', () => {
  const base = buildScenario('starmind');
  const moved = buildScenario('starmind', { environment: 'cislunar-deep' });
  assert.ok(diffScenario(base, moved).some((c) => c.path === 'environmentId'));
  assert.deepEqual(diffScenario(base, { ...base, notes: {} }), []);
});

test('files from before peak/average load with average = peak', () => {
  const s = JSON.parse(exportScenario(buildScenario('starmind')));
  delete s.scenario.heatSource.averageFraction;
  assert.equal(importScenario(JSON.stringify(s)).heatSource.averageFraction, 1);
});
