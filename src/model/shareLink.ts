/**
 * Share links: a whole scenario as one short, versioned, checksummed string that fits
 * in a URL query (`?s=...`), for posting a case publicly or handing it to an agent.
 *
 * Format:   w2s1.<payload>.<check>
 *   w2s1     format and version. Bump the digit if the meaning of an encoded field changes.
 *   payload  base64url(UTF-8 JSON) of { m, h?, e?, d? }:
 *              m  reference mode id
 *              h  heat-source preset id (only if not the mode's default)
 *              e  environment preset id (only if not the mode's default)
 *              d  { dot.path: value } for every value that differs from that preset
 *                 combination. The source stack and environment travel whole when edited,
 *                 because their shape can change.
 *              p  fingerprint of the reference-case values the link was made against
 *   check    8 hex digits of FNV-1a over the payload, to catch truncated or mangled links.
 *
 * Configuration control: a link stores differences from the presets, not the preset values,
 * so it stays short. If a preset value is later corrected, an old link would quietly evaluate
 * differently. The fingerprint `p` detects that: decoding still works, and reports
 * `presetsChanged` so the page and the CLI can warn.
 *
 * Decoding rebuilds the presets, applies `d`, and runs the same validation as file import,
 * so a share link is exactly as trustworthy as an imported file. Provenance notes are not
 * carried: they come from the presets.
 */
import { buildScenario, ENVIRONMENTS, HEAT_SOURCES, MODES } from './scenarios.ts';
import { COMPARED, diffScenario, ScenarioImportError, validateScenario } from './scenarioIO.ts';
import { getPath, withPath } from './sensitivity.ts';
import type { ModeId, Scenario } from './types.ts';

export const SHARE_PREFIX = 'w2s1';
const MAX_SHARE_LENGTH = 8000;
/** Edited as a whole: their shape (stage count, environment kind) can change. */
const WHOLE = ['heatSource.stages', 'environment'];

interface Payload {
  m: ModeId;
  p?: string;
  h?: string;
  e?: string;
  d?: Record<string, unknown>;
}

/** 32-bit FNV-1a, hex. Integrity check only, not security. */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Keys that describe presets without changing any number the model uses. */
const DESCRIPTIVE = new Set(['notes', 'label', 'short', 'summary', 'name']);

/** Fingerprint of the physics content of every preset (labels, summaries and notes excluded). */
export function presetFingerprint(): string {
  return fnv1a(JSON.stringify({ MODES, HEAT_SOURCES, ENVIRONMENTS }, (key, value) => (DESCRIPTIVE.has(key) ? undefined : value)));
}

function toBase64Url(text: string): string {
  let bin = '';
  for (const byte of new TextEncoder().encode(text)) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64: string): string {
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** The preset combination a scenario starts from: mode, plus preset ids it can name. */
function baseFor(s: Pick<Scenario, 'mode' | 'heatSourceId' | 'environmentId'>): Scenario {
  return buildScenario(s.mode, {
    heatSource: HEAT_SOURCES[s.heatSourceId] ? s.heatSourceId : undefined,
    environment: ENVIRONMENTS[s.environmentId] ? s.environmentId : undefined,
  });
}

export function encodeShare(s: Scenario): string {
  const payload: Payload = { m: s.mode, p: presetFingerprint() };
  const modeDefault = buildScenario(s.mode);
  if (s.heatSourceId !== modeDefault.heatSourceId) payload.h = s.heatSourceId;
  if (s.environmentId !== modeDefault.environmentId) payload.e = s.environmentId;
  const d: Record<string, unknown> = {};
  for (const change of diffScenario(baseFor(s), s)) {
    const path = change.path.replace(/\[(\d+)\]/g, '.$1');
    if (path === 'heatSourceId' || path === 'environmentId') continue; // carried in h / e
    const whole = WHOLE.find((w) => path === w || path.startsWith(`${w}.`));
    if (whole) d[whole] = getPath(s, whole);
    else d[path] = change.to;
  }
  if (Object.keys(d).length) payload.d = d;
  const body = toBase64Url(JSON.stringify(payload));
  return `${SHARE_PREFIX}.${body}.${fnv1a(body)}`;
}

const SAFE_SEGMENT = /^(?:[A-Za-z_][A-Za-z0-9_]*|\d+)$/;
const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);

export interface DecodedShare {
  scenario: Scenario;
  /** The link was made against different reference-case values than this build's. */
  presetsChanged: boolean;
  /** Settings the link carries that this version of the model no longer has; they were dropped. */
  ignored: string[];
}

/**
 * @throws ScenarioImportError if the string is malformed, tampered, from another
 *   version, or decodes to a scenario that fails validation
 */
export function decodeShare(share: string): Scenario {
  return decodeShareDetailed(share).scenario;
}

export function decodeShareDetailed(share: string): DecodedShare {
  const text = share.trim();
  if (text.length > MAX_SHARE_LENGTH) throw new ScenarioImportError([`share string is ${text.length} characters; the limit is ${MAX_SHARE_LENGTH}`]);
  const parts = text.split('.');
  if (parts.length !== 3) throw new ScenarioImportError([`share string must look like ${SHARE_PREFIX}.<payload>.<check>`]);
  const [prefix, body = '', check] = parts;
  if (prefix !== SHARE_PREFIX) throw new ScenarioImportError([`unsupported share format "${prefix}"; this build reads ${SHARE_PREFIX}`]);
  if (fnv1a(body) !== check) throw new ScenarioImportError(['share string is damaged (checksum mismatch); copy the whole link again']);

  let payload: Payload;
  try {
    payload = JSON.parse(fromBase64Url(body)) as Payload;
  } catch {
    throw new ScenarioImportError(['share string payload is not readable']);
  }
  if (!payload || typeof payload !== 'object' || !(payload.m in MODES)) throw new ScenarioImportError(['share string names an unknown reference mode']);

  let s = buildScenario(payload.m, {
    heatSource: payload.h && HEAT_SOURCES[payload.h] ? payload.h : undefined,
    environment: payload.e && ENVIRONMENTS[payload.e] ? payload.e : undefined,
  });
  if (payload.h) s = { ...s, heatSourceId: payload.h };
  if (payload.e) s = { ...s, environmentId: payload.e };

  const problems: string[] = [];
  const ignored: string[] = [];
  for (const [path, value] of Object.entries(payload.d ?? {})) {
    const segments = path.split('.');
    if (!COMPARED.includes(segments[0] as keyof Scenario) || segments.some((seg) => !SAFE_SEGMENT.test(seg) || FORBIDDEN.has(seg))) {
      problems.push(`share string sets an unknown field "${path}"`);
      continue;
    }
    // A field this version no longer has (e.g. renamed by a model update): drop it and say so,
    // rather than carrying a stray value. Whole sections are replaced, so they are exempt.
    const whole = WHOLE.some((w) => path === w || path.startsWith(`${w}.`)) || path === 'reported';
    if (!whole && getPath(s, path) === undefined) {
      ignored.push(path);
      continue;
    }
    try {
      s = withPath(s, path, value);
    } catch {
      problems.push(`share string sets "${path}", which does not exist here`);
    }
  }
  if (problems.length) throw new ScenarioImportError(problems);
  return { scenario: validateScenario(s), presetsChanged: payload.p !== undefined && payload.p !== presetFingerprint(), ignored };
}
