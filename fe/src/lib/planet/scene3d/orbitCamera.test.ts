import { describe, expect, it } from 'vitest';
import { bodyRelativeView, projectToScreen, viewProjection, type OrbitCamera } from './orbitCamera.js';
import { add3, type Vec3 } from '../math/vec.js';

const cam: OrbitCamera = { azimuth: 0.6, elevation: 0.35, distance: 1e7, target: [0, 0, 0] };

describe('bodyRelativeView (floating origin)', () => {
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

	it('centres the body on screen when the camera targets it (the close-body case)', () => {
		const body: Vec3 = [3e5, 1e5, 4e5];
		const { viewProjection: bodyVp } = bodyRelativeView({ ...cam, target: body }, body, 1.5);
		const centre = projectToScreen(bodyVp, [0, 0, 0], 1200, 800); // body's local origin
		expect(centre).not.toBeNull();
		expect(centre!.x).toBeCloseTo(600, 0); // width / 2
		expect(centre!.y).toBeCloseTo(400, 0); // height / 2
	});
});
