import { describe, expect, it } from 'vitest';
import {
	createOrbitCamera,
	horizonLookTarget,
	orbitTravelDirection,
	perspective,
	quatFromAzimuthElevation
} from './orbitCamera.js';
import { rotateVec3 } from '../scene/transform.js';
import { dot3, len3, normalize3, sub3 } from '../math/vec.js';

describe('orbitCamera horizon look', () => {
	it('travel direction follows azimuth prograde', () => {
		const t = orbitTravelDirection(0, 0, 0.1);
		expect(t[0]).toBeCloseTo(0, 5);
		expect(t[2]).toBeCloseTo(1, 5);
	});

	it('reverses travel direction when orbit speed is negative', () => {
		const prograde = orbitTravelDirection(0.5, 0.3, 0.1);
		const retrograde = orbitTravelDirection(0.5, 0.3, -0.1);
		expect(prograde[0]).toBeCloseTo(-retrograde[0], 5);
		expect(prograde[2]).toBeCloseTo(-retrograde[2], 5);
	});

	it('horizon gaze is horizontal at the surface', () => {
		const pos: [number, number, number] = [100, 0, 0];
		const travel = orbitTravelDirection(0, 0, 0);
		const target = horizonLookTarget(pos, 100, travel);
		const gaze = normalize3(sub3(target, pos));
		expect(gaze[1]).toBeCloseTo(0, 5);
		expect(dot3(gaze, pos)).toBeCloseTo(0, 5);
	});

	it('horizon gaze tilts toward the planet when above the surface', () => {
		const pos: [number, number, number] = [200, 0, 0];
		const travel = orbitTravelDirection(0, 0, 0);
		const target = horizonLookTarget(pos, 100, travel);
		const gaze = normalize3(sub3(target, pos));
		expect(dot3(gaze, normalize3(pos))).toBeLessThan(0);
	});

	it('defaults to horizon look mode', () => {
		const cam = createOrbitCamera({
			distance: 320,
			azimuth: 0.6,
			elevation: 0.35,
			fovDeg: 60,
			aspect: 1,
			near: 0.1,
			far: 10_000,
			planetRadius: 100
		});
		expect(len3(cam.target)).toBeGreaterThan(0);
		expect(cam.target[0]).not.toBeCloseTo(0, 1);
	});

	it('planet-center mode looks at the origin', () => {
		const cam = createOrbitCamera({
			distance: 320,
			azimuth: 0.6,
			elevation: 0.35,
			fovDeg: 60,
			aspect: 1,
			near: 0.1,
			far: 10_000,
			planetRadius: 100,
			lookMode: 'planet-center'
		});
		expect(cam.target).toEqual([0, 0, 0]);
	});

	it('supports quaternion-based position and orientation', () => {
		const q = quatFromAzimuthElevation(0.6, 0.35);
		const cam = createOrbitCamera({
			distance: 320,
			azimuth: 0,
			elevation: 0,
			fovDeg: 60,
			aspect: 1,
			near: 0.1,
			far: 10_000,
			planetRadius: 100,
			cameraRotation: q
		});
		const expectedPos = rotateVec3(q, [320, 0, 0]);
		expect(cam.position[0]).toBeCloseTo(expectedPos[0], 5);
		expect(cam.position[1]).toBeCloseTo(expectedPos[1], 5);
		expect(cam.position[2]).toBeCloseTo(expectedPos[2], 5);
	});

	it('uses WebGPU depth range for perspective projection', () => {
		const near = 0.5;
		const far = 100;
		const p = perspective(60, 1, near, far);
		const projectZ = (z: number) => {
			const cz = p[10] * z + p[14];
			const cw = p[11] * z + p[15];
			return cz / cw;
		};
		expect(projectZ(-near)).toBeCloseTo(0, 5);
		expect(projectZ(-far)).toBeCloseTo(1, 5);
	});
});
