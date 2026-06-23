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
 * `appearance.overrides` (matching AppearanceEditor). Used by the `/planet` → `/scene`
 * save-back round-trip (see scene/planetHandoff.ts).
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

export type LodLevel = 'dot' | 'sphere' | 'procedural';

/**
 * Screen-size LOD thresholds, expressed as the body's **projected radius in pixels** (the
 * intuitive unit: half the on-screen disc). These are a global render-quality setting
 * (see `SceneViewportPrefs.lod`), not per-body.
 */
export interface LodThresholds {
	/** Above this projected radius (px) a body renders as a sphere; below it, a dot. */
	sphereAboveRadiusPx: number;
	/** Above this projected radius (px) a body renders procedural terrain. */
	proceduralAboveRadiusPx: number;
}

export const DEFAULT_LOD_THRESHOLDS: LodThresholds = {
	sphereAboveRadiusPx: 1,
	proceduralAboveRadiusPx: 120
};

/**
 * Pick a render LOD from the body's on-screen size (projected radius px) and the thresholds.
 * Stateless; the renderer adds hysteresis around the boundaries to avoid flicker.
 */
export function selectLod(projectedRadiusPx: number, t: LodThresholds): LodLevel {
	if (projectedRadiusPx >= t.proceduralAboveRadiusPx) return 'procedural';
	if (projectedRadiusPx >= t.sphereAboveRadiusPx) return 'sphere';
	return 'dot';
}

/** Fraction (0..1) the procedural body is fade-composited over its sphere across the
 *  band starting at `proceduralAboveRadiusPx`. 0 below the threshold; ramps to 1 over the
 *  next `PROCEDURAL_FADE_BAND` of growth. Lets the planet dissolve in over the sphere
 *  instead of popping. */
const PROCEDURAL_FADE_BAND = 0.5; // fade over the next +50% of projected size

export function proceduralBlend(projectedRadiusPx: number, t: LodThresholds): number {
	const procAbove = t.proceduralAboveRadiusPx;
	const band = Math.max(1, procAbove * PROCEDURAL_FADE_BAND);
	return Math.max(0, Math.min(1, (projectedRadiusPx - procAbove) / band));
}
