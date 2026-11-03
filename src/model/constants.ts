/**
 * Physical constants and reference data.
 *
 * Rule for contributors: only *measured or defined* quantities live here, each with a
 * checkable source. Engineering assumptions (coating emissivity, areal densities,
 * sizing margins, ...) belong in `scenarios.ts`, where every value carries a
 * provenance note.
 */
import type { BodyId, CoolantId } from './types.ts';

/** Stefan–Boltzmann constant, W m⁻² K⁻⁴. Exact since the 2019 SI redefinition.
 *  Source: NIST CODATA, https://physics.nist.gov/cgi-bin/cuu/Value?sigma */
export const SIGMA = 5.670374419e-8;

/** Total solar irradiance at 1 AU, W/m².
 *  Source: Kopp & Lean (2011), Geophys. Res. Lett. 38, L01706, doi:10.1029/2010GL045777 */
export const SOLAR_CONSTANT_W_M2 = 1361;

/** Cosmic microwave background temperature, K — the true "sink" of deep space.
 *  Source: Fixsen (2009), ApJ 707, 916, doi:10.1088/0004-637X/707/2/916 */
export const T_CMB_K = 2.725;

/** Sommerfeld value of the Lorenz number L = κ/(σ_e T), W·Ω/K². Links a metal's
 *  thermal and electrical conductivity (Wiedemann–Franz law); measured values for
 *  copper near room temperature are ~2.2–2.4e-8.
 *  Source: Kittel, Introduction to Solid State Physics, ch. 6. */
export const LORENZ_W_OHM_K2 = 2.44e-8;

export interface Body {
  name: string;
  radius_km: number;
  mu_km3_s2: number;
  bondAlbedo: number;
  /** Emitted longwave flux at the surface / top of atmosphere, treated as uniform and diffuse. */
  infrared_W_m2: number;
}

/**
 * Bodies a radiator can "see". Radii, GM and Bond albedo from the NASA NSSDCA
 * planetary fact sheets: https://nssdc.gsfc.nasa.gov/planetary/factsheet/
 * The IR model is first-order and orbit-averaged.
 */
export const BODIES: Record<BodyId, Body> = {
  earth: {
    name: 'Earth',
    radius_km: 6371.0,
    mu_km3_s2: 398600.4418,
    bondAlbedo: 0.306,
    // CERES EBAF global annual-mean outgoing longwave radiation ≈ 240 W/m²
    // (Loeb et al. 2018, J. Climate 31, 895, doi:10.1175/JCLI-D-17-0208.1).
    // Spacecraft thermal practice uses 237 ± 21 W/m² with hot/cold cases
    // (Gilmore, Spacecraft Thermal Control Handbook Vol. I, 2nd ed., 2002, ch. 2).
    infrared_W_m2: 240,
  },
  moon: {
    name: 'Moon',
    radius_km: 1737.4,
    mu_km3_s2: 4902.8,
    bondAlbedo: 0.11,
    // Global mean from radiative balance, S(1−A)/4 ≈ 303 W/m². The real field is
    // far from uniform: ~390 K at the subsolar point (≈1.2 kW/m²) and ~95 K at night
    // (Diviner: Williams et al. 2017, Icarus 283, 300, doi:10.1016/j.icarus.2016.08.012).
    // A radiator in low lunar orbit therefore sees a strongly time-varying load.
    infrared_W_m2: (SOLAR_CONSTANT_W_M2 * (1 - 0.11)) / 4,
  },
};

/** Lunar synodic day (sunrise to sunrise), hours. NASA Moon Fact Sheet: 29.53 d. */
export const MOON_SYNODIC_DAY_H = 29.53 * 24;

/** Materials used by the transport comparison. CRC Handbook of Chemistry and Physics. */
export const COPPER = {
  resistivity_ohm_m: 1.68e-8, // 20 °C
  conductivity_W_mK: 401,
  density_kg_m3: 8960,
} as const;

/** Silicon thermal conductivity falls roughly as 1/T: ~148 W/m·K at 300 K, ~120 near 360 K.
 *  Source: Glassbrenner & Slack (1964), Phys. Rev. 134, A1058, doi:10.1103/PhysRev.134.A1058 */
export const SILICON_K_360K_W_MK = 120;

export interface Coolant {
  name: string;
  min_K: number;
  max_K: number;
  cp_J_kgK: number;
}

/**
 * Coolant working windows (K). A loop outside its window freezes, boils, or exceeds
 * its critical point. These are the hard physical edges; practical limits are tighter
 * (pressure containment, material compatibility).
 *  - Ammonia: triple point 195.4 K, critical point 405.4 K (NIST Chemistry WebBook,
 *    https://webbook.nist.gov/cgi/cbook.cgi?ID=C7664417). ISS EATCS working fluid.
 *  - Water: freezes at 273.15 K; the 473 K ceiling is a practical pressure limit
 *    (~16 bar saturation), not a physical one (critical point 647 K).
 *  - NaK-78: melts at 260.5 K, boils at ~1058 K at 1 atm (Foust, Sodium-NaK
 *    Engineering Handbook Vol. I, 1972). Flown on SNAP-10A.
 */
export const COOLANTS: Record<CoolantId, Coolant> = {
  water: { name: 'Water (single-phase)', min_K: 273.15, max_K: 473, cp_J_kgK: 4180 },
  ammonia: { name: 'Ammonia (single-phase)', min_K: 195.4, max_K: 405.4, cp_J_kgK: 4700 },
  nak78: { name: 'NaK-78 liquid metal', min_K: 260.5, max_K: 1058, cp_J_kgK: 872 },
  twoPhaseAmmonia: { name: 'Ammonia two-phase loop', min_K: 195.4, max_K: 405.4, cp_J_kgK: 4700 },
};
