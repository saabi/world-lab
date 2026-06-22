import { geodeticToEcef } from '../math/geodetic.js';
import type { Vec3 } from '../math/vec.js';
import { add3, cross3, dot3, len3, normalize3, scale3, sub3 } from '../math/vec.js';
import type { CameraState } from './cameraModes.js';
import type { Quat } from '../scene/types.js';
import { rotateVec3, quatFromAxisAngle, quatMultiply } from '../scene/transform.js';

export type OrbitLookMode = 'planet-center' | 'horizon';

export interface OrbitCameraInput {
	distance: number;
	azimuth: number;
	elevation: number;
	fovDeg: number;
	aspect: number;
	near: number;
	far: number;
	planetRadius: number;
	lookMode?: OrbitLookMode;
	/** Sign determines travel direction for horizon look when non-zero. */
	orbitSpeedRadPerSec?: number;
	cameraRotation?: Quat;
}

export function quatFromAzimuthElevation(azimuth: number, elevation: number): Quat {
	const qAz = quatFromAxisAngle([0, -1, 0], azimuth);
	const localRight: Vec3 = [-Math.sin(azimuth), 0, Math.cos(azimuth)];
	const qEl = quatFromAxisAngle(localRight, elevation);
	return quatMultiply(qEl, qAz);
}

/** Unit tangent to the azimuth orbit (prograde when speed ≥ 0). */
export function orbitTravelDirection(
	azimuth: number,
	elevation: number,
	orbitSpeedRadPerSec = 0
): Vec3 {
	const cosEl = Math.cos(elevation);
	let forward: Vec3 = [-cosEl * Math.sin(azimuth), 0, cosEl * Math.cos(azimuth)];
	if (orbitSpeedRadPerSec < 0) forward = scale3(forward, -1);
	const l = len3(forward);
	if (l < 1e-8) return [1, 0, 0];
	return scale3(forward, 1 / l);
}

