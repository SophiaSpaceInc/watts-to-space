/**
 * The "watts per kilogram" sister page: the thermal figure of merit, heat rejected per kg of
 * radiator and pumped loop, as a function of radiator temperature and mass.
 *
 * Per m² of two-sided panel radiating at T: heat q (W/m², set by physics), radiator mass m_A
 * (kg/m², set by engineering), and pumps and plumbing m_P per watt carried. So
 *     W/kg = q / (m_A + q · m_P)
 * which can never exceed 1 / m_P however light the panel. The panel is knife-edge to the Sun
 * and edge-on to Earth in a dawn-dusk orbit (sunward.ts), at one temperature, with no sizing margin.
 */
import { sunwardBudget } from './sunward.ts';

export interface SpecificInputs {
  T_K: number;
  emissivity: number;
  /** Radiator panel mass per m², kg/m². */
  arealDensity_kg_m2: number;
  /** Pumps, accumulators, valves and joints per kW carried, kg/kW. */
  loop_kg_per_kW: number;
  altitude_km: number;
}

/** Net heat a two-sided panel at T rejects per m², knife-edge to the Sun, W/m². */
export function panelFlux_W_m2(i: Pick<SpecificInputs, 'T_K' | 'emissivity' | 'altitude_km'>): number {
  return sunwardBudget({ T_K: i.T_K, emissivity: i.emissivity, solarAbsorptance: 0.2, sunAngle_deg: 90, altitude_km: i.altitude_km }).net;
}

export function wattsPerKg(i: SpecificInputs): number {
  const q = panelFlux_W_m2(i);
  return q / (i.arealDensity_kg_m2 + (q * i.loop_kg_per_kW) / 1000);
}

/** Radiator mass per m² that just reaches `level` W/kg at flux q; null if the loop alone rules it out. */
export function arealDensityFor_kg_m2(level_W_kg: number, q_W_m2: number, loop_kg_per_kW: number): number | null {
  const m = q_W_m2 * (1 / level_W_kg - loop_kg_per_kW / 1000);
  return m > 0 ? m : null;
}

/** The most any radiator can reach with this much pump and loop mass, W/kg. */
export function loopCeiling_W_kg(loop_kg_per_kW: number): number {
  return loop_kg_per_kW > 0 ? 1000 / loop_kg_per_kW : Infinity;
}
