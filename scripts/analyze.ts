#!/usr/bin/env bun
/**
 * Analysis CLI for agents and humans: evaluate, sweep, compare, explain and share scenarios
 * using exactly the same model as the web page. No dependencies beyond the model.
 *
 *   bun run analyze -- --help
 *
 * All logic lives in the exported `run(argv)` so tests can call it without spawning a process.
 * Exit codes: 0 ok, 2 invalid input (every problem is listed).
 */
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { ENVIRONMENTS, HEAT_SOURCES, MODES, PARAMETERS, SOURCES, buildScenario } from '../src/model/scenarios.ts';
import { ScenarioImportError, COMPARED, diffScenario, exportScenario, importScenario, validateScenario, type Change, presetBaseline, overrideOf } from '../src/model/scenarioIO.ts';
import { decodeShareDetailed, encodeShare } from '../src/model/shareLink.ts';
import { EXPLANATIONS } from '../src/model/glossary.ts';

/** Notices about how the input was interpreted (e.g. a share link made against older presets). Reset per run. */
const NOTICES: string[] = [];
import { getPath, sweep, tornado, withPath, type TornadoSpec } from '../src/model/sensitivity.ts';
import { evaluateScenario, type Result } from '../src/model/system.ts';
import type { ModeId, Scenario } from '../src/model/types.ts';

export const DEFAULT_BASE_URL = 'https://watts-to-space.chrislewicki.com/';
const DEFAULT_SWEEP_METRICS = ['radiatorArea_m2', 'solarArrayArea_m2', 'totalMass_kg'];
const MAX_SWEEP_POINTS = 2000;
const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);

const HELP = `watts-to-space analysis CLI (same model as the web page)

Usage: bun run analyze [scenario selection] [action] [--format json|table]

Scenario selection (combinable; --set is applied last):
  --mode <id>             reference mode: iss | starmind | ideal | physics (default starmind)
  --heat-source <id>      heat-source preset (see --list)
  --environment <id>      environment preset (see --list)
  --scenario <file.json>  an exported scenario file (replaces the preset selection)
  --share <w2s1... | URL> a share string, or a full link containing ?s=
  --set <path>=<value>    override one input, repeatable (numbers, or strings such as ammonia;
                          "null" clears coolantCap_K). Example: --set radiator.emissivity=0.85

Actions (default: evaluate and summarise):
  --list                          modes, heat sources, environments and tunable parameters
  --sweep <path>=<a>:<b>:<step>   sweep one input, repeatable; with --metric <result.path>, repeatable
                                  (default metrics: ${DEFAULT_SWEEP_METRICS.join(', ')})
  --tornado [--metric <path>]     one-at-a-time sensitivity of each tunable input (default totalMass_kg)
  --compare                       the four reference modes side by side (overrides and --set apply to all)
  --explain <path|all>            value, unit, slider range, provenance note and source URLs
  --share-out [--base-url <url>]  share string and public link for the resulting scenario
  --export                        the resulting scenario as an exported JSON file (same as the page's Export; pipe to a file)

Output:
  --format json|table     json (default, for agents) or table (for humans)
  --help                  this text

Exit codes: 0 ok; 2 invalid input, with every problem listed.`;

class UsageError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(problems.join('\n'));
    this.problems = problems;
  }
}

type Json = unknown;
type Bag = Record<string, unknown>;
const isObj = (v: unknown): v is Bag => typeof v === 'object' && v !== null && !Array.isArray(v);

/** JSON with 6 significant digits; non-finite numbers become strings (JSON has no Infinity). */
function toJson(value: Json): string {
  return JSON.stringify(
    value,
    (_k, v) => {
      if (typeof v === 'number') return Number.isFinite(v) ? Number(v.toPrecision(6)) : String(v);
      return v;
    },
    2,
  );
}

// ---------------------------------------------------------------------------------
// Scenario selection
// ---------------------------------------------------------------------------------

function parseValue(raw: string): number | string | null {
  const t = raw.trim();
  if (t === 'null') return null;
  if (t !== '' && Number.isFinite(Number(t))) return Number(t);
  return t;
}

