import type { Vec3 } from '../math/vec.js';
import { cross3, normalize3 } from '../math/vec.js';
import type { Quat, Transform } from './types.js';

export const IDENTITY_QUAT: Quat = [0, 0, 0, 1];

export function isIdentityQuat(q: Quat, eps = 1e-5): boolean {
	return Math.hypot(q[0], q[1], q[2]) < eps && Math.abs(Math.abs(q[3]) - 1) < eps;
}

/** True when a and b represent the same rotation (q and -q equivalent). */
export function quatNear(a: Quat, b: Quat, eps = 1e-4): boolean {
	const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
	return Math.abs(Math.abs(d) - 1) < eps;
}

export function quatFromAxisAngle(axis: Vec3, angleRad: number): Quat {
	const half = angleRad * 0.5;
	const s = Math.sin(half);
	const c = Math.cos(half);
	const n = normalize3(axis);
	return [n[0] * s, n[1] * s, n[2] * s, c];
}

export function quatMultiply(a: Quat, b: Quat): Quat {
	return [
		a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
		a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
		a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
		a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
	];
}

export function rotateVec3(q: Quat, v: Vec3): Vec3 {
	const qv: Vec3 = [q[0], q[1], q[2]];
	const t = cross3(qv, v);
	const t2 = cross3(qv, t);
	return [
		v[0] + 2 * (q[3] * t[0] + t2[0]),
		v[1] + 2 * (q[3] * t[1] + t2[1]),
		v[2] + 2 * (q[3] * t[2] + t2[2])
	];
}

/** Euler angles (radians, ZYX / roll-pitch-yaw about x,y,z) → quaternion. */
export function eulerToQuat(x: number, y: number, z: number): Quat {
	const cr = Math.cos(x * 0.5);
	const sr = Math.sin(x * 0.5);
	const cp = Math.cos(y * 0.5);
	const sp = Math.sin(y * 0.5);
	const cy = Math.cos(z * 0.5);
	const sy = Math.sin(z * 0.5);
	return [
		sr * cp * cy - cr * sp * sy,
		cr * sp * cy + sr * cp * sy,
		cr * cp * sy - sr * sp * cy,
		cr * cp * cy + sr * sp * sy
	];
}

/** Quaternion → Euler angles (radians, ZYX / roll-pitch-yaw about x,y,z). */
export function quatToEuler(q: Quat): [number, number, number] {
	const [x, y, z, w] = q;
	const sinr = 2 * (w * x + y * z);
	const cosr = 1 - 2 * (x * x + y * y);
	const roll = Math.atan2(sinr, cosr);
	const sinp = 2 * (w * y - z * x);
	const pitch = Math.abs(sinp) >= 1 ? Math.sign(sinp) * (Math.PI / 2) : Math.asin(sinp);
	const siny = 2 * (w * z + x * y);
	const cosy = 1 - 2 * (y * y + z * z);
	const yaw = Math.atan2(siny, cosy);
	return [roll, pitch, yaw];
}

export const UNIT_SCALE: Vec3 = [1, 1, 1];

export function mulVec3(a: Vec3, b: Vec3): Vec3 {
	return [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
}

export interface WorldTransform {
	position: Vec3;
	rotation: Quat;
	scale: Vec3;
}

export function composeWorldTransform(parent: WorldTransform, local: Transform): WorldTransform {
	// Standard TRS: the parent's scale scales the child's local offset before
	// rotating + translating; world scale is the component-wise product.
	const scaledPos = mulVec3(parent.scale, local.position);
	const rotatedPos = rotateVec3(parent.rotation, scaledPos);
	return {
		position: [
			parent.position[0] + rotatedPos[0],
			parent.position[1] + rotatedPos[1],
			parent.position[2] + rotatedPos[2]
		],
		rotation: quatMultiply(parent.rotation, local.rotation),
		scale: mulVec3(parent.scale, local.scale ?? UNIT_SCALE)
	};
}

/** Local +X axis in world space (direction from planet center toward this node). */
export function worldPositiveX(world: WorldTransform): Vec3 {
	return normalize3(rotateVec3(world.rotation, [1, 0, 0]));
}

/** Rotate + scale a vector in node-local space (no translation). */
export function transformOffset(world: WorldTransform, local: Vec3): Vec3 {
	return rotateVec3(world.rotation, mulVec3(world.scale, local));
}

/** Full TRS: local point → world position. */
export function transformPoint(world: WorldTransform, local: Vec3): Vec3 {
	const offset = transformOffset(world, local);
	return [
		world.position[0] + offset[0],
		world.position[1] + offset[1],
		world.position[2] + offset[2]
	];
}

export function quatFromRotationMatrix(s: Vec3, u: Vec3, b: Vec3): Quat {
	const r00 = s[0], r01 = u[0], r02 = b[0];
	const r10 = s[1], r11 = u[1], r12 = b[1];
	const r20 = s[2], r21 = u[2], r22 = b[2];

	const tr = r00 + r11 + r22;
	if (tr > 0) {
		const S = Math.sqrt(tr + 1.0) * 2;
		return [
			(r21 - r12) / S,
			(r02 - r20) / S,
			(r10 - r01) / S,
			0.25 * S
		];
	} else if (r00 > r11 && r00 > r22) {
		const S = Math.sqrt(1.0 + r00 - r11 - r22) * 2;
		return [
			0.25 * S,
			(r01 + r10) / S,
			(r02 + r20) / S,
			(r21 - r12) / S
		];
	} else if (r11 > r22) {
		const S = Math.sqrt(1.0 + r11 - r00 - r22) * 2;
		return [
			(r01 + r10) / S,
			0.25 * S,
			(r12 + r21) / S,
			(r02 - r20) / S
		];
	} else {
		const S = Math.sqrt(1.0 + r22 - r00 - r11) * 2;
		return [
			(r02 + r20) / S,
			(r12 + r21) / S,
			0.25 * S,
			(r10 - r01) / S
		];
	}
}
