import { describe, expect, it } from 'vitest';
import {
	bodyRelativeView,
	cameraEye,
	FOVY,
	perspective,
	projectToScreen,
	sceneBodyCamera,
	viewProjection,
	type OrbitCamera
} from './orbitCamera.js';
import { createOrbitCamera } from '../camera/orbitCamera.js';
import { add3, type Vec3 } from '../math/vec.js';

const cam: OrbitCamera = { azimuth: 0.6, elevation: 0.35, distance: 1e7, target: [0, 0, 0] };

describe('bodyRelativeView (floating origin)', () => {
	it('uses the planet camera azimuth basis and fov', () => {
		expect(FOVY).toBeCloseTo(Math.PI / 3, 6);
		expect(cameraEye({ azimuth: 0, elevation: 0, distance: 10, target: [0, 0, 0] })).toEqual([
			10, 0, 0
		]);
	});

	it('uses WebGPU depth range for perspective projection', () => {
		const near = 1;
		const far = 100;
		const p = perspective(FOVY, 1, near, far);
		const projectZ = (z: number) => {
			const cz = p[10] * z + p[14];
			const cw = p[11] * z + p[15];
			return cz / cw;
		};
		expect(projectZ(-near)).toBeCloseTo(0, 5);
		expect(projectZ(-far)).toBeCloseTo(1, 5);
	});

	it('renders a body at its world position, screen- and depth-matched to the scene camera', () => {
		const aspect = 1.5;
		const bodyWorldPos: Vec3 = [1e6, 2e5, -5e5];
		const sceneVp = viewProjection(cam, aspect);
		const { viewProjection: bodyVp } = bodyRelativeView(cam, bodyWorldPos, aspect);

		// A body-local point Q must land where the world point Q + bodyWorldPos lands
		// under the scene camera — same screen position and same clip depth.
		const Q: Vec3 = [1e4, -5e3, 2e4];
		const local = projectToScreen(bodyVp, Q, 1200, 800);
		const world = projectToScreen(sceneVp, add3(Q, bodyWorldPos), 1200, 800);
		expect(local).not.toBeNull();
		expect(world).not.toBeNull();
		expect(local!.x).toBeCloseTo(world!.x, 2);
		expect(local!.y).toBeCloseTo(world!.y, 2);
		expect(local!.depth / world!.depth).toBeCloseTo(1, 4); // relative (depths are ~1e7)
	});

	it('sceneBodyCamera carries bodyRelativeView into a CameraState', () => {
		const body: Vec3 = [1e6, 2e5, -5e5];
		const { viewProjection: vp, eye } = bodyRelativeView(cam, body, 1.5);
		const cs = sceneBodyCamera(cam, body, 5e5, 1.5);
		expect(Array.from(cs.viewProjectionMatrix)).toEqual(Array.from(vp));
		expect(cs.position).toEqual(eye);
		expect(cs.mode).toBe('orbit');
		expect(cs.altitudeMeters).toBeGreaterThan(0);
	});

	it('matches the planet-center orbit camera for a body at the origin', () => {
		const distance = 1_000_000;
		const radius = 500_000;
		const aspect = 1.5;
		const near = Math.max(1, distance * 0.002);
		const far = distance * 20;
		const sceneCam: OrbitCamera = {
			azimuth: 0.6,
			elevation: 0.35,
			distance,
			target: [0, 0, 0]
		};
		const bodyCam = sceneBodyCamera(sceneCam, [0, 0, 0], radius, aspect);
		const planetCam = createOrbitCamera({
			distance,
			azimuth: sceneCam.azimuth,
			elevation: sceneCam.elevation,
			fovDeg: 60,
			aspect,
			near,
			far,
			planetRadius: radius,
			lookMode: 'planet-center'
		});

		for (let i = 0; i < 3; i++) {
			expect(bodyCam.position[i]).toBeCloseTo(planetCam.position[i], 5);
		}
		for (let i = 0; i < 16; i++) {
			expect(bodyCam.viewMatrix[i]).toBeCloseTo(planetCam.viewMatrix[i], 5);
			expect(bodyCam.projectionMatrix[i]).toBeCloseTo(planetCam.projectionMatrix[i], 5);
			expect(bodyCam.viewProjectionMatrix[i]).toBeCloseTo(planetCam.viewProjectionMatrix[i], 5);
		}
	});

	it('centres the body on screen when the camera targets it (the close-body case)', () => {
		const body: Vec3 = [3e5, 1e5, 4e5];
		const { viewProjection: bodyVp } = bodyRelativeView({ ...cam, target: body }, body, 1.5);
		const centre = projectToScreen(bodyVp, [0, 0, 0], 1200, 800); // body's local origin
		expect(centre).not.toBeNull();
		expect(centre!.x).toBeCloseTo(600, 0); // width / 2
		expect(centre!.y).toBeCloseTo(400, 0); // height / 2
	});
});
