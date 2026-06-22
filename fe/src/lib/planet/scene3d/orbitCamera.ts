import type { Vec3 } from '../math/vec.js';
import { cross3, normalize3, sub3 } from '../math/vec.js';

// Orbit camera + the column-major 4x4 math the scene-3d pass needs (mat4.ts only has
// invert4). WebGPU clip space: z ∈ [0, 1]. See scene-3d-viewport.md.

export interface OrbitCamera {
	/** Azimuth (radians) around +Y. */
	azimuth: number;
	/** Elevation (radians) from the XZ plane; clamped near ±90°. */
	elevation: number;
	/** Distance from the target (metres). */
	distance: number;
	/** World-space point the camera orbits. */
	target: Vec3;
}

export const FOVY = Math.PI / 3;
const EL_LIMIT = Math.PI / 2 - 0.05;

export function clampElevation(e: number): number {
	return Math.max(-EL_LIMIT, Math.min(EL_LIMIT, e));
}

/** Camera eye position from the orbit parameters. */
export function cameraEye(cam: OrbitCamera): Vec3 {
	const ce = Math.cos(cam.elevation);
	const dir: Vec3 = [ce * Math.cos(cam.azimuth), Math.sin(cam.elevation), ce * Math.sin(cam.azimuth)];
	return [
		cam.target[0] + cam.distance * dir[0],
		cam.target[1] + cam.distance * dir[1],
		cam.target[2] + cam.distance * dir[2]
	];
}

/** Column-major a·b. */
export function multiply4(a: Float32Array, b: Float32Array): Float32Array {
	const out = new Float32Array(16);
	for (let c = 0; c < 4; c++) {
		for (let r = 0; r < 4; r++) {
			out[c * 4 + r] =
				a[0 * 4 + r] * b[c * 4 + 0] +
				a[1 * 4 + r] * b[c * 4 + 1] +
				a[2 * 4 + r] * b[c * 4 + 2] +
				a[3 * 4 + r] * b[c * 4 + 3];
		}
	}
	return out;
}

/** Right-handed look-at view matrix (camera looks down -Z). */
export function lookAt(eye: Vec3, target: Vec3, up: Vec3 = [0, 1, 0]): Float32Array {
	const z = normalize3(sub3(eye, target)); // forward = eye→target is -z
	const x = normalize3(cross3(up, z));
	const y = cross3(z, x);
	const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
	// prettier-ignore
	return new Float32Array([
		x[0], y[0], z[0], 0,
		x[1], y[1], z[1], 0,
		x[2], y[2], z[2], 0,
		-dot(x, eye), -dot(y, eye), -dot(z, eye), 1
	]);
}

/** Perspective projection for WebGPU (z ∈ [0,1]). */
export function perspective(fovy: number, aspect: number, near: number, far: number): Float32Array {
	const f = 1 / Math.tan(fovy / 2);
	const nf = 1 / (near - far);
	// prettier-ignore
	return new Float32Array([
		f / aspect, 0, 0, 0,
		0, f, 0, 0,
		0, 0, far * nf, -1,
		0, 0, near * far * nf, 0
	]);
}

/** The camera's near/far — shared by the scene view and per-body floating-origin views
 *  so their depth is directly comparable. */
function nearFar(distance: number): [number, number] {
	return [Math.max(1, distance * 0.002), distance * 20];
}

/** View·projection for the camera at the given aspect ratio. */
export function viewProjection(cam: OrbitCamera, aspect: number): Float32Array {
	const view = lookAt(cameraEye(cam), cam.target);
	const [near, far] = nearFar(cam.distance);
	return multiply4(perspective(FOVY, aspect, near, far), view);
}

/**
 * Floating-origin view for rendering a body at the LOCAL origin while keeping it
 * pixel- and depth-identical to where it sits under the scene camera. The body-relative
 * camera is the scene camera translated by −bodyWorldPos (same rotation + projection),
 * so a body-local point Q lands at the same clip position as the world point Q +
 * bodyWorldPos under {@link viewProjection}. Returns the view·projection and the
 * body-relative eye (for the terrain scheduler). Lets a procedural body render into the
 * shared depth, occluding/occluded by the spheres correctly. See
 * _docs/specs/unified-scene-renderer.md.
 */
export function bodyRelativeView(
	cam: OrbitCamera,
	bodyWorldPos: Vec3,
	aspect: number
): { viewProjection: Float32Array; eye: Vec3 } {
	const eye = sub3(cameraEye(cam), bodyWorldPos);
	const target = sub3(cam.target, bodyWorldPos);
	const view = lookAt(eye, target);
	const [near, far] = nearFar(cam.distance);
	return { viewProjection: multiply4(perspective(FOVY, aspect, near, far), view), eye };
}

// NOTE: building a full `CameraState` for a scene body is now `focusedBodyCamera()` in
// `../camera/orbitCamera.ts` — the shared focused-body builder (plan Phase 1). For the
// isolated procedural canvas the camera targets the body, so it sits at the local origin
// and `focusedBodyCamera` == the old floating-origin `sceneBodyCamera` (the orbit test
// locks the equivalence). `bodyRelativeView` above stays for the Phase-5 shared-depth
// composite, where the body renders at its world offset among the spheres.

/**
 * Project a world point to canvas pixels through a (column-major) view·projection.
 * Returns null if behind the camera. `depth` is the clip-space w (≈ view distance),
 * for front-most picking and projected-size estimates.
 */
export function projectToScreen(
	vp: Float32Array,
	p: Vec3,
	width: number,
	height: number
): { x: number; y: number; depth: number } | null {
	const cx = vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12];
	const cy = vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13];
	const cw = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15];
	if (cw <= 1e-6) return null; // behind the camera
	return { x: (cx / cw * 0.5 + 0.5) * width, y: (1 - (cy / cw * 0.5 + 0.5)) * height, depth: cw };
}
