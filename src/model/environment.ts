/**
 * Thermal and illumination environments for a radiator in vacuum.
 *
 * Three kinds, enough to span "cislunar industry":
 *   - orbit:     circular orbit around Earth or the Moon (planet IR + albedo + eclipse)
 *   - deepSpace: far from any body (e.g. NRHO apolune, Earth–Moon L1/L2, transfer)
 *   - surface:   standing on the lunar surface (hot regolith below, sky above)
 *
 * Every radiator face is described by what it sees. The environment returns the flux
 * each face *absorbs*; radiation.ts turns that into net rejection.
 *
 * Radiator orientation (same three words in every environment):
 *   - 'edgeOn':      two faces, panel plane contains the local vertical (in orbit:
 *                    edge-on to the body; on the surface: a vertical fin). Kept edge-on
 *                    to the Sun, so no direct sunlight reaches either face.
 *   - 'nadirZenith': two faces, panel horizontal: one face looks at the body/ground,
 *                    the other at the sky.
 *   - 'zenithOnly':  one face looking at the sky; the back is insulated.
 * Simplification: in orbit, sky-facing faces are assumed shaded from direct Sun. On
 * the surface, sky-facing faces DO get direct Sun at the given elevation (no shade).
 */
import { BODIES, SIGMA, SOLAR_CONSTANT_W_M2 } from './constants.ts';
import { albedoGeometryFactor, circularPeriod_s, eclipseFraction } from './orbit.ts';
import type { Environment, Orientation, RadiatorSurface } from './types.ts';
import { VIEW_FACTOR_VERTICAL_ON_PLANE, viewFactorEdgeOn, viewFactorFacing } from './viewFactor.ts';

export interface Face {
  /** View factor to the body (orbit) or ground (surface). */
  viewFactor: number;
  /** Cosine of direct-Sun incidence on this face (0 = edge-on or shaded). */
  directSun: number;
}

/** What each face of the radiator sees. */
export function radiatorFaces(env: Environment, orientation: Orientation): Face[] {
  const face = (viewFactor: number, directSun = 0): Face => ({ viewFactor, directSun });
  if (env.kind === 'deepSpace') {
    return orientation === 'zenithOnly' ? [face(0)] : [face(0), face(0)];
  }
  if (env.kind === 'orbit') {
    const R = BODIES[env.body].radius_km;
    const h = env.altitude_km;
    if (orientation === 'edgeOn') return [face(viewFactorEdgeOn(R, h)), face(viewFactorEdgeOn(R, h))];
    if (orientation === 'nadirZenith') return [face(viewFactorFacing(R, h)), face(0)];
    return [face(0)];
  }
  // surface: ground treated as an infinite plane; sky-facing faces see the Sun
  const sunCos = Math.sin((env.sunElevation_deg * Math.PI) / 180);
  if (orientation === 'edgeOn') return [face(VIEW_FACTOR_VERTICAL_ON_PLANE), face(VIEW_FACTOR_VERTICAL_ON_PLANE)];
  if (orientation === 'nadirZenith') return [face(1), face(0, sunCos)];
  return [face(0, sunCos)];
}

/**
 * Flux absorbed by each face, W/m². Kirchhoff: a gray face absorbs IR with its
 * emissivity ε, and sunlight (direct or reflected) with its solar absorptance α.
 */
export function absorbedFluxPerFace(
  env: Environment,
  orientation: Orientation,
  surface: Pick<RadiatorSurface, 'emissivity' | 'solarAbsorptance'>,
): number[] {
  const { emissivity: eps, solarAbsorptance: alpha } = surface;
  const faces = radiatorFaces(env, orientation);
  if (env.kind === 'deepSpace') return faces.map(() => 0);
  if (env.kind === 'orbit') {
    const body = BODIES[env.body];
    const albedoFlux = SOLAR_CONSTANT_W_M2 * body.bondAlbedo * albedoGeometryFactor(env.beta_deg);
    return faces.map((f) => eps * f.viewFactor * body.infrared_W_m2 + alpha * f.viewFactor * albedoFlux);
  }
  const sunCos = Math.sin((env.sunElevation_deg * Math.PI) / 180);
  const groundIR = env.groundEmissivity * SIGMA * env.groundTemperature_K ** 4;
  const groundReflected = env.groundAlbedo * SOLAR_CONSTANT_W_M2 * sunCos;
  return faces.map(
    (f) => eps * f.viewFactor * groundIR + alpha * f.viewFactor * groundReflected + alpha * f.directSun * SOLAR_CONSTANT_W_M2,
  );
}

export interface Sunlight {
  /** Fraction of each light/dark cycle in sunlight. */
  sunlitFraction: number;
  /** Cycle length in hours (orbit period, or lunar day). */
  cyclePeriod_h: number;
}

/** Sunlight availability, which sizes energy storage. */
export function sunlight(env: Environment): Sunlight {
  if (env.kind === 'orbit') {
    const body = BODIES[env.body];
    return {
      sunlitFraction: 1 - eclipseFraction(body, env.altitude_km, env.beta_deg),
      cyclePeriod_h: circularPeriod_s(body, env.altitude_km) / 3600,
    };
  }
  return { sunlitFraction: env.sunlitFraction, cyclePeriod_h: env.cyclePeriod_h };
}

/** Human-readable orientation labels that make sense in each environment. */
export function orientationLabel(env: Environment, orientation: Orientation): string {
  const surface = env.kind === 'surface';
  const labels: Record<Orientation, string> = {
    edgeOn: surface ? 'Vertical fin (both faces)' : 'Edge-on to body (both faces)',
    nadirZenith: surface ? 'Horizontal, raised (ground + sky faces)' : 'Flat: one face at body, one at sky',
    zenithOnly: surface ? 'Horizontal, sky face only' : 'Sky face only (body-mounted)',
  };
  return labels[orientation];
}
