import { describe, expect, it } from 'vitest';
import { createOrbitCamera } from '../camera/orbitCamera.js';
import {
	isPatchVisible,
	extractFrustumPlanes,
	buildCullParams
} from './culling.js';
import type { CubeSpherePatch } from './types.js';
import {
	isScreenBoundsOutsideViewport,
	patchIntersectsViewport,
	patchScreenBounds,
	patchScreenDiameterPx,
	projectWorldPoint
} from './screenSpace.js';

describe('screenSpace', () => {
	it('projects planet center to screen center', () => {
		const cam = createOrbitCamera({
			distance: 320,
			azimuth: 0.6,
			elevation: 0.35,
			fovDeg: 60,
			aspect: 16 / 9,
			near: 0.1,
			far: 10_000,
			planetRadius: 100
		});
		const viewport = { width: 1920, height: 1080 };
		const proj = projectWorldPoint(cam.viewProjectionMatrix, viewport, [0, 0, 0]);
		expect(proj.behindCamera).toBe(false);
		expect(proj.screenPx[0]).toBeCloseTo(960, -1);
		expect(proj.screenPx[1]).toBeCloseTo(540, -1);
	});

	it('computes positive screen diameter for visible patch', () => {
		const cam = createOrbitCamera({
			distance: 320,
			azimuth: 0.6,
			elevation: 0.35,
			fovDeg: 60,
			aspect: 16 / 9,
			near: 0.1,
			far: 10_000,
			planetRadius: 100
		});
		const patch: CubeSpherePatch = {
			kind: 'cubeSphere',
			id: 0,
			face: 4,
			uvMin: [0.4, 0.4],
			uvMax: [0.6, 0.6],
			resolution: 16,
			morph: 0
		};
		const bounds = patchScreenBounds(cam.viewProjectionMatrix, { width: 1920, height: 1080 }, 100, patch);
		expect(bounds.anyVisible).toBe(true);
		expect(patchScreenDiameterPx(bounds)).toBeGreaterThan(10);
	});

	it('detects partial viewport overlap with margin', () => {
		const bounds = { minX: -50, minY: 100, maxX: 200, maxY: 400, anyVisible: true };
		const viewport = { width: 1920, height: 1080 };
		expect(isScreenBoundsOutsideViewport(bounds, viewport, 0)).toBe(false);
		expect(patchIntersectsViewport(bounds, viewport, 64)).toBe(true);
		expect(patchIntersectsViewport({ ...bounds, minX: -500, maxX: -200 }, viewport, 64)).toBe(
			false
		);
	});
});

describe('culling corner frustum', () => {
	it('rejects patch on back-facing cube face', () => {
		const cam = createOrbitCamera({
			distance: 320,
			azimuth: 0,
			elevation: 0,
			fovDeg: 60,
			aspect: 1,
			near: 0.1,
			far: 10_000,
			planetRadius: 100
		});
		const frustum = extractFrustumPlanes(cam.viewProjectionMatrix);
		const params = buildCullParams(cam.position, 100);
		const backPatch: CubeSpherePatch = {
			kind: 'cubeSphere',
			id: 1,
			face: 1,
			uvMin: [0, 0],
			uvMax: [1, 1],
			resolution: 8,
			morph: 0
		};
		expect(isPatchVisible(backPatch, cam.position, 100, frustum, params)).toBe(false);
	});
});
