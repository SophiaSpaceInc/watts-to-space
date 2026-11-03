/**
 * Import, export, and diff of assumption sets.
 *
 * An exported file is the whole Scenario plus a format tag, so it round-trips exactly
 * and stays readable in a diff. Import is a trust boundary (users share files), so
 * every field is checked for type and physical range before the model sees it.
 * Problems are reported as a list, not just the first.
 */
import { COOLANTS } from './constants.ts';
import { buildScenario, MODES } from './scenarios.ts';
import type { Scenario } from './types.ts';

export const SCENARIO_FORMAT = 'watts-to-space/scenario';
export const SCENARIO_VERSION = 1;

export function exportScenario(s: Scenario): string {
  return JSON.stringify({ format: SCENARIO_FORMAT, version: SCENARIO_VERSION, scenario: s }, null, 2);
}

export class ScenarioImportError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`Invalid assumption set:\n- ${problems.join('\n- ')}`);
    this.problems = problems;
  }
}

type Bag = Record<string, unknown>;
const isObj = (v: unknown): v is Bag => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Range rule for a number: [min, max], with optional exclusive minimum. */
interface Range {
  min: number;
  max: number;
  above?: boolean;
}
const R = (min: number, max: number, above = false): Range => ({ min, max, above });
const POSITIVE = R(0, Infinity, true);
const NON_NEGATIVE = R(0, Infinity);
const FRACTION = R(0, 1, true);
const TEMPERATURE = R(0, 5000, true);

class Checker {
  problems: string[] = [];
  num(obj: Bag, key: string, path: string, range: Range): void {
    const v = obj[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) return void this.problems.push(`${path}.${key} must be a finite number`);
    if (v < range.min || v > range.max || (range.above && v === range.min)) {
      this.problems.push(`${path}.${key} = ${v} is outside ${range.above ? '(' : '['}${range.min}, ${range.max}]`);
    }
  }
  oneOf(obj: Bag, key: string, path: string, allowed: readonly string[]): void {
    if (!allowed.includes(obj[key] as string)) this.problems.push(`${path}.${key} must be one of: ${allowed.join(', ')}`);
  }
  str(obj: Bag, key: string, path: string): void {
    if (typeof obj[key] !== 'string') this.problems.push(`${path}.${key} must be a string`);
  }
  obj(obj: Bag, key: string, path: string): Bag | null {
    const v = obj[key];
    if (isObj(v)) return v;
    this.problems.push(`${path}.${key} must be an object`);
    return null;
  }
}

const STAGE_FIELDS: Record<string, [string, Range][]> = {
  conduction: [['thickness_m', POSITIVE], ['conductivity_W_mK', POSITIVE], ['area_m2', POSITIVE]],
  interface: [['arealResistance_Km2_W', NON_NEGATIVE], ['area_m2', POSITIVE]],
  convection: [['h_W_m2K', POSITIVE], ['area_m2', POSITIVE]],
  resistance: [['resistance_K_W', NON_NEGATIVE]],
  deltaT: [['deltaT_K', NON_NEGATIVE]],
};

/**
 * Parse and validate an exported file (or a bare Scenario object).
 * @throws ScenarioImportError listing every problem found
 */
