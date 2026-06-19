import { describe, expect, it } from 'vitest';
import {
	classifyBodyLod,
	POINT_BODY_RADIUS_PX,
	projectedRadiusPx,
	type BodyLodMesh
} from './bodyLod.js';

// focalLengthPx ~ 60° fov at 1080p; radius 500 km (a toy rocky planet).
const FOCAL = 935;
const R = 500_000;

describe('projectedRadiusPx', () => {
	it('shrinks with distance and grows with radius', () => {
		expect(projectedRadiusPx(R, 1e7, FOCAL)).toBeGreaterThan(projectedRadiusPx(R, 1e8, FOCAL));
		expect(projectedRadiusPx(2 * R, 1e8, FOCAL)).toBeCloseTo(2 * projectedRadiusPx(R, 1e8, FOCAL));
	});

	it('returns Infinity when the camera is at/inside the body', () => {
		expect(projectedRadiusPx(R, 0, FOCAL)).toBe(Infinity);
		expect(projectedRadiusPx(R, -5, FOCAL)).toBe(Infinity);
	});
});

describe('classifyBodyLod', () => {
	it('renders a distant, sub-pixel body as a point (no tessellation)', () => {
		// At 1e9 m a 500 km body projects to ~0.5 px.
		const lod = classifyBodyLod(R, 1e9, FOCAL);
		expect(lod.tier).toBe('point');
		expect(lod.screenRadiusPx).toBeLessThan(POINT_BODY_RADIUS_PX);
	});

	it('meshes a near body and caps triangles to its pixel coverage', () => {
		const lod = classifyBodyLod(R, 1e7, FOCAL) as BodyLodMesh;
		expect(lod.tier).toBe('mesh');
		const r = lod.screenRadiusPx;
		expect(r).toBeGreaterThan(POINT_BODY_RADIUS_PX);
		// Never more triangles than the body covers on screen (π·r²).
		expect(lod.maxTriangles).toBe(Math.ceil(Math.PI * r * r));
		expect(lod.maxTriangles).toBeLessThanOrEqual(Math.ceil(Math.PI * r * r));
	});

	it('switches tier right at the threshold', () => {
		// Distance where projected radius == threshold.
		const dAtThreshold = (R * FOCAL) / POINT_BODY_RADIUS_PX;
		expect(classifyBodyLod(R, dAtThreshold * 1.2, FOCAL).tier).toBe('point'); // smaller → point
		expect(classifyBodyLod(R, dAtThreshold * 0.8, FOCAL).tier).toBe('mesh'); // larger → mesh
	});

	it('honors a custom point-radius threshold', () => {
		const lod = classifyBodyLod(R, 1e8, FOCAL, { pointRadiusPx: 100 });
		expect(lod.tier).toBe('point'); // ~4.7 px < 100 → point under the stricter threshold
	});
});
