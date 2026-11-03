/**
 * Moving energy over distance: electricity vs heat.
 *
 * The intuition this module makes quantitative: in copper, the same electrons carry
 * charge and heat (Wiedemann–Franz: κ/σ = L·T). So for the SAME conductor and power,
 *     fractional electrical drop = P·R / V²
 *     fractional thermal drop    = P·R / (L·T·ΔT_budget)
 * Conducting heat with a ΔT budget therefore behaves like distributing electricity at
 *     V_equivalent = √(L·T·ΔT_budget)   ≈ 20 mV for a 50 K budget.
 * Pumped loops escape this by carrying heat in moving mass. Distance then costs pump
 * work rather than temperature, much as high voltage makes a power line cheap.
 */
import { COPPER, LORENZ_W_OHM_K2 } from './constants.ts';
import type { Point } from './sensitivity.ts';

export function wiedemannFranzEquivalentVoltage(meanT_K: number, budget_K: number): number {
  return Math.sqrt(LORENZ_W_OHM_K2 * meanT_K * budget_K);
}

/** Fraction of power delivered through a two-wire copper run with lumped connector resistance. */
export function wireDeliveredFraction(a: { power_W: number; voltage_V: number; oneWayLength_m: number; conductorArea_mm2: number; connectors_ohm?: number }): number {
  const R = (COPPER.resistivity_ohm_m * 2 * a.oneWayLength_m) / (a.conductorArea_mm2 * 1e-6) + (a.connectors_ohm ?? 0);
  return 1 - (a.power_W * R) / a.voltage_V ** 2;
}

/** Temperature drop conducting `power_W` along a solid copper bar. */
export function copperBarDrop_K(a: { power_W: number; length_m: number; crossSection_m2: number }): number {
  return (a.power_W * a.length_m) / (COPPER.conductivity_W_mK * a.crossSection_m2);
}

/**
 * Pump power for a single-phase loop (round trip 2L) using Darcy–Weisbach with the
 * Blasius turbulent friction factor f = 0.316 Re^-0.25 (valid ~4e3 < Re < 1e5).
 * Only line friction is counted; cold plates and radiator passages add more.
 * Water properties near 320 K (NIST): ρ ≈ 990 kg/m³, μ ≈ 5.8e-4 Pa·s.
 */
export function pumpPower_W(a: {
  heat_W: number;
  rise_K: number;
  innerDiameter_m: number;
  oneWayLength_m: number;
  cp_J_kgK?: number;
  density_kg_m3?: number;
  viscosity_Pa_s?: number;
  pumpEfficiency?: number;
}): number {
  const cp = a.cp_J_kgK ?? 4180;
  const rho = a.density_kg_m3 ?? 990;
  const mu = a.viscosity_Pa_s ?? 5.8e-4;
  const mdot = a.heat_W / (cp * a.rise_K);
  const area = (Math.PI * a.innerDiameter_m ** 2) / 4;
  const v = mdot / (rho * area);
  const Re = (rho * v * a.innerDiameter_m) / mu;
  const f = Re < 2300 ? 64 / Re : 0.316 * Re ** -0.25;
  const dP = f * ((2 * a.oneWayLength_m) / a.innerDiameter_m) * (0.5 * rho * v ** 2);
  return (dP * (mdot / rho)) / (a.pumpEfficiency ?? 0.3);
}

export interface TransportInputs {
  distances_m: number[];
  busVoltage_V: number;
  conversionEfficiency: number;
  /** (T_radiating / T_source)⁴ of the current chain, deep-space sink. */
  loopEffectiveness: number;
  sourceMax_K: number;
  stackDrop_K: number;
  /** Loop drops after the source stack (transport, heat exchanger, glide). */
  loopFixedDrop_K: number;
  finEfficiency: number;
}

/**
 * Curves for the "energy over distance" chart, as % of ideal panel area doing useful
 * work for a reference 1 kW path, versus source-to-panel distance.
 */
export function transportCurves(p: TransportInputs): Record<'wire' | 'converted' | 'loop' | 'bar', Point[]> {
  const power_W = 1000;
  const wire = p.distances_m.map((d) => ({
    x: d,
    y: 100 * wireDeliveredFraction({ power_W, voltage_V: p.busVoltage_V, oneWayLength_m: d, conductorArea_mm2: 5.26, connectors_ohm: 4e-3 }),
  }));
  const converted = wire.map((pt) => ({ x: pt.x, y: pt.y * p.conversionEfficiency }));
  // Pumped loop: fixed interface drops; distance costs pump power (counted as extra heat).
  const loop = p.distances_m.map((d) => {
    const pump = pumpPower_W({ heat_W: power_W, rise_K: 5, innerDiameter_m: 0.008, oneWayLength_m: d });
    return { x: d, y: (100 * p.loopEffectiveness) / (1 + pump / power_W) };
  });
  // Solid copper bar 10 × 10 cm (≈90 kg/m) replacing the loop after the source stack.
  const bar = p.distances_m.map((d) => {
    const T = p.sourceMax_K - p.stackDrop_K - copperBarDrop_K({ power_W, length_m: d, crossSection_m2: 0.01 }) - p.loopFixedDrop_K;
    const Teq = Math.max(0, T) * p.finEfficiency ** 0.25;
    return { x: d, y: 100 * (Teq / p.sourceMax_K) ** 4 };
  });
  return { wire, converted, loop, bar };
}
