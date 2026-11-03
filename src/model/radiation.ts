/**
 * Radiative heat rejection: the only way to dump heat in vacuum.
 *
 * Core law (Stefan–Boltzmann, gray diffuse surface):
 *     q_emit = ε σ (T⁴ − T_sink⁴)            [W/m² per radiating face]
 * The T⁴ is the whole story of this project: every kelvin lost between the heat
 * source and the radiator costs ≈ 4/T of radiator area (≈1.2 %/K near 330 K).
 *
 * Conventions: temperatures in K, fluxes in W/m², "panel area" = planform area of a
 * radiator panel (one side). A two-sided panel has two faces.
 */
import { SIGMA, T_CMB_K } from './constants.ts';
import type { RadiatorSurface } from './types.ts';

type Emitter = Pick<RadiatorSurface, 'emissivity' | 'finEfficiency'>;

/** Hemispherical emitted flux of one gray face to a sink at `sink_K`. */
export function emittedFlux(T_K: number, emissivity = 1, sink_K = T_CMB_K): number {
  return emissivity * SIGMA * (T_K ** 4 - sink_K ** 4);
}

/**
 * Effective radiating temperature of a single-phase loop whose fluid cools linearly
 * from `in_K` to `out_K` along the radiator: the temperature whose T⁴ equals the
 * length-average of T⁴, i.e. T_eff⁴ = (T_in⁵ − T_out⁵) / (5 (T_in − T_out)).
 *
 * Because T⁴ is convex, T_eff sits slightly above the arithmetic mean. A two-phase
 * (condensing) loop is isothermal: pass in_K === out_K.
 * Assumption: linear temperature profile (real profiles are concave; first-order).
 */
export function t4MeanTemperature(in_K: number, out_K: number): number {
  if (Math.abs(in_K - out_K) < 1e-9) return in_K;
  const t4 = (in_K ** 5 - out_K ** 5) / (5 * (in_K - out_K));
  return t4 ** 0.25;
}

/**
 * Fin efficiency η (0–1) is the standard way to account for temperature falling from
 * the fluid tube across the radiator fin (Gilmore 2002, ch. 6). It multiplies the
 * emitted flux. Expressed as an equivalent temperature drop: T_eq = T_fluid · η^¼.
 */
export function finEquivalentTemperature(fluid_K: number, finEfficiency: number): number {
  return fluid_K * finEfficiency ** 0.25;
}

/**
 * Net rejection per unit panel area for a panel with several faces.
 * @param absorbedPerFace environmental flux absorbed by each face, W/m²
 * @returns W per m² of panel (can be negative: the environment wins)
 */
export function netRejectionPerPanelArea(fluid_K: number, surface: Emitter, absorbedPerFace: number[]): number {
  const emitted = surface.finEfficiency * emittedFlux(fluid_K, surface.emissivity);
  return absorbedPerFace.reduce((sum, absorbed) => sum + emitted - absorbed, 0);
}

/**
 * Inverse of `netRejectionPerPanelArea`: the fluid temperature needed to reject
 * `target_W_m2` per m² of panel. Used to back out what a reported radiator area implies.
 */
export function fluidTemperatureForRejection(target_W_m2: number, surface: Emitter, absorbedPerFace: number[]): number {
  const faces = absorbedPerFace.length;
  const absorbed = absorbedPerFace.reduce((a, b) => a + b, 0);
  const perFaceEmission = (target_W_m2 + absorbed) / faces;
  return (perFaceEmission / (surface.finEfficiency * surface.emissivity * SIGMA) + T_CMB_K ** 4) ** 0.25;
}

/**
 * The yardstick for "how good is this chain": a perfect two-sided black panel at the
 * heat source's own temperature, in empty deep space. Ratio to this = rejection
 * effectiveness, the thermal analogue of electrical transmission efficiency.
 */
export function idealRejectionPerPanelArea(source_K: number, faces = 2): number {
  return faces * emittedFlux(source_K, 1);
}
