import { cross3, dot3, len3, normalize3, scale3, sub3, type Vec3 } from '../math/vec.js';
import type { Quat } from '../scene/types.js';
import { rotateVec3 } from '../scene/transform.js';
import { gravitationalParameter } from './gravity.js';
import type { ShipState } from './types.js';

/** Circular orbit speed at |relPosition| around a body. */
export function circularOrbitSpeed(relPosition: Vec3, gravityG: number, radiusMeters: number): number {
	const dist = len3(relPosition);
	const mu = gravitationalParameter(gravityG, radiusMeters);
	return Math.sqrt(mu / (dist || 1));
}

/** Tangent direction perpendicular to radial, preferring camera forward projected onto orbital plane. */
export function orbitTangentDirection(
	relPosition: Vec3,
	preferredForward: Vec3
): Vec3 {
	const outward = normalize3(relPosition);
	let tangent = sub3(preferredForward, scale3(outward, dot3(preferredForward, outward)));
	let lenT = len3(tangent);
	if (lenT < 1e-4) {
		const right = cross3(outward, Math.abs(outward[1]) < 0.9 ? ([0, 1, 0] as Vec3) : ([1, 0, 0] as Vec3));
		tangent = right;
		lenT = len3(tangent);
	}
	return scale3(tangent, 1 / (lenT || 1));
}

export function initCircularOrbit(
	worldPosition: Vec3,
	bodyCenter: Vec3,
	rotation: Quat,
	gravityG: number,
	radiusMeters: number
): ShipState {
	const rel = sub3(worldPosition, bodyCenter);
	const forward = rotateVec3(rotation, [0, 0, -1]);
	const tangent = orbitTangentDirection(rel, forward);
	const speed = circularOrbitSpeed(rel, gravityG, radiusMeters);
	return {
		position: [...worldPosition] as Vec3,
		velocity: scale3(tangent, speed),
		rotation: [...rotation] as Quat,
		angularVelocity: [0, 0, 0]
	};
}

export function killVelocity(ship: ShipState): ShipState {
	return { ...ship, velocity: [0, 0, 0], angularVelocity: [0, 0, 0] };
}

export function circularizeVelocity(
	ship: ShipState,
	bodyCenter: Vec3,
	gravityG: number,
	radiusMeters: number
): ShipState {
	const rel = sub3(ship.position, bodyCenter);
	const speed = circularOrbitSpeed(rel, gravityG, radiusMeters);
	const tangent = orbitTangentDirection(rel, ship.velocity);
	return { ...ship, velocity: scale3(tangent, speed) };
}
