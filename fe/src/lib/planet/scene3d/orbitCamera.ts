import type { Vec3 } from '../math/vec.js';
import { cross3, len3, normalize3, sub3 } from '../math/vec.js';
import type { CameraState } from '../camera/cameraModes.js';
import { quatFromRotationMatrix } from '../scene/transform.js';
import { geodeticToEcef } from '../math/geodetic.js';

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

export const FOVY = Math.PI / 4;
const EL_LIMIT = Math.PI / 2 - 0.05;

export function clampElevation(e: number): number {
	return Math.max(-EL_LIMIT, Math.min(EL_LIMIT, e));
}

/** Camera eye position from the orbit parameters. */
export function cameraEye(cam: OrbitCamera): Vec3 {
	const ce = Math.cos(cam.elevation);
	const dir: Vec3 = [ce * Math.sin(cam.azimuth), Math.sin(cam.elevation), ce * Math.cos(cam.azimuth)];
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

/**
 * A full `CameraState` (what the terrain/atmosphere passes consume) for a scene body,
 * built from the floating-origin {@link bodyRelativeView}: the body at the local
 * origin, rendered at world scale (set `params.radius = body.radiusMeters` — the
 * terrain is scale-invariant), screen- and depth-matched to the spheres. `planetRadius`
 * is the body's physical radius (metres).
 */
export function sceneBodyCamera(
	cam: OrbitCamera,
	bodyWorldPos: Vec3,
	planetRadius: number,
	aspect: number
): CameraState {
	const eye = sub3(cameraEye(cam), bodyWorldPos);
	const target = sub3(cam.target, bodyWorldPos);
	const view = lookAt(eye, target);
	const [near, far] = nearFar(cam.distance);
	const projection = perspective(FOVY, aspect, near, far);
	const viewProjection = multiply4(projection, view);

	const dist = len3(eye) || 1;
	const altitudeMeters = Math.max(dist - planetRadius, 0);
	const geodetic = {
		latRad: Math.asin(Math.max(-1, Math.min(1, eye[1] / dist))),
		lonRad: Math.atan2(eye[2], eye[0]),
		altitudeMeters
	};
	// View basis rows → camera rotation (as buildFreeFlyCamera does).
	const s: Vec3 = [view[0], view[4], view[8]];
	const u: Vec3 = [view[1], view[5], view[9]];
	const b: Vec3 = [view[2], view[6], view[10]];

	return {
		mode: 'orbit',
		geodetic,
		ecef: geodeticToEcef(geodetic),
		altitudeMeters,
		viewMatrix: view,
		projectionMatrix: projection,
		viewProjectionMatrix: viewProjection,
		focalLengthPx: (0.5 * 1080) / Math.tan(FOVY / 2),
		position: eye,
		target,
		cameraRotation: quatFromRotationMatrix(s, u, b)
	};
}

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
