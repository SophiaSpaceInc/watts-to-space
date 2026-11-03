/**
 * Circular-orbit geometry needed for power and thermal sizing.
 * Reference for the eclipse and beta-angle relations: S. L. Rickman, "Introduction to
 * Orbital Mechanics and Spacecraft Attitudes for Thermal Engineers", NASA TFAWS short
 * course (https://tfaws.nasa.gov/), and Gilmore (2002) ch. 2.
 */
import type { Body } from './constants.ts';

/** Period of a circular orbit, seconds: T = 2π √(a³/μ). */
export function circularPeriod_s(body: Body, altitude_km: number): number {
  const a = body.radius_km + altitude_km;
  return 2 * Math.PI * Math.sqrt(a ** 3 / body.mu_km3_s2);
}

/**
 * Fraction of a circular orbit spent in the body's shadow (cylindrical shadow model).
 * β is the angle between the orbit plane and the Sun vector. Above
 * β* = asin(R/(R+h)) the orbit never enters shadow.
 *     f_e = (1/π) · acos( √(h² + 2Rh) / ((R + h) cos β) )   for |β| < β*
 */
export function eclipseFraction(body: Body, altitude_km: number, beta_deg: number): number {
  const R = body.radius_km;
  const h = altitude_km;
  const beta = (Math.abs(beta_deg) * Math.PI) / 180;
  const betaStar = Math.asin(R / (R + h));
  if (beta >= betaStar) return 0;
  const x = Math.sqrt(h * h + 2 * R * h) / ((R + h) * Math.cos(beta));
  return Math.acos(Math.min(1, x)) / Math.PI;
}

/**
 * Orbit-average geometry factor for reflected sunlight (albedo) reaching a face that
 * sees the body: the mean of max(0, cos β · cos ν) over one orbit = cos β / π.
 * ≈0.32 for a noon–midnight orbit (β = 0), → 0 for a terminator orbit (β = 90°).
 * First-order: ignores the curvature of the sunlit crescent seen from altitude.
 */
export function albedoGeometryFactor(beta_deg: number): number {
  return Math.max(0, Math.cos((beta_deg * Math.PI) / 180)) / Math.PI;
}
