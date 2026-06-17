import type { Vec3 } from '../math/vec.js';
import { cross3, normalize3 } from '../math/vec.js';
import type { Quat, Transform } from './types.js';

export const IDENTITY_QUAT: Quat = [0, 0, 0, 1];

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

export interface WorldTransform {
	position: Vec3;
	rotation: Quat;
}

export function composeWorldTransform(parent: WorldTransform, local: Transform): WorldTransform {
	const rotatedPos = rotateVec3(parent.rotation, local.position);
	const position: Vec3 = [
		parent.position[0] + rotatedPos[0],
		parent.position[1] + rotatedPos[1],
		parent.position[2] + rotatedPos[2]
	];
	return {
		position,
		rotation: quatMultiply(parent.rotation, local.rotation)
	};
}

/** Local +X axis in world space (direction from planet center toward this node). */
export function worldPositiveX(world: WorldTransform): Vec3 {
	return normalize3(rotateVec3(world.rotation, [1, 0, 0]));
}

export function transformPoint(world: WorldTransform, local: Vec3): Vec3 {
	const rotated = rotateVec3(world.rotation, local);
	return [
		world.position[0] + rotated[0],
		world.position[1] + rotated[1],
		world.position[2] + rotated[2]
	];
}
