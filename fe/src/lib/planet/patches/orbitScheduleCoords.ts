import type { Vec3 } from '../math/vec.js';
import { normalize3 } from '../math/vec.js';
import { multiply4 } from '../scene3d/orbitCamera.js';
import type { Quat } from '../scene/types.js';
import { IDENTITY_QUAT, isIdentityQuat, rotateVec3 } from '../scene/transform.js';

/** Column-major pure rotation mat4 from a unit quaternion. */
export function quatToMat4(q: Quat): Float32Array {
	const [x, y, z, w] = q;
	const xx = x * x;
	const yy = y * y;
	const zz = z * z;
	const xy = x * y;
	const xz = x * z;
	const yz = y * z;
	const wx = w * x;
	const wy = w * y;
	const wz = w * z;
	return new Float32Array([
		1 - 2 * (yy + zz),
		2 * (xy + wz),
		2 * (xz - wy),
		0,
		2 * (xy - wz),
		1 - 2 * (xx + zz),
		2 * (yz + wx),
		0,
		2 * (xz + wy),
		2 * (yz - wx),
		1 - 2 * (xx + yy),
		0,
		0,
		0,
		0,
		1
	]);
}

/**
 * View-projection for patch culling: projects body-fixed corners at `body_dir × radius`
 * as the vertex shader does after `world_dir = rot · body_dir`.
 */
export function composeScheduleViewProj(
	viewProj: Float32Array,
	planetRotation: Quat = IDENTITY_QUAT
): Float32Array {
	if (isIdentityQuat(planetRotation)) return viewProj;
	return multiply4(viewProj, quatToMat4(planetRotation));
}

/**
 * Camera direction for hemisphere / facing tests against body-fixed `body_dir`:
 * dot(rot·body_dir, cam_dir) = dot(body_dir, hemi_cam_dir).
 */
export function scheduleHemisphereCamDir(cameraPos: Vec3, planetRotation: Quat = IDENTITY_QUAT): Vec3 {
	if (isIdentityQuat(planetRotation)) return normalize3(cameraPos);
	const inv: Quat = [
		-planetRotation[0],
		-planetRotation[1],
		-planetRotation[2],
		planetRotation[3]
	];
	return normalize3(rotateVec3(inv, cameraPos));
}
