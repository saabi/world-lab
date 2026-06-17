import { describe, expect, it } from 'vitest';
import { createOrbitCamera } from '../camera/orbitCamera.js';
import { scheduleAdaptiveOrbitPatches } from './cubeSphereScheduler.js';
import { patchScreenBounds } from './screenSpace.js';
import type { CubeSpherePatch } from './types.js';

const viewport = { width: 1280, height: 720 };

function lowOrbitCamera() {
	// Altitude 4 on a radius-100 planet, horizon look — the surface wraps past the camera.
	return createOrbitCamera({
		distance: 104,
		azimuth: 0,
		elevation: 0,
		fovDeg: 60,
		aspect: viewport.width / viewport.height,
		near: 0.1,
		far: 5000,
		planetRadius: 100,
		lookMode: 'horizon'
	});
}

describe('near-plane patch tessellation', () => {
	it('flags a face that crosses the camera near plane', () => {
		const cam = lowOrbitCamera();
		let anyStraddle = false;
		for (let face = 0; face < 6; face++) {
			const root: CubeSpherePatch = {
				kind: 'cubeSphere',
				id: face,
				face: face as CubeSpherePatch['face'],
				uvMin: [0, 0],
				uvMax: [1, 1],
				resolution: 8,
				morph: 0
			};
			const bounds = patchScreenBounds(cam.viewProjectionMatrix, viewport, 100, root);
			if (bounds.anyBehind) anyStraddle = true;
		}
		expect(anyStraddle).toBe(true);
	});

	it('refines the near-camera band to a high resolution', () => {
		const cam = lowOrbitCamera();
		const patches = scheduleAdaptiveOrbitPatches({
			cameraPos: cam.position,
			planetRadius: 100,
			viewProj: cam.viewProjectionMatrix,
			viewport,
			targetVertexSpacingPx: 6
		});
		expect(patches.length).toBeGreaterThan(0);
		const maxRes = Math.max(...patches.map((p) => p.resolution));
		// Straddling tiles are forced to the altitude's max resolution rather than
		// being under-tessellated from a truncated screen footprint.
		expect(maxRes).toBeGreaterThanOrEqual(64);
	});
});