/** Gaze target for low-orbit horizon view along travel, planet below. */
export function horizonLookTarget(
	position: Vec3,
	planetRadius: number,
	travel: Vec3
): Vec3 {
	const outward = normalize3(position);
	const towardCenter = scale3(outward, -1);
	const dist = Math.max(len3(position), planetRadius);
	const dip = Math.acos(Math.min(1, planetRadius / dist));

	let horizontal = sub3(travel, scale3(outward, dot3(travel, outward)));
	if (len3(horizontal) < 1e-8) {
		horizontal = cross3(outward, Math.abs(outward[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]);
	}
	const forward = normalize3(horizontal);
	const gaze = normalize3(
		add3(scale3(forward, Math.cos(dip)), scale3(towardCenter, Math.sin(dip)))
	);
	return add3(position, scale3(gaze, dist));
}

export function createOrbitCamera(input: OrbitCameraInput): CameraState {
	const {
		distance,
		azimuth,
		elevation,
		fovDeg,
		aspect,
		near,
		far,
		planetRadius,
		lookMode = 'horizon',
		orbitSpeedRadPerSec = 0,
		cameraRotation
	} = input;

	const position: Vec3 = cameraRotation
		? rotateVec3(cameraRotation, [distance, 0, 0])
		: [
			distance * Math.cos(elevation) * Math.cos(azimuth),
			distance * Math.sin(elevation),
			distance * Math.cos(elevation) * Math.sin(azimuth)
		];

	const outward = normalize3(position);
	let target: Vec3 = [0, 0, 0];
	let viewUp: Vec3 = cameraRotation ? rotateVec3(cameraRotation, [0, 1, 0]) : [0, 1, 0];

	if (lookMode === 'horizon') {
		const travel = cameraRotation
			? rotateVec3(cameraRotation, [0, 0, 1])
			: orbitTravelDirection(azimuth, elevation, orbitSpeedRadPerSec);
		target = horizonLookTarget(position, planetRadius, travel);
		// Up = radial outward orthogonalized against the gaze, so up ⟂ gaze at every
		// altitude. A plain radial up goes (anti)parallel to the gaze as it dips
		// toward the planet center from afar, collapsing cross(forward, up) ∝
		// radius/distance and corrupting the view basis used for culling and LOD.
		const gaze = normalize3(sub3(target, position));
		viewUp = normalize3(sub3(outward, scale3(gaze, dot3(outward, gaze))));
	}
	const view = lookAt(position, target, viewUp);
	const projection = perspective(fovDeg, aspect, near, far);
	const viewProjection = multiply4(projection, view);
	const altitudeMeters = Math.max(len3(position) - planetRadius, 0);

	const currentAzimuth = cameraRotation
		? Math.atan2(position[2], position[0])
		: azimuth;
	const currentElevation = cameraRotation
		? Math.asin(position[1] / (len3(position) || 1))
		: elevation;

	const geo = { latRad: currentElevation, lonRad: currentAzimuth, altitudeMeters };
	const ecef = geodeticToEcef(geo);
	const focalLengthPx = (0.5 * 1080) / Math.tan((fovDeg * Math.PI) / 360);

	return {
		mode: 'orbit',
		geodetic: geo,
		ecef,
		altitudeMeters,
		viewMatrix: view,
		projectionMatrix: projection,
		viewProjectionMatrix: viewProjection,
		focalLengthPx,
		position,
		target,
		cameraRotation: cameraRotation ?? quatFromAzimuthElevation(azimuth, elevation)
	};
}

export function updateOrbitCamera(
	cam: CameraState,
	input: Partial<OrbitCameraInput>
): CameraState {
	return createOrbitCamera({
		distance: input.distance ?? len3(cam.position),
		azimuth: input.azimuth ?? Math.atan2(cam.position[2], cam.position[0]),
		elevation: input.elevation ?? Math.asin(cam.position[1] / (len3(cam.position) || 1)),
		fovDeg: input.fovDeg ?? 60,
		aspect: input.aspect ?? 1,
		near: input.near ?? 0.1,
		far: input.far ?? 100_000,
		planetRadius: input.planetRadius ?? 100,
		cameraRotation: input.cameraRotation ?? cam.cameraRotation
	});
}

export function lookAt(eye: Vec3, center: Vec3, up: Vec3): Float32Array {
	const f = normalize3(sub3(center, eye));
	let right = cross3(f, up);
	if (len3(right) < 1e-6) {
		// Gaze is (anti)parallel to up — fall back to any axis not parallel to f.
		const alt: Vec3 = Math.abs(f[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
		right = cross3(f, alt);
	}
	const s = normalize3(right);
	const u = cross3(s, f);
	return new Float32Array([
		s[0], u[0], -f[0], 0,
		s[1], u[1], -f[1], 0,
		s[2], u[2], -f[2], 0,
		-dot3(s, eye), -dot3(u, eye), dot3(f, eye), 1
	]);
}

/** Perspective projection for WebGPU clip space (z in [0, 1]). */
export function perspective(fovDeg: number, aspect: number, near: number, far: number): Float32Array {
	const f = 1 / Math.tan((fovDeg * Math.PI) / 360);
	const nf = 1 / (near - far);
	return new Float32Array([
		f / aspect, 0, 0, 0,
		0, f, 0, 0,
		0, 0, far * nf, -1,
		0, 0, near * far * nf, 0
	]);
}

export function multiply4(a: Float32Array, b: Float32Array): Float32Array {
	const out = new Float32Array(16);
	for (let col = 0; col < 4; col++) {
		for (let row = 0; row < 4; row++) {
			out[col * 4 + row] =
				a[row] * b[col * 4] +
				a[4 + row] * b[col * 4 + 1] +
				a[8 + row] * b[col * 4 + 2] +
				a[12 + row] * b[col * 4 + 3];
		}
	}
	return out;
}
