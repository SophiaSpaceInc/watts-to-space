// The analysis CLI is the agent-facing surface of the model: its contract is JSON in a
// stable shape, exit code 2 with every problem listed on bad input, and share strings that
// reproduce results exactly.
import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { run } from '../scripts/analyze.ts';

const json = (argv: string[]) => {
  const out = run(argv);
  assert.equal(out.code, 0, out.stdout);
  return JSON.parse(out.stdout);
};

test('--list parses as JSON and names modes, presets and parameters', () => {
  const l = json(['--list']);
  assert.deepEqual(l.modes.map((m: { id: string }) => m.id).sort(), ['ideal', 'iss', 'physics', 'starmind']);
  assert.ok(l.heatSources.length > 0 && l.environments.length > 0);
  const p = l.parameters.find((x: { path: string }) => x.path === 'radiator.emissivity');
  assert.deepEqual(Object.keys(p).sort(), ['group', 'label', 'max', 'min', 'part', 'path', 'unit']);
});

test('a bad --set exits 2 and lists the problem', () => {
  const out = run(['--set', 'radiator.emissivity=7', '--set', 'radiator.nonsense=1']);
  assert.equal(out.code, 2);
  assert.match(out.stdout, /radiator\.nonsense/);
  const range = run(['--set', 'radiator.emissivity=7']);
  assert.equal(range.code, 2);
  assert.match(range.stdout, /radiator\.emissivity = 7 is outside/);
});

test('--share-out then --share reproduces identical results', () => {
  const args = ['--mode', 'ideal', '--environment', 'moon-equator', '--set', 'radiator.emissivity=0.8', '--set', 'heatSource.maxTemperature_K=390'];
  const out = json([...args, '--share-out']);
  assert.match(out.url, /^https:\/\/watts-to-space\.chrislewicki\.com\/\?s=w2s1\./);
  const direct = run(args);
  assert.equal(run(['--share', out.share]).stdout, direct.stdout);
  assert.equal(run(['--share', out.url]).stdout, direct.stdout);
  assert.match(json(['--share-out', '--base-url', 'https://example.org/x/?old=1'])?.url, /^https:\/\/example\.org\/x\/\?s=w2s1\./);
});

test('--export writes a file that --scenario reads back to the same results', async () => {
  const { writeFileSync, mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const file = `${mkdtempSync(`${tmpdir()}/w2s-`)}/s.json`;
  const args = ['--mode', 'iss', '--set', 'radiator.sizingMargin=1.4'];
  const exported = run([...args, '--export']);
  assert.equal(exported.code, 0);
  assert.equal(JSON.parse(exported.stdout).format, 'watts-to-space/scenario');
  writeFileSync(file, exported.stdout);
  assert.equal(run(['--scenario', file]).stdout, run(args).stdout);
});

test('a damaged share string exits 2', () => {
  const out = run(['--share', 'w2s1.eyJtIjoiaXNzIn0.00000000']);
  assert.equal(out.code, 2);
  assert.match(out.stdout, /checksum/);
});

test('sweeping the source temperature limit never increases the radiator area', () => {
  const { sweeps } = json(['--sweep', 'heatSource.maxTemperature_K=320:420:10', '--metric', 'radiatorArea_m2']);
  const ys: number[] = sweeps[0].points.map((p: Record<string, number>) => p.radiatorArea_m2);
  assert.equal(ys.length, 11);
  for (let i = 1; i < ys.length; i++) assert.ok(ys[i]! <= ys[i - 1]!, `area rose at point ${i}`);
});

test('--compare returns the four reference modes, honouring overrides', () => {
  const { modes } = json(['--compare', '--environment', 'cislunar-deep']);
  assert.equal(modes.length, 4);
  assert.ok(modes.every((m: { environment: string }) => m.environment === 'cislunar-deep'));
});

test('--explain radiator.emissivity includes a note and resolved source URLs', () => {
  const e = json(['--mode', 'iss', '--explain', 'radiator.emissivity']);
  assert.ok(e.note.length > 0 && e.documented);
  assert.ok(e.sources.length > 0 && e.sources.every((s: { url: string }) => s.url.startsWith('https://')));
  assert.deepEqual(e.sliderRange, { min: 0.05, max: 1, step: 0.01 });
});

test('--explain flags an undocumented input instead of inventing a note', () => {
  const e = json(['--mode', 'ideal', '--explain', 'radiator.emissivity']);
  assert.equal(e.documented, false);
  assert.equal(e.note, null);
});

test('--explain all lists every note, including notes for fields this scenario does not carry', () => {
  const e = json(['--environment', 'moon-equator', '--explain', 'all']);
  assert.ok(e.notes.length > 5 && e.notes.every((n: { note: string }) => n.note.length > 0));
  assert.ok(Array.isArray(e.parametersWithoutNote));
});

test('default summary carries the headline numbers and the reported-area check', () => {
  const s = json([]);
  for (const k of ['radiatorArea_m2', 'solarArrayArea_m2', 'solarArrayToRadiatorAreaRatio', 'mass_kg', 'temperatures_K', 'chain', 'warnings', 'changes']) assert.ok(k in s, k);
  assert.ok(s.reportedCheck.requiredFluid_K > 0);
  assert.deepEqual(s.changes, []);
});

test('--tornado ranks inputs and --format table renders without throwing', () => {
  const t = json(['--tornado']);
  assert.equal(t.tornado[0].metric, 'totalMass_kg');
  assert.ok(t.tornado[0].rows.length > 5);
  for (const a of [[], ['--list'], ['--compare'], ['--tornado'], ['--explain', 'all'], ['--share-out'], ['--sweep', 'radiator.emissivity=0.5:1:0.25']]) {
    const out = run([...a, '--format', 'table']);
    assert.equal(out.code, 0, out.stdout);
    assert.ok(!out.stdout.startsWith('{'), `table format printed JSON for ${a.join(' ')}`);
  }
});

test('conflicting or unknown options exit 2', () => {
  for (const a of [['--mode', 'warp'], ['--list', '--compare'], ['--bogus'], ['--format', 'xml'], ['--sweep', 'radiator.emissivity=1:0:0.1'], ['--share', 'x', '--mode', 'iss'], ['--metric', 'nonsense', '--tornado']]) {
    assert.equal(run(a).code, 2, a.join(' '));
  }
});
