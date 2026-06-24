import { dot3, len3, normalize3, scale3, sub3, type Vec3 } from '../math/vec.js';
import type { BodyGravitySource } from './types.js';

export function gravitationalParameter(gravityG: number, radiusMeters: number): number {
	return gravityG * radiusMeters * radiusMeters;
}

/** Gravity acceleration at position relative to body center. */
export function gravityAccelerationAt(relPosition: Vec3, mu: number): Vec3 {
	const dist = len3(relPosition);
	if (dist < 1e-6) return [0, 0, 0];
	const gMag = mu / (dist * dist);
	return scale3(normalize3(relPosition), -gMag);
}

export function gravityFromBody(relPosition: Vec3, body: BodyGravitySource): Vec3 {
	const mu = gravitationalParameter(body.gravityG, body.radiusMeters);
	return gravityAccelerationAt(relPosition, mu);
}

export function gravityMagnitudeAt(relPosition: Vec3, body: BodyGravitySource): number {
	const dist = len3(relPosition);
	const mu = gravitationalParameter(body.gravityG, body.radiusMeters);
	return mu / (dist * dist || 1);
}

export function radialSpeed(velocity: Vec3, relPosition: Vec3): number {
	const dist = len3(relPosition);
	if (dist < 1e-6) return 0;
	return dot3(velocity, normalize3(relPosition));
}
