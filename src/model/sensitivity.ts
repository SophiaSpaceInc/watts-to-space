/**
 * Sweeps and one-at-a-time sensitivities ("sensitivity slopes") on any scenario path.
 * Paths are dot strings into the scenario object, e.g. 'radiator.emissivity' or
 * 'heatSource.maxTemperature_K'.
 */
import { evaluateScenario, type Result } from './system.ts';
import type { Scenario } from './types.ts';

// Dot-paths are dynamic by design (sliders and tornado rows are data), so these two
// helpers are the one place that steps outside static typing.
type Bag = Record<string, unknown>;

export function getPath(obj: object, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o as Bag)?.[k], obj);
}

/** Copy with one value replaced (the input is never mutated). */
export function withPath<T extends object>(obj: T, path: string, value: unknown): T {
  const copy = structuredClone(obj);
  const keys = path.split('.');
  const last = keys.pop() as string;
  const parent = keys.reduce<Bag>((o, k) => o[k] as Bag, copy as Bag);
  parent[last] = value;
  return copy;
}

export interface Point {
  x: number;
  y: number;
}

/** Evaluate `metric(result)` across `values` of one parameter. */
export function sweep(scenario: Scenario, path: string, values: number[], metric: (r: Result) => number): Point[] {
  return values.map((x) => ({ x, y: metric(evaluateScenario(withPath(scenario, path, x))) }));
}

export interface TornadoSpec {
  path: string;
  label: string;
  /** ± step in stored units, or a fraction of the value when `relative`. */
  step: number;
  relative?: boolean;
  min?: number;
  max?: number;
}

export interface TornadoRow {
  label: string;
  path: string;
  lowValue: number;
  highValue: number;
  lowPct: number;
  highPct: number;
}

/**
 * Tornado data: perturb each parameter down and up by its own step, holding the rest
 * at baseline, and report the % change of `metric`. Steps are in natural units
 * (±10 K, ±0.05 emissivity, ±20 % areal density, ...). A relative step on a
 * temperature in kelvin would be meaningless.
 */
export function tornado(scenario: Scenario, specs: TornadoSpec[], metric: (r: Result) => number): TornadoRow[] {
  const base = metric(evaluateScenario(scenario));
  return specs
    .map((spec) => {
      const v = getPath(scenario, spec.path) as number;
      const d = spec.relative ? v * spec.step : spec.step;
      const clamp = (x: number) => Math.min(spec.max ?? Infinity, Math.max(spec.min ?? -Infinity, x));
      const lowValue = clamp(v - d);
      const highValue = clamp(v + d);
      const low = metric(evaluateScenario(withPath(scenario, spec.path, lowValue)));
      const high = metric(evaluateScenario(withPath(scenario, spec.path, highValue)));
      return {
        label: spec.label,
        path: spec.path,
        lowValue,
        highValue,
        lowPct: (100 * (low - base)) / base,
        highPct: (100 * (high - base)) / base,
      };
    })
    .filter((t) => Number.isFinite(t.lowPct) && Number.isFinite(t.highPct))
    .sort((a, b) => Math.max(Math.abs(b.lowPct), Math.abs(b.highPct)) - Math.max(Math.abs(a.lowPct), Math.abs(a.highPct)));
}
