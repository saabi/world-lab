import type { PlanetParameters } from '../params/planetParams.js';
import { DEFAULT_PRESET, PLANET_PRESETS, type PlanetPresetName } from '../params/presets.js';
import type { BodyNode } from './types.js';

// Per-body appearance + render-LOD resolution (pure). resolveBodyParams gives the
// procedural appearance; selectLod picks a representation from on-screen size. The terrain
// is scale-invariant, so the renderer sets params.radius = body.radiusMeters (world scale);
// the preset's radius (~100) is only the authoring reference R_ref. See
// _docs/specs/celestial-body-params.md and renderer-unification-plan.md §3.1/§5.

/**
 * The body's procedural appearance: its preset merged with sparse overrides. The resulting
 * `radius` is the preset's authoring-reference radius (R_ref); the world size is
 * `body.radiusMeters`, which the renderer applies as `params.radius` at render time.
 */
export function resolveBodyParams(body: BodyNode): PlanetParameters {
	const preset = body.appearance?.preset ?? DEFAULT_PRESET;
	const base = PLANET_PRESETS[preset] ?? PLANET_PRESETS[DEFAULT_PRESET];
	return { ...base, ...body.appearance?.overrides };
}

/**
 * Inverse of resolveBodyParams: the sparse overrides that, layered on `preset`, reproduce
 * `params` — only fields differing from the preset, which is what the scene stores in
 * `appearance.overrides` (matching AppearanceEditor).
 */
export function diffAppearanceOverrides(
	params: PlanetParameters,
	preset: PlanetPresetName
): Partial<PlanetParameters> {
	const base = PLANET_PRESETS[preset] ?? PLANET_PRESETS[DEFAULT_PRESET];
	const overrides: Partial<PlanetParameters> = {};
	for (const key of Object.keys(params) as (keyof PlanetParameters)[]) {
		if (params[key] !== base[key]) overrides[key] = params[key];
	}
	return overrides;
}

export type LodLevel = 'dot' | 'mesh';

export type LodTransitionMode = 'none' | 'heights' | 'atmosphere' | 'both';

export interface LodTransitionBlends {
	/** Vertex radial offset toward displaced surface (terrain band). */
	displacementBlend: number;
	/** Fragment macro relief scale (when heights participate in the transition). */
	heightBlend: number;
	/** Scene atmosphere pass opacity (when atmosphere participates). */
	atmosphereBlend: number;
}

/**
 * Screen-size LOD thresholds, expressed as the body's **projected radius in pixels** (the
 * intuitive unit: half the on-screen disc). These are a global render-quality setting
 * (see `SceneViewportPrefs.lod`), not per-body.
 */
export interface LodThresholds {
	/** Above this projected radius (px) a body renders as a tessellated mesh; below it, a dot. */
	sphereAboveRadiusPx: number;
	/** Above this projected radius (px) displacement / toggled channels start ramping in. */
	proceduralAboveRadiusPx: number;
	/** At this projected radius (px) terrain transition is complete. */
	proceduralFullRadiusPx: number;
}

export const DEFAULT_LOD_THRESHOLDS: LodThresholds = {
	sphereAboveRadiusPx: 1,
	proceduralAboveRadiusPx: 120,
	proceduralFullRadiusPx: 180
};

/**
 * Pick a render LOD from the body's on-screen size (projected radius px) and the thresholds.
 * Stateless; the renderer adds hysteresis around the boundaries to avoid flicker.
 */
export function selectLod(projectedRadiusPx: number, t: LodThresholds): LodLevel {
	if (projectedRadiusPx >= t.sphereAboveRadiusPx) return 'mesh';
	return 'dot';
}

/** Linear 0..1 across the terrain-start → terrain-full band. */
export function proceduralBlend(projectedRadiusPx: number, t: LodThresholds): number {
	const start = t.proceduralAboveRadiusPx;
	const band = Math.max(1, t.proceduralFullRadiusPx - start);
	return Math.max(0, Math.min(1, (projectedRadiusPx - start) / band));
}

/** Default gamma for the terrain transition (see `fadeOpacity`). */
export const DEFAULT_FADE_GAMMA = 2.5;

/** Maps the linear terrain-band blend through a gamma. gamma > 1 keeps toggled channels
 *  faint early in the band; gamma = 1 is linear. Endpoints preserved (0→0, 1→1). */
export function fadeOpacity(blend: number, gamma: number = DEFAULT_FADE_GAMMA): number {
	return Math.pow(Math.max(0, Math.min(1, blend)), Math.max(1, gamma));
}

function modeIncludesHeights(mode: LodTransitionMode): boolean {
	return mode === 'heights' || mode === 'both';
}

function modeIncludesAtmosphere(mode: LodTransitionMode): boolean {
	return mode === 'atmosphere' || mode === 'both';
}

/**
 * Per-channel blends for tessellated planets/moons above the dot tier.
 * Smooth-mesh band (sphereAbove … proceduralAbove): displacement 0; toggled channels off;
 * non-toggled channels at 1. Terrain band: displacement always ramps; toggled channels ramp
 * with the same curve; non-toggled stay at 1.
 */
export function resolveLodTransitionBlends(
	projectedRadiusPx: number,
	t: LodThresholds,
	mode: LodTransitionMode,
	gamma: number = DEFAULT_FADE_GAMMA
): LodTransitionBlends {
	if (mode === 'none') {
		return { displacementBlend: 1, heightBlend: 1, atmosphereBlend: 1 };
	}

	const terrainLinear = proceduralBlend(projectedRadiusPx, t);
	const terrain = fadeOpacity(terrainLinear, gamma);

	if (projectedRadiusPx < t.proceduralAboveRadiusPx) {
		return {
			displacementBlend: 0,
			heightBlend: modeIncludesHeights(mode) ? 0 : 1,
			atmosphereBlend: modeIncludesAtmosphere(mode) ? 0 : 1
		};
	}

	return {
		displacementBlend: terrain,
		heightBlend: modeIncludesHeights(mode) ? terrain : 1,
		atmosphereBlend: modeIncludesAtmosphere(mode) ? terrain : 1
	};
}