/** Does a dot-path exist in the object (a null leaf counts as existing)? */
function pathExists(obj: unknown, path: string): boolean {
  let cur: unknown = obj;
  for (const seg of path.split('.')) {
    if (cur === null || typeof cur !== 'object' || !(seg in (cur as Bag))) return false;
    cur = (cur as Bag)[seg];
  }
  return true;
}

function applySet(s: Scenario, assignments: string[]): Scenario {
  const problems: string[] = [];
  let out = s;
  for (const a of assignments) {
    const eq = a.indexOf('=');
    if (eq < 1) {
      problems.push(`--set "${a}" must look like <dot.path>=<value>`);
      continue;
    }
    const path = a.slice(0, eq).trim();
    const segs = path.split('.');
    if (!COMPARED.includes(segs[0] as keyof Scenario) || segs.some((g) => g === '' || FORBIDDEN.has(g))) {
      problems.push(`--set ${path}: not an input path (start with one of: ${COMPARED.join(', ')}; see --list)`);
      continue;
    }
    if (!pathExists(out, path)) {
      problems.push(`--set ${path}: no such field in this scenario (see --list, or --explain all)`);
      continue;
    }
    const value = parseValue(a.slice(eq + 1));
    const old = getPath(out, path);
    if (isObj(old) || Array.isArray(old)) {
      problems.push(`--set ${path}: this is a group, not a single value; set one of its fields`);
      continue;
    }
    if (old !== null && value !== null && typeof old !== typeof value) {
      problems.push(`--set ${path}: expected a ${typeof old}, got ${typeof value} "${String(value)}"`);
      continue;
    }
    out = withPath(out, path, value);
  }
  if (problems.length) throw new UsageError(problems);
  return out;
}

/** Throw a UsageError listing every validation problem. */
function checked(s: Scenario, label = ''): Scenario {
  try {
    return validateScenario(s);
  } catch (e) {
    if (e instanceof ScenarioImportError) throw new UsageError(e.problems.map((p) => (label ? `${label}: ${p}` : p)));
    throw e;
  }
}

