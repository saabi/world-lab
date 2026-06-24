import { defaultAtmosphereParams, type AtmosphereParameters } from '../params/atmosphereParams.js';
import type { BodyAtmosphere, BodyNode } from './types.js';

// Atmosphere as body data (see body-vs-viewport-state.md). The body stores the design
// (BodyAtmosphere); the ray-march step count (integrateSteps) is render quality, supplied
// at bridge time, not stored on the node.

/** Ray-march step count when none is supplied (matches the historical default). */
export const DEFAULT_ATMOSPHERE_INTEGRATE_STEPS = 12;

/** Radius-derived default atmosphere design — the same look as `/planet`'s default. */
export function defaultBodyAtmosphere(radiusMeters: number): BodyAtmosphere {
	const p = defaultAtmosphereParams(radiusMeters);
	return {
		enabled: p.enabled,
		shellHeightMeters: p.shellHeightMeters,
		scaleHeightMeters: p.scaleHeightMeters,
		rayleighStrength: p.rayleighStrength,
		mieStrength: p.mieStrength,
		mieG: p.mieG,
		groundFogDensity: p.groundFogDensity,
		sunDiskIntensity: p.sunDiskIntensity
	};
}

/** The body's atmosphere design: its own, or radius-derived defaults when unset. */
export function resolveBodyAtmosphere(body: BodyNode): BodyAtmosphere {
	return body.atmosphere ?? defaultBodyAtmosphere(body.radiusMeters);
}

/** Bridge to the renderer's `AtmosphereParameters`, adding the render-quality step count. */
export function bodyAtmosphereToParameters(
	a: BodyAtmosphere,
	integrateSteps: number = DEFAULT_ATMOSPHERE_INTEGRATE_STEPS
): AtmosphereParameters {
	return { ...a, integrateSteps };
}

/** Capture `/planet`'s edited atmosphere onto a body, dropping render quality (steps). */
export function bodyAtmosphereFromParameters(p: AtmosphereParameters): BodyAtmosphere {
	return {
		enabled: p.enabled,
		shellHeightMeters: p.shellHeightMeters,
		scaleHeightMeters: p.scaleHeightMeters,
		rayleighStrength: p.rayleighStrength,
		mieStrength: p.mieStrength,
		mieG: p.mieG,
		groundFogDensity: p.groundFogDensity,
		sunDiskIntensity: p.sunDiskIntensity
	};
}

/** RGB sky tint for water Fresnel reflection — derived from body atmosphere design. */
export function waterSkyTintRgb(atmo: BodyAtmosphere): [number, number, number] {
	if (!atmo.enabled) {
		return [0.32, 0.46, 0.72];
	}
	return [
		0.36 + 0.06 * atmo.rayleighStrength,
		0.5 + 0.1 * atmo.rayleighStrength,
		0.68 + 0.12 * atmo.rayleighStrength + 0.05 * atmo.mieStrength
	];
}
