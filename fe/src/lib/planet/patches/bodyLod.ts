// Per-body level-of-detail for solar-system rendering — the outer tier above the
// patch scheduler. A celestial body far enough away is point-like: below a few
// pixels of projected radius there is no point tessellating a sphere, so render it
// as a single colored point (the average of its albedo + atmosphere tint). When it
// is large enough to mesh, the triangle count is bounded by the pixels it covers —
// never tessellate more triangles than the body occupies on screen. This decision
// gates (and feeds a budget to) the existing cube-sphere scheduler. Pure math, no
// scene/GPU dependency. See _docs/specs/solar-system-scene.md.

/** Below this projected radius (px) a body is a point, not a mesh. */
export const POINT_BODY_RADIUS_PX = 3;

/**
 * Projected screen radius (px) of a body of `radiusMeters` whose center is
 * `distanceMeters` from the camera. Mirrors the codebase convention
 * `pixels = worldSize * focalLengthPx / distance`
 * (`focalLengthPx = 0.5 * viewportHeightPx / tan(fov/2)`). Infinity when the camera
 * is at/inside the body.
 */
export function projectedRadiusPx(
	radiusMeters: number,
	distanceMeters: number,
	focalLengthPx: number
): number {
	if (distanceMeters <= 0) return Infinity;
	return (radiusMeters * focalLengthPx) / distanceMeters;
}

export interface BodyLodPoint {
	tier: 'point';
	screenRadiusPx: number;
}
export interface BodyLodMesh {
	tier: 'mesh';
	screenRadiusPx: number;
	/** Pixel-coverage cap: never tessellate more triangles than the body covers. */
	maxTriangles: number;
}
export type BodyLod = BodyLodPoint | BodyLodMesh;

export interface BodyLodOptions {
	/** Point/mesh threshold on projected radius (px). Default POINT_BODY_RADIUS_PX. */
	pointRadiusPx?: number;
}

/**
 * Classify how to render a body from its projected size. < pointRadiusPx → a point
 * (no tessellation); otherwise a mesh whose triangle budget is capped to the pixels
 * it covers (π·r²), so the scheduler never spends more triangles than pixels.
 */
export function classifyBodyLod(
	radiusMeters: number,
	distanceMeters: number,
	focalLengthPx: number,
	options?: BodyLodOptions
): BodyLod {
	const screenRadiusPx = projectedRadiusPx(radiusMeters, distanceMeters, focalLengthPx);
	const threshold = options?.pointRadiusPx ?? POINT_BODY_RADIUS_PX;
	if (screenRadiusPx < threshold) {
		return { tier: 'point', screenRadiusPx };
	}
	const coveragePx = Math.PI * screenRadiusPx * screenRadiusPx;
	return { tier: 'mesh', screenRadiusPx, maxTriangles: Math.ceil(coveragePx) };
}