function extractShare(input: string): string {
  const m = input.match(/[?&]s=([^&#\s]+)/);
  return m ? decodeURIComponent(m[1] as string) : input.trim();
}

interface Opts {
  mode?: string;
  'heat-source'?: string;
  environment?: string;
  scenario?: string;
  share?: string;
  set?: string[];
}

function oneOf(kind: string, id: string | undefined, allowed: string[]): string[] {
  return id === undefined || allowed.includes(id) ? [] : [`unknown ${kind} "${id}"; choose one of: ${allowed.join(', ')}`];
}

function selectionProblems(o: Opts): string[] {
  const problems = [
    ...oneOf('mode', o.mode, Object.keys(MODES)),
    ...oneOf('heat source', o['heat-source'], Object.keys(HEAT_SOURCES)),
    ...oneOf('environment', o.environment, Object.keys(ENVIRONMENTS)),
  ];
  const presetFlags = [o.mode, o['heat-source'], o.environment].some((v) => v !== undefined);
  if (o.scenario !== undefined && o.share !== undefined) problems.push('use either --scenario or --share, not both');
  if ((o.scenario !== undefined || o.share !== undefined) && presetFlags) {
    problems.push('--scenario / --share already fix the mode and presets; drop --mode, --heat-source and --environment (use --set to change inputs)');
  }
  return problems;
}

function selectScenario(o: Opts): Scenario {
  const bad = selectionProblems(o);
  if (bad.length) throw new UsageError(bad);
  let s: Scenario;
  if (o.scenario !== undefined) {
    let text: string;
    try {
      text = readFileSync(o.scenario, 'utf8');
    } catch (e) {
      throw new UsageError([`cannot read --scenario file "${o.scenario}": ${(e as Error).message}`]);
    }
    try {
      s = importScenario(text);
    } catch (e) {
      if (e instanceof ScenarioImportError) throw new UsageError(e.problems);
      throw e;
    }
  } else if (o.share !== undefined) {
    try {
      const decoded = decodeShareDetailed(extractShare(o.share));
      s = decoded.scenario;
      if (decoded.presetsChanged)
        NOTICES.push('This share link was made against different reference-case values (preset fingerprint mismatch). Values its author did not change come from the current presets, so results may differ from what they saw.');
      if (decoded.ignored.length) NOTICES.push(`This share link sets fields this version no longer has; they were dropped: ${decoded.ignored.join(', ')}.`);
    } catch (e) {
      if (e instanceof ScenarioImportError) throw new UsageError(e.problems);
      throw e;
    }
  } else {
    s = buildScenario((o.mode ?? 'starmind') as ModeId, { heatSource: o['heat-source'], environment: o.environment });
  }
  return checked(applySet(s, o.set ?? []));
}

// ---------------------------------------------------------------------------------
// Summaries
// ---------------------------------------------------------------------------------

/** Differences from the preset combination the scenario names (mode + its heat source + environment). */
function changesFromPresets(s: Scenario): Change[] {
  return diffScenario(presetBaseline(s), s).filter((c) => c.path !== 'heatSourceId' && c.path !== 'environmentId');
}

function presetNotes(s: Scenario): string[] {
  const ref = buildScenario(s.mode);
  const out: string[] = [];
  if (s.heatSourceId !== ref.heatSourceId) out.push(`heat source ${ref.heatSourceId} -> ${s.heatSourceId}`);
  if (s.environmentId !== ref.environmentId) out.push(`environment ${ref.environmentId} -> ${s.environmentId}`);
  return out;
}

function summarize(s: Scenario, r: Result): Bag {
  const envLabel = ENVIRONMENTS[s.environmentId]?.short ?? s.environmentId;
  return {
    scenario: {
      mode: s.mode,
      name: s.name,
      heatSource: s.heatSourceId,
      environment: s.environmentId,
      environmentLabel: envLabel,
      orientation: s.radiator.orientation,
      coolant: s.loop.coolant,
    },
    feasible: r.feasible,
    payloadPeak_W: r.payload_W,
    payloadAverage_W: r.payloadAverage_W,
    heatToReject_W: r.heatToReject_W,
    busLoadAverage_W: r.busLoadAverage_W,
    radiatorArea_m2: r.radiatorArea_m2,
    solarArrayArea_m2: r.solarArrayArea_m2,
    solarArrayToRadiatorAreaRatio: r.solarToRadiatorAreaRatio,
    mass_kg: { ...r.mass_kg, total: r.totalMass_kg },
    specificMass_kg_per_kW: r.specificMass_kg_per_kW,
    temperatures_K: {
      sourceLimit: s.heatSource.maxTemperature_K,
      sourceActual: r.chain.sourceActual_K,
      coolantHot: r.chain.coolantHot_K,
      radiatorIn: r.chain.radiatorIn_K,
      radiatorOut: r.chain.radiatorOut_K,
      radiatingEffective: r.chain.fluidEffective_K,
      radiatingAfterFin: r.chain.radiatingEquivalent_K,
    },
    sourceStackDrop_K: r.chain.stackDrop_K,
    chain: r.chain.steps.map((st) => ({ stage: st.label, T_K: st.T_K })),
    netFlux_W_m2: r.netFlux_W_m2,
    rejectionEffectiveness: r.rejectionEffectiveness,
    sunlight: r.sunlight,
    warnings: r.warnings,
    notices: [...NOTICES],
    reportedCheck: r.reportedCheck,
    presetChangesFromModeDefault: presetNotes(s),
    changes: changesFromPresets(s),
  };
}

function headline(s: Scenario, r: Result): string {
  const envLabel = ENVIRONMENTS[s.environmentId]?.short ?? s.environmentId;
  const ch = changesFromPresets(s);
  const mod = [...presetNotes(s), ...ch.slice(0, 6).map((c) => `${c.path} ${fmt(c.from)} -> ${fmt(c.to)}`)];
  if (ch.length > 6) mod.push(`+${ch.length - 6} more`);
  return (
    `${s.name} (${s.mode}), ${envLabel}, ${(r.heatToReject_W / 1000).toFixed(0)} kW rejected: ` +
    `radiator ${fmt(r.radiatorArea_m2)} m², solar array ${fmt(r.solarArrayArea_m2)} m², total ${fmt(r.totalMass_kg)} kg` +
    (mod.length ? `. Changes: ${mod.join('; ')}` : '. Unmodified reference.')
  );
}

// ---------------------------------------------------------------------------------
// Table rendering
// ---------------------------------------------------------------------------------

function fmt(v: unknown): string {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return String(v);
    const a = Math.abs(v);
    return a !== 0 && (a >= 1e6 || a < 1e-3) ? v.toExponential(3) : String(Number(v.toPrecision(5)));
  }
  if (v === null || v === undefined) return '-';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function grid(headers: string[], rows: unknown[][]): string {
  const cells = [headers, ...rows.map((r) => r.map(fmt))];
  const widths = headers.map((_, i) => Math.max(...cells.map((r) => (r[i] ?? '').length)));
  const line = (r: string[]) => r.map((c, i) => c.padEnd(widths[i] ?? 0)).join('  ').trimEnd();
  return [line(cells[0] as string[]), line(widths.map((w) => '-'.repeat(w))), ...cells.slice(1).map(line)].join('\n');
}

function kv(rows: [string, unknown][]): string {
  const w = Math.max(...rows.map(([k]) => k.length));
  return rows.map(([k, v]) => `${k.padEnd(w)}  ${fmt(v)}`).join('\n');
}

function summaryTable(sum: Bag, s: Scenario, r: Result): string {
  const t = sum.temperatures_K as Record<string, number>;
  const m = r.mass_kg;
  const parts = [
    `${s.name} (${s.mode}) | heat source ${s.heatSourceId} | environment ${s.environmentId}`,
    kv([
      ['Heat to reject (W)', r.heatToReject_W],
      ['Radiator area (m2)', r.radiatorArea_m2],
      ['Solar array area (m2)', r.solarArrayArea_m2],
      ['Solar array : radiator area', r.solarToRadiatorAreaRatio],
      ['Total mass (kg)', r.totalMass_kg],
      ['Specific mass (kg/kW)', r.specificMass_kg_per_kW],
      ['Net flux (W/m2 of panel)', r.netFlux_W_m2],
      ['Rejection effectiveness', r.rejectionEffectiveness],
      ['Sunlit fraction', r.sunlight.sunlitFraction],
    ]),
    '\nMass breakdown (kg)',
    grid(['part', 'kg'], [...Object.entries(m), ['total', r.totalMass_kg]]),
    '\nTemperature staircase (K)',
    grid(['stage', 'T_K'], (sum.chain as { stage: string; T_K: number }[]).map((c) => [c.stage, c.T_K])),
    `\nCoolant hot ${fmt(t.coolantHot)} K | radiating (T4-mean) ${fmt(t.radiatingEffective)} K | source-stack drop ${fmt(r.chain.stackDrop_K)} K`,
  ];
  if (r.reportedCheck) {
    const c = r.reportedCheck;
    parts.push(
      `\nReported-area check: ${fmt(c.radiatorArea_m2)} m2 needs ${fmt(c.target_W_m2)} W/m2, i.e. radiating fluid at ${fmt(c.requiredFluid_K)} K (model ${fmt(c.modelFluid_K)} K); chain budget left ${fmt(c.budgetLeft_K)} K vs model chain drop ${fmt(c.modelChainDrop_K)} K; at the average load it needs ${fmt(c.targetAverage_W_m2)} W/m2, fluid ${fmt(c.requiredFluidAverage_K)} K${c.vehicleMass_kg ? `; published kW/ton implies a ${fmt(c.vehicleMass_kg)} kg vehicle, of which this model's power and thermal hardware is ${fmt(100 * (c.powerThermalShareOfVehicle ?? 0))} %` : ''}`,
    );
  }
  for (const w of r.warnings) parts.push(`${w.level.toUpperCase()}: ${w.text}`);
  for (const n of NOTICES) parts.push(`NOTICE: ${n}`);
  const ch = sum.changes as Change[];
  parts.push(ch.length || (sum.presetChangesFromModeDefault as string[]).length ? '\nChanges from the reference' : '\nNo changes from the reference.');
  for (const n of sum.presetChangesFromModeDefault as string[]) parts.push(`  ${n}`);
  for (const c of ch) parts.push(`  ${c.path}: ${fmt(c.from)} -> ${fmt(c.to)}`);
  return parts.join('\n');
}

// ---------------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------------

/** Units of the stored value: the page shows some inputs scaled (W as kW), the CLI never does. */
const storedUnit = (p: { unit: string; display?: number }): string => (p.display && p.unit === 'kW' ? 'W' : p.unit);

function listAll(): Bag {
  return {
    modes: Object.entries(MODES).map(([id, m]) => ({ id, label: m.name, defaultHeatSource: m.heatSource, defaultEnvironment: m.environment })),
    heatSources: Object.entries(HEAT_SOURCES).map(([id, h]) => ({ id, label: h.label })),
    environments: Object.entries(ENVIRONMENTS).map(([id, e]) => ({ id, label: e.label, short: e.short })),
    parameters: PARAMETERS.map((p) => ({ path: p.path, label: p.label, unit: storedUnit(p), min: p.min, max: p.max, part: p.part, group: p.group, ...(p.display ? { pageShowsAs: p.unit } : {}) })),
  };
}

function listTable(l: Bag): string {
  const rows = (k: string) => l[k] as Bag[];
  return [
    'Modes',
    grid(['id', 'label'], rows('modes').map((m) => [m.id, m.label])),
    '\nHeat sources',
    grid(['id', 'label'], rows('heatSources').map((m) => [m.id, m.label])),
    '\nEnvironments',
    grid(['id', 'label'], rows('environments').map((m) => [m.id, m.label])),
    '\nParameters',
    grid(['path', 'label', 'unit', 'min', 'max', 'part', 'group'], rows('parameters').map((p) => [p.path, p.label, p.unit, p.min, p.max, p.part, p.group])),
  ].join('\n');
}

function parseSweep(spec: string): { path: string; values: number[] } {
  const m = spec.match(/^([^=]+)=(-?[\d.eE+-]+):(-?[\d.eE+-]+):(-?[\d.eE+-]+)$/);
  if (!m) throw new UsageError([`--sweep "${spec}" must look like <dot.path>=<start>:<end>:<step>`]);
  const [, path = '', a, b, c] = m;
  const [start, end, step] = [Number(a), Number(b), Number(c)];
  if (![start, end, step].every(Number.isFinite) || step <= 0 || end < start) {
    throw new UsageError([`--sweep "${spec}": need numeric start <= end and step > 0`]);
  }
  const n = Math.floor((end - start) / step + 1e-9) + 1;
  if (n > MAX_SWEEP_POINTS) throw new UsageError([`--sweep "${spec}": ${n} points; the limit is ${MAX_SWEEP_POINTS}`]);
  return { path: path.trim(), values: Array.from({ length: n }, (_, i) => Number((start + i * step).toPrecision(12))) };
}

function metricProblems(r: Result, metrics: string[]): string[] {
  return metrics.filter((p) => typeof getPath(r, p) !== 'number').map((p) => `--metric ${p}: not a numeric field of the result (try radiatorArea_m2, solarArrayArea_m2, totalMass_kg, specificMass_kg_per_kW, mass_kg.battery, chain.fluidEffective_K)`);
}

function doSweeps(s: Scenario, specs: string[], metrics: string[]): Bag {
  const r0 = evaluateScenario(s);
  const problems = metricProblems(r0, metrics);
  const plans = specs.map((spec) => {
    try {
      const p = parseSweep(spec);
      if (!pathExists(s, p.path) || typeof getPath(s, p.path) !== 'number') problems.push(`--sweep ${p.path}: not a numeric input of this scenario`);
      return p;
    } catch (e) {
      if (e instanceof UsageError) problems.push(...e.problems);
      else throw e;
      return null;
    }
  });
  if (problems.length) throw new UsageError(problems);
  const out = (plans as { path: string; values: number[] }[]).map(({ path, values }) => {
    const cols = metrics.map((m) => sweep(s, path, values, (r) => getPath(r, m) as number));
    const sweepProblems: string[] = [];
    for (const x of values) {
      try {
        validateScenario(withPath(s, path, x));
      } catch (e) {
        if (e instanceof ScenarioImportError) sweepProblems.push(`${path}=${x}: ${e.problems.join('; ')}`);
      }
    }
    if (sweepProblems.length) throw new UsageError(sweepProblems);
    const param = PARAMETERS.find((p) => p.path === path);
    return {
      path,
      unit: param ? storedUnit(param) : null,
      baseline: getPath(s, path),
      metrics,
      points: values.map((x, i) => ({ [path]: x, ...Object.fromEntries(metrics.map((m, j) => [m, (cols[j] as { y: number }[])[i]?.y])) })),
    };
  });
  return { sweeps: out };
}

function doTornado(s: Scenario, metrics: string[]): Bag {
  const r0 = evaluateScenario(s);
  const problems = metricProblems(r0, metrics);
  if (problems.length) throw new UsageError(problems);
  const specs: TornadoSpec[] = PARAMETERS.filter((p) => p.tornadoStep !== undefined && (!p.when || p.when(s))).map((p) => ({
    path: p.path,
    label: p.label,
    step: p.tornadoStep as number,
    relative: p.relative,
    min: p.min,
    max: p.max,
  }));
  return {
    note: 'Each row perturbs one input down and up by its own step, holding the rest at baseline; values are % change of the metric. Sorted by largest swing.',
    tornado: metrics.map((metric) => ({
      metric,
      baseline: getPath(r0, metric),
      rows: tornado(s, specs, (r) => getPath(r, metric) as number).map((t) => ({ ...t, step: specs.find((x) => x.path === t.path)?.step, relative: specs.find((x) => x.path === t.path)?.relative ?? false })),
    })),
  };
}

const COMPARE_FIELDS = ['radiatorArea_m2', 'solarArrayArea_m2', 'solarToRadiatorAreaRatio', 'totalMass_kg', 'specificMass_kg_per_kW', 'rejectionEffectiveness', 'netFlux_W_m2'] as const;

function doCompare(o: Opts): Bag {
  if (o.scenario !== undefined || o.share !== undefined || o.mode !== undefined) {
    throw new UsageError(['--compare runs all four reference modes; drop --mode, --scenario and --share (--heat-source, --environment and --set apply to every mode)']);
  }
  const bad = selectionProblems(o);
  if (bad.length) throw new UsageError(bad);
  const modes = (Object.keys(MODES) as ModeId[]).map((id) => {
    const s = checked(applySet(buildScenario(id, { heatSource: o['heat-source'], environment: o.environment }), o.set ?? []), id);
    const r = evaluateScenario(s);
    return {
      mode: id,
      name: s.name,
      heatSource: s.heatSourceId,
      environment: s.environmentId,
      feasible: r.feasible,
      ...Object.fromEntries(COMPARE_FIELDS.map((f) => [f, r[f]])),
      solarArrayToRadiatorAreaRatio: r.solarToRadiatorAreaRatio,
      coolantHot_K: r.chain.coolantHot_K,
      radiatingEffective_K: r.chain.fluidEffective_K,
      sourceStackDrop_K: r.chain.stackDrop_K,
      warnings: r.warnings.map((w) => `${w.level}: ${w.text}`),
    } as Bag;
  });
  return { modes };
}

function sourcesIn(note: string) {
  return [...note.matchAll(/\[([a-z0-9-]+)\]/g)].map((m) => m[1] as string).filter((id, i, a) => a.indexOf(id) === i).map((id) => ({ id, title: SOURCES[id]?.title ?? null, url: SOURCES[id]?.url ?? null }));
}

function tagOf(note: string): string[] {
  return ['ASSUMPTION', 'CALIBRATED', 'SECONDARY'].filter((t) => note.includes(t)).concat(sourcesIn(note).map((x) => `[${x.id}]`));
}

/** A user override is reported with the reference value its note actually describes. */
function overrideFields(s: Scenario, path: string, note: string | null): Bag {
  const o = overrideOf(s, path);
  if (!o.overridden) return { overridden: false };
  return {
    overridden: true,
    referenceValue: o.referenceValue ?? null,
    ...(note ? { overrideWarning: `This value was changed from the reference (${JSON.stringify(o.referenceValue)}). The note and sources describe the reference value, not this one.` } : {}),
  };
}

function explainOne(s: Scenario, path: string, lenient = false): Bag {
  if (!lenient && !pathExists(s, path)) throw new UsageError([`--explain ${path}: no such field in this scenario (try --explain all, or --list for parameter paths)`]);
  const segs = path.split('.');
  let key: string | null = null;
  for (let n = segs.length; n > 0; n--) {
    const k = segs.slice(0, n).join('.');
    if (s.notes[k] !== undefined) {
      key = k;
      break;
    }
  }
  const note = key ? (s.notes[key] as string) : null;
  const param = PARAMETERS.find((p) => p.path === path);
  return {
    path,
    value: getPath(s, path) ?? null,
    unit: param ? storedUnit(param) : null,
    sliderRange: param ? { min: param.min, max: param.max, step: param.step } : null,
    part: param?.part ?? null,
    label: param?.label ?? null,
    explanation: EXPLANATIONS[path] ?? null,
    ...overrideFields(s, path, note),
    note,
    noteAppliesTo: key,
    tags: note ? tagOf(note) : [],
    sources: note ? sourcesIn(note) : [],
    documented: note !== null,
    ...(note === null ? { warning: 'No provenance note: an undocumented assumption. Do not present it as sourced.' } : {}),
  };
}

function doExplain(s: Scenario, path: string): Bag {
  if (path !== 'all') return explainOne(s, path);
  const keys = Object.keys(s.notes).sort();
  const undocumented = PARAMETERS.filter((p) => (!p.when || p.when(s)) && explainOne(s, p.path).note === null).map((p) => p.path);
  return { notes: keys.map((k) => explainOne(s, k, true)), parametersWithoutNote: undocumented };
}

function explainTable(e: Bag): string {
  const one = (x: Bag) =>
    [
      `${x.path} = ${fmt(x.value)}${x.unit ? ` ${x.unit}` : ''}${x.sliderRange ? `  (slider ${fmt((x.sliderRange as Bag).min)} to ${fmt((x.sliderRange as Bag).max)})` : ''}`,
      ...(x.explanation ? [`  meaning: ${x.explanation}`] : []),
      ...(x.overridden ? [`  OVERRIDE: changed from the reference ${fmt(x.referenceValue)}; the note below describes the reference value`] : []),
      x.note ? `  note: ${x.note}` : `  ${x.warning}`,
      ...(x.sources as { id: string; url: string | null }[]).map((src) => `  source [${src.id}]: ${src.url}`),
    ].join('\n');
  return e.notes ? [...(e.notes as Bag[]).map(one), `\nParameters with no note: ${fmt(e.parametersWithoutNote)}`].join('\n\n') : one(e);
}

function compareTable(c: Bag): string {
  const modes = c.modes as Bag[];
  const rows: [string, string][] = [
    ['Radiator area (m2)', 'radiatorArea_m2'],
    ['Solar array area (m2)', 'solarArrayArea_m2'],
    ['Solar array : radiator', 'solarArrayToRadiatorAreaRatio'],
    ['Total mass (kg)', 'totalMass_kg'],
    ['Specific mass (kg/kW)', 'specificMass_kg_per_kW'],
    ['Coolant hot (K)', 'coolantHot_K'],
    ['Radiating T4-mean (K)', 'radiatingEffective_K'],
    ['Source-stack drop (K)', 'sourceStackDrop_K'],
    ['Rejection effectiveness', 'rejectionEffectiveness'],
  ];
  return grid(['', ...modes.map((m) => String(m.mode))], [['heat source', ...modes.map((m) => m.heatSource)], ['environment', ...modes.map((m) => m.environment)], ...rows.map(([l, k]) => [l, ...modes.map((m) => m[k])])]);
}

function sweepTable(o: Bag): string {
  return (o.sweeps as { path: string; unit: string | null; metrics: string[]; points: Bag[] }[])
    .map((sw) => `Sweep ${sw.path}${sw.unit ? ` (${sw.unit})` : ''}\n` + grid([sw.path, ...sw.metrics], sw.points.map((p) => [p[sw.path], ...sw.metrics.map((m) => p[m])])))
    .join('\n\n');
}

function tornadoTable(o: Bag): string {
  return (o.tornado as { metric: string; baseline: number; rows: Bag[] }[])
    .map((t) => `Tornado on ${t.metric} (baseline ${fmt(t.baseline)})\n` + grid(['input', 'low', 'high', 'low %', 'high %'], t.rows.map((r) => [r.path, r.lowValue, r.highValue, r.lowPct, r.highPct])))
    .join('\n\n');
}

// ---------------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------------

export function run(argv: string[]): { stdout: string; code: number } {
  NOTICES.length = 0;
  try {
    return { stdout: dispatch(argv), code: 0 };
  } catch (e) {
    if (e instanceof UsageError) return { stdout: toJson({ error: 'invalid input', problems: e.problems }), code: 2 };
    if (e instanceof Error && 'code' in e && String((e as { code: unknown }).code).startsWith('ERR_PARSE_ARGS')) {
      return { stdout: toJson({ error: 'invalid input', problems: [e.message, 'see --help'] }), code: 2 };
    }
    throw e;
  }
}

function dispatch(argv: string[]): string {
  const { values: v } = parseArgs({
    args: argv,
    allowPositionals: false,
    options: {
      list: { type: 'boolean' },
      mode: { type: 'string' },
      'heat-source': { type: 'string' },
      environment: { type: 'string' },
      scenario: { type: 'string' },
      share: { type: 'string' },
      set: { type: 'string', multiple: true },
      sweep: { type: 'string', multiple: true },
      metric: { type: 'string', multiple: true },
      tornado: { type: 'boolean' },
      compare: { type: 'boolean' },
      explain: { type: 'string' },
      'share-out': { type: 'boolean' },
      export: { type: 'boolean' },
      'base-url': { type: 'string' },
      format: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (v.help) return HELP;
  const format = v.format ?? 'json';
  if (format !== 'json' && format !== 'table') throw new UsageError([`--format must be json or table, got "${format}"`]);
  const table = format === 'table';
  const show = (data: Bag, text: () => string) => (table ? text() : toJson(data));

  const actions = [v.list, v.sweep?.length, v.tornado, v.compare, v.explain !== undefined, v['share-out'], v.export].filter(Boolean).length;
  if (actions > 1) throw new UsageError(['choose one action: --list, --sweep, --tornado, --compare, --explain, --share-out or --export']);
  if (v['base-url'] !== undefined && !v['share-out']) throw new UsageError(['--base-url only applies with --share-out']);
  if (v.metric && !v.sweep?.length && !v.tornado) throw new UsageError(['--metric only applies with --sweep or --tornado']);

  if (v.list) {
    const l = listAll();
    return show(l, () => listTable(l));
  }
  const o: Opts = { mode: v.mode, 'heat-source': v['heat-source'], environment: v.environment, scenario: v.scenario, share: v.share, set: v.set };
  if (v.compare) {
    const c = doCompare(o);
    return show(c, () => compareTable(c));
  }
  const s = selectScenario(o);
  if (v.explain !== undefined) {
    const e = doExplain(s, v.explain);
    return show(e, () => explainTable(e));
  }
  if (v.sweep?.length) {
    const out = doSweeps(s, v.sweep, v.metric?.length ? v.metric : DEFAULT_SWEEP_METRICS);
    return show(out, () => sweepTable(out));
  }
  if (v.tornado) {
    const out = doTornado(s, v.metric?.length ? v.metric : ['totalMass_kg']);
    return show(out, () => tornadoTable(out));
  }
  if (v.export) return exportScenario(s);
  const r = evaluateScenario(s);
  if (v['share-out']) {
    const share = encodeShare(s);
    const base = (v['base-url'] ?? DEFAULT_BASE_URL).replace(/[?#].*$/, '');
    const out = { share, url: `${base}?s=${share}`, headline: headline(s, r), changes: changesFromPresets(s), presetChangesFromModeDefault: presetNotes(s) };
    return show(out, () => [`Share string\n${out.share}`, `\nLink\n${out.url}`, `\nSuggested post\n${out.headline}`, '\nChanges', ...(out.changes.length ? out.changes.map((c) => `  ${c.path}: ${fmt(c.from)} -> ${fmt(c.to)}`) : ['  none (beyond the presets)'])].join('\n'));
  }
  const sum = summarize(s, r);
  return show(sum, () => summaryTable(sum, s, r));
}

if (import.meta.main) {
  const { stdout, code } = run(process.argv.slice(2));
  (code === 0 ? process.stdout : process.stderr).write(`${stdout}\n`);
  process.exitCode = code;
}
