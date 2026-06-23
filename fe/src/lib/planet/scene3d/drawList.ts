import type { Vec3 } from '../math/vec.js';
import type { BodyType, PlanetScene } from '../scene/types.js';
import { getWorldTransform, listBodies } from '../scene/sceneTree.js';
import { proceduralBlend, selectLod, type LodLevel, type LodThresholds } from '../scene/bodyParams.js';
import { FOVY, projectToScreen } from './orbitCamera.js';

// The per-frame draw list for the scene engine: each visible body projected, with its
// chosen LOD (dot/sphere/procedural, ±15% hysteresis) and procedural cross-fade. Pure
// given the caller's lodState (carried across frames for hysteresis). This is the one
// source the engine renders from — spheres, the fade composite, and (later) the
// single-pass procedural body all read it. See _docs/specs/unified-scene-renderer.md.

export interface DrawItem {
	id: string;
	bodyType: BodyType;
	radiusMeters: number;
	worldPos: Vec3;
	/** Screen position (px) + clip-w depth; null when off-screen / behind the camera. */
	screen: { x: number; y: number; depth: number } | null;
	/** Projected radius (px) — half the on-screen disc; 0 when off-screen. */
	screenRadiusPx: number;
	lod: LodLevel;
	/** Procedural cross-fade 0..1. */
	blend: number;
}

const RANK: Record<LodLevel, number> = { dot: 0, sphere: 1, procedural: 2 };

function lodWithHysteresis(
	id: string,
	px: number,
	lodState: Map<string, LodLevel>,
	t: LodThresholds
): LodLevel {
	const prev = lodState.get(id);
	let level = selectLod(px, t);
	if (prev && level !== prev) {
		// Only change once px crosses the threshold by ±15%, to avoid flicker.
		if (RANK[level] > RANK[prev] && RANK[selectLod(px / 1.15, t)] <= RANK[prev]) level = prev;
		else if (RANK[level] < RANK[prev] && RANK[selectLod(px * 1.15, t)] >= RANK[prev]) level = prev;
	}
	lodState.set(id, level);
	return level;
}

export function buildDrawList(
	animated: PlanetScene,
	vp: Float32Array,
	width: number,
	height: number,
	lodState: Map<string, LodLevel>,
	lod: LodThresholds
): DrawItem[] {
	const screenScale = (1 / Math.tan(FOVY / 2)) * (height / 2);
	const out: DrawItem[] = [];
	for (const b of listBodies(animated)) {
		const worldPos = getWorldTransform(animated, b.id).position;
		const sp = projectToScreen(vp, worldPos, width, height);
		const screenRadiusPx = sp ? (b.radiusMeters / sp.depth) * screenScale : 0;
		out.push({
			id: b.id,
			bodyType: b.bodyType,
			radiusMeters: b.radiusMeters,
			worldPos,
			screen: sp,
			screenRadiusPx,
			lod: sp ? lodWithHysteresis(b.id, screenRadiusPx, lodState, lod) : 'dot',
			blend: sp ? proceduralBlend(screenRadiusPx, lod) : 0
		});
	}
	return out;
}
