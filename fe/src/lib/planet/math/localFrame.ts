import { ecefToGeodetic, type GeodeticPosition } from './geodetic.js';
import { ecefToLocalFloat } from './ecef.js';
import type { Vec3, Vec3d } from './vec.js';
import { cross3, dot3, normalize3, sub3 } from './vec.js';
import type { Quat } from '../scene/types.js';
import { rotateVec3 } from '../scene/transform.js';

export interface LocalFrame {
	originEcef: Vec3d;
	east: Vec3d;
	north: Vec3d;
	up: Vec3d;
	/** Planet center (0,0,0) expressed in the local tangent frame. */
	planetCenterLocal: Vec3;
	cameraLocal: Vec3;
	rebaseCount: number;
}

/** Build a tangent frame at the camera foot point on a planet-centered sphere. */
export function buildLocalFrame(cameraWorld: Vec3, planetRadiusMeters: number): LocalFrame {
	const upWorld = normalize3(cameraWorld);
	const footWorld: Vec3d = [
		upWorld[0] * planetRadiusMeters,
		upWorld[1] * planetRadiusMeters,
		upWorld[2] * planetRadiusMeters
	];
	const lonRad = Math.atan2(cameraWorld[2], cameraWorld[0]);
	const latRad = Math.asin(upWorld[1]);
	const east: Vec3d = [-Math.sin(lonRad), Math.cos(lonRad), 0];
	const north: Vec3d = normalize3(cross3([east[0], east[1], east[2]], upWorld));
	const originEcef = footWorld;
	const planetCenterLocal = ecefToLocalFloat([0, 0, 0], originEcef, east, north, upWorld);
	const cameraLocal = ecefToLocalFloat(
		[cameraWorld[0], cameraWorld[1], cameraWorld[2]],
		originEcef,
		east,
		north,
		upWorld
	);
	void planetRadiusMeters;
	return {
		originEcef,
		east,
		north,
		up: [upWorld[0], upWorld[1], upWorld[2]],
		planetCenterLocal,
		cameraLocal,
		rebaseCount: 0
	};
}

/** Rotate tangent basis into body space so surface-patch UVs yield spin-invariant body_dir. */
export function localFrameInBodySpace(frame: LocalFrame, planetRotation: Quat): LocalFrame {
	const inv: Quat = [
		-planetRotation[0],
		-planetRotation[1],
		-planetRotation[2],
		planetRotation[3]
	];
	const east = rotateVec3(inv, [frame.east[0], frame.east[1], frame.east[2]]);
	const north = rotateVec3(inv, [frame.north[0], frame.north[1], frame.north[2]]);
	const up = rotateVec3(inv, [frame.up[0], frame.up[1], frame.up[2]]);
	return {
		...frame,
		east: [east[0], east[1], east[2]],
		north: [north[0], north[1], north[2]],
		up: [up[0], up[1], up[2]]
	};
}

export function createLocalViewProjection(
	frame: LocalFrame,
	forward: Vec3,
	fovDeg: number,
	aspect: number,
	near: number,
	far: number
): { viewMatrix: Float32Array; projectionMatrix: Float32Array; viewProjectionMatrix: Float32Array } {
	const eye: Vec3 = [0, 0, 0];
	const center = forward;
	const up: Vec3 = [frame.up[0], frame.up[1], frame.up[2]];
	const f = normalize3(sub3(center, eye));
	const s = normalize3(cross3(f, up));
	const u = cross3(s, f);
	const view = new Float32Array([
		s[0], u[0], -f[0], 0,
		s[1], u[1], -f[1], 0,
		s[2], u[2], -f[2], 0,
		-dot3(s, eye), -dot3(u, eye), dot3(f, eye), 1
	]);
	const fov = 1 / Math.tan((fovDeg * Math.PI) / 360);
	const nf = 1 / (near - far);
	const projection = new Float32Array([
		fov / aspect, 0, 0, 0,
		0, fov, 0, 0,
		0, 0, (far + near) * nf, -1,
		0, 0, 2 * far * near * nf, 0
	]);
	const viewProjection = multiply4(projection, view);
	return { viewMatrix: view, projectionMatrix: projection, viewProjectionMatrix: viewProjection };
}

function multiply4(a: Float32Array, b: Float32Array): Float32Array {
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

export function maybeRebaseFrame(
	frame: LocalFrame,
	cameraEcef: Vec3d,
	thresholdMeters = 10_000
): LocalFrame {
	const dx = cameraEcef[0] - frame.originEcef[0];
	const dy = cameraEcef[1] - frame.originEcef[1];
	const dz = cameraEcef[2] - frame.originEcef[2];
	const dist = Math.hypot(dx, dy, dz);
	if (dist < thresholdMeters) return frame;
	const camWorld: Vec3 = [cameraEcef[0], cameraEcef[1], cameraEcef[2]];
	const radius = Math.hypot(camWorld[0], camWorld[1], camWorld[2]) || 100;
	const next = buildLocalFrame(camWorld, radius);
	next.rebaseCount = frame.rebaseCount + 1;
	return next;
}

export function cameraGeodetic(cameraEcef: Vec3d): GeodeticPosition {
	return ecefToGeodetic(cameraEcef);
}
