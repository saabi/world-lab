import type { Vec3 } from '../math/vec.js';
import type { Quat } from '../scene/types.js';

export type RcsAxisMode = 'translate' | 'rotate';
export type OrientationMode = 'free' | 'prograde' | 'retrograde';
export type FlightRegime = 'vacuum' | 'transition' | 'atmosphere';

/** Normalized -1..1 commands in ship body frame. Only one channel is driven per RCS mode. */
export interface FlightInput {
	translate: Vec3;
	rotate: Vec3;
	rcsMode: RcsAxisMode;
	boost: boolean;
	pointerLook?: { dx: number; dy: number };
}

export interface ShipState {
	position: Vec3;
	velocity: Vec3;
	rotation: Quat;
	angularVelocity: Vec3;
}

export interface SpaceflightSettings {
	thrustPower: number;
	torquePower: number;
	thrustMultiplier: number;
	rcsMode: RcsAxisMode;
	orientationMode: OrientationMode;
	targetBodyId: string | null;
	gravityG: number;
	mouseOffsetRot: Quat;
	predictionHorizonSeconds: number;
	predictionAutoPeriod: boolean;
}

export interface BodyGravitySource {
	bodyId: string;
	center: Vec3;
	radiusMeters: number;
	gravityG: number;
}

export interface OrbitPrediction {
	pathPoints: Vec3[];
	crashed: boolean;
	pePoint: Vec3 | null;
	apPoint: Vec3 | null;
}

export const IDENTITY_QUAT: Quat = [0, 0, 0, 1];

export function createDefaultShipState(): ShipState {
	return {
		position: [0, 0, 0],
		velocity: [0, 0, 0],
		rotation: IDENTITY_QUAT,
		angularVelocity: [0, 0, 0]
	};
}

export function defaultSpaceflightSettings(): SpaceflightSettings {
	return {
		thrustPower: 1,
		torquePower: 1,
		thrustMultiplier: 1,
		rcsMode: 'translate',
		orientationMode: 'free',
		targetBodyId: null,
		gravityG: 9.8,
		mouseOffsetRot: IDENTITY_QUAT,
		predictionHorizonSeconds: 600,
		predictionAutoPeriod: false
	};
}
