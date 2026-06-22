import { describe, expect, it } from 'vitest';
import { focusedBodyCamera } from '../camera/orbitCamera.js';
import { invert4 } from '../math/mat4.js';
import { projectToScreen } from '../scene3d/orbitCamera.js';
import { dot3, len3, normalize3, sub3, type Vec3 } from '../math/vec.js';

// CPU mirror of common/idealSphere.wgsl's ray reconstruction + base-sphere intersection.
// The WGSL itself needs a GPU; this locks the math it relies on (inverse view-projection,
// the WebGPU pixel→NDC convention, and ray/sphere intersection) so a regression there is
// caught headlessly. See _docs/ideal-sphere-fragment-sampling.md.

/** Column-major mat4 (Float32Array) × vec4. */
function mulMatVec4(m: Float32Array, v: [number, number, number, number]): [number, number, number, number] {
	const out: [number, number, number, number] = [0, 0, 0, 0];
	for (let row = 0; row < 4; row++) {
		out[row] = m[0 * 4 + row] * v[0] + m[1 * 4 + row] * v[1] + m[2 * 4 + row] * v[2] + m[3 * 4 + row] * v[3];
	}
	return out;
}

function idealHit(
	fragX: number,
	fragY: number,
	width: number,
	height: number,
	invVp: Float32Array,
	camPos: Vec3,
	baseRadius: number
): { hit: false } | { hit: true; worldDir: Vec3; point: Vec3 } {
	const uv: [number, number] = [fragX / width, fragY / height];
	const ndc: [number, number] = [uv[0] * 2 - 1, 1 - uv[1] * 2];
	const farH = mulMatVec4(invVp, [ndc[0], ndc[1], 1, 1]);
	if (Math.abs(farH[3]) < 1e-12) return { hit: false };
	const farWorld: Vec3 = [farH[0] / farH[3], farH[1] / farH[3], farH[2] / farH[3]];
	const dir = normalize3(sub3(farWorld, camPos));
	const b = dot3(camPos, dir);
	const c = dot3(camPos, camPos) - baseRadius * baseRadius;
	const disc = b * b - c;
	if (disc < 0) return { hit: false };
	const sq = Math.sqrt(disc);
	let t = -b - sq;
	if (t < 0) t = -b + sq;
	if (t < 0) return { hit: false };
	const point: Vec3 = [camPos[0] + dir[0] * t, camPos[1] + dir[1] * t, camPos[2] + dir[2] * t];
	return { hit: true, worldDir: normalize3(point), point };
}

describe('ideal-sphere fragment coordinate (CPU mirror)', () => {
	const width = 1200;
	const height = 800;
	const radius = 5e5;
	const cam = focusedBodyCamera({ azimuth: 0.6, elevation: 0.35, distance: 1e6, planetRadius: radius, aspect: width / height });
	const invVp = invert4(cam.viewProjectionMatrix);
	const eye = cam.position;

	it('the centre pixel hits the sub-camera point on the base sphere', () => {
		const r = idealHit(width / 2, height / 2, width, height, invVp, eye, radius);
		expect(r.hit).toBe(true);
		if (!r.hit) return;
		expect(len3(r.point)).toBeCloseTo(radius, 0); // on the sphere
		const sub = normalize3(eye); // point facing the camera
		for (let i = 0; i < 3; i++) expect(r.worldDir[i]).toBeCloseTo(sub[i], 4);
	});

	it('reconstructed hits round-trip back to their pixel (ray ⊥ projection)', () => {
		for (const [px, py] of [[600, 400], [500, 380], [700, 420], [600, 300], [560, 500]] as const) {
			const r = idealHit(px, py, width, height, invVp, eye, radius);
			expect(r.hit).toBe(true);
			if (!r.hit) continue;
			expect(len3(r.point)).toBeCloseTo(radius, 0);
			const back = projectToScreen(cam.viewProjectionMatrix, r.point, width, height);
			expect(back).not.toBeNull();
			expect(back!.x).toBeCloseTo(px, 0);
			expect(back!.y).toBeCloseTo(py, 0);
		}
	});

	it('misses the sphere past the limb (the deferred grazing case → fallback)', () => {
		// The disc is centred on screen (camera targets the body); a pixel past the widest
		// horizontal extent clears it, so the shader falls back to the interpolated dir.
		const r = idealHit(width - 10, height / 2, width, height, invVp, eye, radius);
		expect(r.hit).toBe(false);
	});
});