export function importScenario(text: string): Scenario {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new ScenarioImportError([`not valid JSON (${(e as Error).message})`]);
  }
  if (isObj(data) && 'format' in data) {
    if (data.format !== SCENARIO_FORMAT) throw new ScenarioImportError([`format must be "${SCENARIO_FORMAT}"`]);
    if (data.version !== SCENARIO_VERSION) throw new ScenarioImportError([`unsupported version ${String(data.version)}; this build reads version ${SCENARIO_VERSION}`]);
    data = data.scenario;
  }
  if (!isObj(data)) throw new ScenarioImportError(['scenario must be an object']);

  const c = new Checker();
  const s = data;
  c.oneOf(s, 'mode', 'scenario', Object.keys(MODES));
  for (const k of ['name', 'summary', 'heatSourceId', 'environmentId']) c.str(s, k, 'scenario');

  const hs = c.obj(s, 'heatSource', 'scenario');
  if (hs) {
    c.str(hs, 'name', 'heatSource');
    c.num(hs, 'maxTemperature_K', 'heatSource', TEMPERATURE);
    c.num(hs, 'unitPower_W', 'heatSource', POSITIVE);
    c.num(hs, 'totalPower_W', 'heatSource', POSITIVE);
    if (!Array.isArray(hs.stages)) c.problems.push('heatSource.stages must be an array');
    else
      hs.stages.forEach((st: unknown, i: number) => {
        const path = `heatSource.stages[${i}]`;
        if (!isObj(st)) return void c.problems.push(`${path} must be an object`);
        c.str(st, 'id', path);
        c.str(st, 'label', path);
        c.num(st, 'lengthScale_m', path, NON_NEGATIVE);
        if (st.factor !== undefined) c.num(st, 'factor', path, POSITIVE);
        const fields = STAGE_FIELDS[st.kind as string];
        if (!fields) return void c.problems.push(`${path}.kind must be one of: ${Object.keys(STAGE_FIELDS).join(', ')}`);
        for (const [k, range] of fields) c.num(st, k, path, range);
      });
  }

  const env = c.obj(s, 'environment', 'scenario');
  if (env) {
    c.oneOf(env, 'kind', 'environment', ['orbit', 'deepSpace', 'surface']);
    if (env.kind === 'orbit') {
      c.oneOf(env, 'body', 'environment', ['earth', 'moon']);
      c.num(env, 'altitude_km', 'environment', POSITIVE);
      c.num(env, 'beta_deg', 'environment', R(-90, 90));
    } else if (env.kind === 'deepSpace' || env.kind === 'surface') {
      c.num(env, 'sunlitFraction', 'environment', FRACTION);
      c.num(env, 'cyclePeriod_h', 'environment', POSITIVE);
    }
    if (env.kind === 'surface') {
      c.oneOf(env, 'body', 'environment', ['moon']);
      c.num(env, 'groundTemperature_K', 'environment', TEMPERATURE);
      c.num(env, 'groundEmissivity', 'environment', FRACTION);
      c.num(env, 'groundAlbedo', 'environment', R(0, 1));
      c.num(env, 'sunElevation_deg', 'environment', R(0, 90));
    }
  }

  const loop = c.obj(s, 'loop', 'scenario');
  if (loop) {
    c.oneOf(loop, 'coolant', 'loop', Object.keys(COOLANTS));
    for (const k of ['transportDrop_K', 'transportLength_m', 'hxApproach_K', 'rise_K']) c.num(loop, k, 'loop', NON_NEGATIVE);
    if (loop.coolantCap_K !== null) c.num(loop, 'coolantCap_K', 'loop', TEMPERATURE);
  }

  const rad = c.obj(s, 'radiator', 'scenario');
  if (rad) {
    c.oneOf(rad, 'orientation', 'radiator', ['edgeOn', 'nadirZenith', 'zenithOnly']);
    c.num(rad, 'emissivity', 'radiator', FRACTION);
    c.num(rad, 'solarAbsorptance', 'radiator', R(0, 1));
    c.num(rad, 'finEfficiency', 'radiator', FRACTION);
    c.num(rad, 'arealDensity_kg_m2', 'radiator', NON_NEGATIVE);
    c.num(rad, 'sizingMargin', 'radiator', POSITIVE);
    c.num(rad, 'loopSpecificMass_kg_per_kW', 'radiator', NON_NEGATIVE);
  }

  const pw = c.obj(s, 'power', 'scenario');
  if (pw) {
    for (const k of ['cellEfficiency', 'packingFactor', 'operatingFactor', 'conversionEfficiency']) c.num(pw, k, 'power', FRACTION);
    for (const k of ['overheadFraction', 'pumpFraction']) c.num(pw, k, 'power', R(0, 1));
    for (const k of ['solarArrayArealDensity_kg_m2', 'harnessOneWayLength_m']) c.num(pw, k, 'power', NON_NEGATIVE);
    for (const k of ['busVoltage_V', 'conductorArea_mm2']) c.num(pw, k, 'power', POSITIVE);
    const bat = c.obj(pw, 'battery', 'power');
    if (bat) {
      c.num(bat, 'roundTripEfficiency', 'power.battery', FRACTION);
      c.num(bat, 'depthOfDischarge', 'power.battery', FRACTION);
      c.num(bat, 'specificEnergy_Wh_kg', 'power.battery', POSITIVE);
    }
  }

  if (s.reported !== null && s.reported !== undefined) {
    if (!isObj(s.reported)) c.problems.push('scenario.reported must be null or an object');
    else c.num(s.reported, 'radiatorArea_m2', 'reported', POSITIVE);
  }
  const notes = s.notes ?? {};
  if (!isObj(notes) || Object.values(notes).some((v) => typeof v !== 'string')) c.problems.push('scenario.notes must map paths to strings');

  if (c.problems.length) throw new ScenarioImportError(c.problems);
  return { ...(s as unknown as Scenario), reported: (s.reported as Scenario['reported']) ?? null, notes: notes as Record<string, string> };
}

export interface Change {
  path: string;
  from: unknown;
  to: unknown;
}

/** Fields that describe the physics; labels and provenance notes are not "changes". */
const COMPARED: (keyof Scenario)[] = ['heatSourceId', 'environmentId', 'heatSource', 'environment', 'loop', 'radiator', 'power', 'reported'];

/** Leaf-level differences between two scenarios, as dot-paths. */
export function diffScenario(base: Scenario, current: Scenario): Change[] {
  const out: Change[] = [];
  const walk = (a: unknown, b: unknown, path: string) => {
    if ((isObj(a) && isObj(b)) || (Array.isArray(a) && Array.isArray(b))) {
      const keys = new Set([...Object.keys(a as Bag), ...Object.keys(b as Bag)]);
      for (const k of keys) walk((a as Bag)[k], (b as Bag)[k], Array.isArray(a) ? `${path}[${k}]` : `${path}.${k}`);
    } else if (a !== b) out.push({ path, from: a, to: b });
  };
  for (const key of COMPARED) walk(base[key], current[key], key);
  return out;
}

/** Changes relative to the scenario's own reference mode, as published. */
export function changesFromMode(s: Scenario): Change[] {
  return diffScenario(buildScenario(s.mode), s);
}
