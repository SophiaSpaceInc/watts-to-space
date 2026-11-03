/**
 * Configuration ("view") factors from a small flat radiator face to a spherical body.
 *
 * F is the fraction of a face's hemispherical (cosine-weighted) field of view filled
 * by the body. The face absorbs F × (body emission) and loses that share of its
 * view to cold space. Reference: the differential-planar-element-to-sphere factors
 * in J. R. Howell's online Catalog of Radiation Heat Transfer Configuration Factors
 * (http://www.thermalradiation.net/indexCat.html). Both closed forms below are checked
 * against direct numerical integration in test/physics.test.ts.
 *
 * Note for readers of McCalip's model (github.com/andrewmccalip/thoughts, math.js):
 * that model floors an edge-on panel at 5 % of the nadir factor (≈0.04 at 550 km).
 * The exact edge-on factor is ≈0.26 at 550 km — about 6× larger — which matters for
 * low-temperature radiators.
 */

/** Angular radius of a body seen from altitude h: θ = asin(R / (R + h)). */
export function angularRadius_rad(radius_km: number, altitude_km: number): number {
  return Math.asin(radius_km / (radius_km + altitude_km));
}

/** Face pointed straight at the body's centre (nadir): F = (R / (R + h))² = sin²θ. */
export function viewFactorFacing(radius_km: number, altitude_km: number): number {
  return (radius_km / (radius_km + altitude_km)) ** 2;
}

/**
 * Face whose normal is perpendicular to the local vertical ("edge-on" panel, both
 * faces looking at the horizon). With H = (R + h)/R:
 *     F = (1/π) · [ atan(1/√(H²−1)) − √(H²−1) / H² ]
 */
export function viewFactorEdgeOn(radius_km: number, altitude_km: number): number {
  const H = (radius_km + altitude_km) / radius_km;
  const s = Math.sqrt(H * H - 1);
  return (Math.atan(1 / s) - s / (H * H)) / Math.PI;
}

/** A vertical face standing on an infinite flat plain sees half ground, half sky. */
export const VIEW_FACTOR_VERTICAL_ON_PLANE = 0.5;
