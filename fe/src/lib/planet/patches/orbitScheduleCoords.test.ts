import { describe, expect, it } from 'vitest';
import { createOrbitCamera } from '../camera/orbitCamera.js';
import { cubeFaceUvToUnitDir } from './cubeSphere.js';
import { patchScreenBounds } from './screenSpace.js';
import type { CubeSpherePatch } from './types.js';
import { quatFromAxisAngle } from '../scene/transform.js';
import {
	composeScheduleViewProj,
	scheduleHemisphereCamDir
} from './orbitScheduleCoords.js';
import { bodyDirToWorldPos } from './screenSpace.js';

describe('orbitScheduleCoords', () => {
	it('composed viewProj projects rotated corners like bodyDirToWorldPos', () => {
		const cam = createOrbitCamera({
			distance: 150,
			azimuth: 0.3,
			elevation: 0.25,
			fovDeg: 60,
			aspect: 16 / 9,
			near: 0.1,
			far: 10_000,
			planetRadius: 100
		});
		const rot = quatFromAxisAngle([0, 1, 0], 0.8);
		const patch: CubeSpherePatch = {
			kind: 'cubeSphere',
			id: 0,
			face: 4,
			uvMin: [0.2, 0.2],
			uvMax: [0.8, 0.8],
			resolution: 16,
			morph: 0
		};
		const schedVp = composeScheduleViewProj(cam.viewProjectionMatrix, rot);
		const composed = patchScreenBounds(schedVp, { width: 1280, height: 720 }, 100, patch);
		const rotated = patchScreenBounds(cam.viewProjectionMatrix, { width: 1280, height: 720 }, 100, patch, {
			planetRotation: rot
		});
		expect(composed.anyVisible).toBe(rotated.anyVisible);
		if (composed.anyVisible) {
			expect(composed.minX).toBeCloseTo(rotated.minX, 0);
			expect(composed.maxX).toBeCloseTo(rotated.maxX, 0);
		}
	});

	it('hemisphere cam dir matches dot(rot·body, cam) = dot(body, hemi)', () => {
		const camPos: [number, number, number] = [0, 0, 200];
		const rot = quatFromAxisAngle([0, 1, 0], 1.1);
		const bodyDir = cubeFaceUvToUnitDir(0, 0.5, 0.5);
		const hemi = scheduleHemisphereCamDir(camPos, rot);
		const world = bodyDirToWorldPos(bodyDir, 1, rot);
		const camDir = [camPos[0] / 200, camPos[1] / 200, camPos[2] / 200] as const;
		const viaWorld = world[0] * camDir[0] + world[1] * camDir[1] + world[2] * camDir[2];
		const viaHemi = bodyDir[0] * hemi[0] + bodyDir[1] * hemi[1] + bodyDir[2] * hemi[2];
		expect(viaHemi).toBeCloseTo(viaWorld, 5);
	});
});
