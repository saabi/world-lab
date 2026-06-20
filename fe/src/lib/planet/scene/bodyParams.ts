import type { PlanetParameters } from '../params/planetParams.js';
import { DEFAULT_PRESET, PLANET_PRESETS } from '../params/presets.js';
import type { BodyNode } from './types.js';

// Per-body appearance + render-LOD resolution (pure). resolveBodyParams gives the
// procedural appearance; selectLod picks a representation from on-screen size. The
// physical size (radiusMeters) is applied at render time, separately from the
// appearance's render-space `radius`. See _docs/specs/celestial-body-params.md.

/**
 * The body's procedural appearance: its preset merged with sparse overrides. NB the
 * resulting `radius` is the appearance/render-space radius (it scales noise
 * relations), NOT the physical size — `body.radiusMeters` is the world scale, applied
 * separately when the body is composited into the scene.
 */
export function resolveBodyParams(body: BodyNode): PlanetParameters {
	const preset = body.appearance?.preset ?? DEFAULT_PRESET;
	const base = PLANET_PRESETS[preset] ?? PLANET_PRESETS[DEFAULT_PRESET];
	return { ...base, ...body.appearance?.overrides };
}

export type LodLevel = 'dot' | 'sphere' | 'procedural';

const DEFAULT_SPHERE_ABOVE_PX = 2;
const DEFAULT_PROCEDURAL_ABOVE_PX = 240;

/**
 * Pick a render LOD from the body's on-screen size (projected px) and its thresholds.
 * Stateless; the renderer adds hysteresis around the boundaries to avoid flicker.
 */
export function selectLod(body: BodyNode, projectedPx: number): LodLevel {
	const procAbove = body.lod?.proceduralAbovePx ?? DEFAULT_PROCEDURAL_ABOVE_PX;
	const sphereAbove = body.lod?.sphereAbovePx ?? DEFAULT_SPHERE_ABOVE_PX;
	if (projectedPx >= procAbove) return 'procedural';
	if (projectedPx >= sphereAbove) return 'sphere';
	return 'dot';
}
