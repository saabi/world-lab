import type { BodyAtmosphere } from '../scene/types.js';

/** TS port of atmosphere/density.wgsl — matches rendered fog density. */
export function atmosphereDensity(altitudeM: number, atmo: BodyAtmosphere): number {
	const scaleH = Math.max(atmo.scaleHeightMeters, 0.001);
	let rho = Math.exp(-Math.max(altitudeM, 0) / scaleH);
	const fogH = Math.max(atmo.scaleHeightMeters * 2, 0.1);
	if (altitudeM < fogH && atmo.groundFogDensity > 1e-4) {
		rho += atmo.groundFogDensity * Math.exp(-altitudeM / (fogH * 0.25));
	}
	return rho;
}

export function altitudeAboveSurface(relPosition: import('../math/vec.js').Vec3, radiusMeters: number): number {
	const dist = Math.sqrt(
		relPosition[0] * relPosition[0] +
			relPosition[1] * relPosition[1] +
			relPosition[2] * relPosition[2]
	);
	return Math.max(0, dist - radiusMeters);
}

/** 0 = vacuum, 1 = full atmosphere. Smoothstep between shell top and ~2× scale height. */
export function atmosphereBlend(altitudeM: number, atmo: BodyAtmosphere): number {
	if (!atmo.enabled) return 0;
	const shell = Math.max(atmo.shellHeightMeters, 0);
	if (altitudeM > shell) return 0;
	const inner = Math.max(atmo.scaleHeightMeters * 0.5, 1);
	const t = 1 - (altitudeM - inner) / Math.max(shell - inner, 1);
	return Math.max(0, Math.min(1, t * t * (3 - 2 * t)));
}
