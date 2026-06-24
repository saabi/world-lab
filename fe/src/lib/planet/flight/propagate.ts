import {
	add3,
	cross3,
	dot3,
	len3,
	normalize3,
	scale3,
	sub3,
	type Vec3
} from '../math/vec.js';
import {
	quatFromAxisAngle,
	quatFromRotationMatrix,
	quatMultiply,
	rotateVec3
} from '../scene/transform.js';
import type { BodyAtmosphere, Quat } from '../scene/types.js';
import { atmosphereBlend, altitudeAboveSurface } from './atmosphereDensity.js';
import {
	atmosphereFlightContext,
	atmosphereForces,
	type AtmosphereFlightSettings
} from './atmosphereFlight.js';
import { gravityFromBody } from './gravity.js';
import type { BodyGravitySource, FlightInput, OrientationMode, ShipState, SpaceflightSettings } from './types.js';
import { IDENTITY_QUAT } from './types.js';

export interface PropagateContext {
	body: BodyGravitySource;
	atmosphere?: BodyAtmosphere;
	atmoSettings?: AtmosphereFlightSettings;
	wasInAtmosphere?: boolean;
}

export interface PropagateResult {
	ship: ShipState;
	mouseOffsetRot: Quat;
	orientationMode: OrientationMode;
	inAtmosphere: boolean;
	atmoBlend: number;
}

function buildProgradeFrame(
	relPosition: Vec3,
	velocity: Vec3,
	mode: 'prograde' | 'retrograde'
): { forward: Vec3; right: Vec3; up: Vec3 } | null {
	const speed = len3(velocity);
	if (speed < 0.01) return null;
	const velDir = normalize3(velocity);
	const forward = mode === 'prograde' ? velDir : scale3(velDir, -1);
	const b = scale3(forward, -1);
	const outward = normalize3(relPosition);
	let dotVal = dot3(outward, b);
	let u = sub3(outward, scale3(b, dotVal));
	let lenU = len3(u);
	if (lenU < 1e-4) {
		const north: Vec3 = [0, 1, 0];
		dotVal = dot3(north, b);
		u = sub3(north, scale3(b, dotVal));
		lenU = len3(u);
	}
	if (lenU < 1e-4) {
		const refX: Vec3 = [1, 0, 0];
		dotVal = dot3(refX, b);
		u = sub3(refX, scale3(b, dotVal));
		lenU = len3(u);
	}
	u = scale3(u, 1 / (lenU || 1));
	const right = normalize3(cross3(u, b));
	return { forward, right, up: u };
}

function applyAutopilotOrientation(
	ship: ShipState,
	relPosition: Vec3,
	orientationMode: OrientationMode,
	mouseOffsetRot: Quat
): { rotation: Quat; mouseOffsetRot: Quat; orientationMode: OrientationMode } {
	if (orientationMode === 'free') {
		return { rotation: ship.rotation, mouseOffsetRot, orientationMode };
	}
	const frame = buildProgradeFrame(relPosition, ship.velocity, orientationMode);
	if (!frame) {
		return { rotation: ship.rotation, mouseOffsetRot, orientationMode: 'free' };
	}
	const autoRot = quatFromRotationMatrix(frame.right, frame.up, scale3(frame.forward, -1));
	return {
		rotation: quatMultiply(autoRot, mouseOffsetRot),
		mouseOffsetRot,
		orientationMode
	};
}

function integrateRotation(rotation: Quat, angularVelocity: Vec3, dt: number): Quat {
	const wx = angularVelocity[0] * dt;
	const wy = angularVelocity[1] * dt;
	const wz = angularVelocity[2] * dt;
	let next = rotation;
	if (Math.abs(wx) > 1e-8) next = quatMultiply(next, quatFromAxisAngle([1, 0, 0], wx));
	if (Math.abs(wy) > 1e-8) next = quatMultiply(next, quatFromAxisAngle([0, 1, 0], wy));
	if (Math.abs(wz) > 1e-8) next = quatMultiply(next, quatFromAxisAngle([0, 0, 1], wz));
	return next;
}

function applyPointerLook(rotation: Quat, look: { dx: number; dy: number } | undefined): Quat {
	if (!look || (look.dx === 0 && look.dy === 0)) return rotation;
	const sens = 0.0025;
	const qYaw = quatFromAxisAngle([0, 1, 0], -look.dx * sens);
	const qPitch = quatFromAxisAngle([1, 0, 0], -look.dy * sens);
	return quatMultiply(quatMultiply(rotation, qYaw), qPitch);
}

export function propagateShip(
	ship: ShipState,
	input: FlightInput,
	settings: SpaceflightSettings,
	ctx: PropagateContext,
	dt: number
): PropagateResult {
	if (dt <= 0) {
		return {
			ship,
			mouseOffsetRot: settings.mouseOffsetRot,
			orientationMode: settings.orientationMode,
			inAtmosphere: false,
			atmoBlend: 0
		};
	}

	const relPosition = sub3(ship.position, ctx.body.center);
	const dist = len3(relPosition);

	let mouseOffsetRot = settings.mouseOffsetRot;
	let orientationMode = settings.orientationMode;

	const autopilot = applyAutopilotOrientation(ship, relPosition, orientationMode, mouseOffsetRot);
	let rotation = autopilot.rotation;
	mouseOffsetRot = autopilot.mouseOffsetRot;
	orientationMode = autopilot.orientationMode;

	rotation = applyPointerLook(rotation, input.pointerLook);

	const camForward = rotateVec3(rotation, [0, 0, -1]);
	const camRight = rotateVec3(rotation, [1, 0, 0]);
	const camUp = rotateVec3(rotation, [0, 1, 0]);

	let forward = camForward;
	let right = camRight;
	let up = camUp;

	if (orientationMode !== 'free') {
		const frame = buildProgradeFrame(relPosition, ship.velocity, orientationMode);
		if (frame) {
			forward = frame.forward;
			right = frame.right;
			up = frame.up;
		}
	}

	const altitude = Math.max(1, dist - ctx.body.radiusMeters);
	const thrusterPower =
		Math.max(5.0, altitude * 0.15) * settings.thrustMultiplier * settings.thrustPower;

	const atmo = ctx.atmosphere ?? null;
	let atmoBlend = 0;
	let inAtmosphere = ctx.wasInAtmosphere ?? false;
	if (atmo?.enabled) {
		const altM = altitudeAboveSurface(relPosition, ctx.body.radiusMeters);
		const shell = Math.max(atmo.shellHeightMeters, ctx.body.radiusMeters * 0.05);
		const enterAlt = shell;
		const exitAlt = shell * 1.1;
		if (inAtmosphere) {
			inAtmosphere = altM < exitAlt;
		} else {
			inAtmosphere = altM < enterAlt;
		}
		atmoBlend = inAtmosphere ? atmosphereBlend(altM, atmo) : 0;
	}

	let thrustScale = 1;
	let torqueScale = 1;
	let dragAccel: Vec3 = [0, 0, 0];
	let angularDamp: Vec3 = [0, 0, 0];

	if (atmo && atmoBlend > 0) {
		const aCtx = atmosphereFlightContext(
			relPosition,
			ship.velocity,
			atmo,
			ctx.body.radiusMeters,
			atmoBlend
		);
		const forces = atmosphereForces(aCtx, ship, ctx.atmoSettings);
		dragAccel = forces.dragAccel;
		thrustScale = forces.thrustScale;
		torqueScale = forces.torqueScale;
		angularDamp = forces.angularDamp;
	}

	const boost = input.boost ? 3 : 1;
	let thrustDir: Vec3 = [0, 0, 0];
	const t = input.translate;
	thrustDir = add3(thrustDir, scale3(forward, t[2]));
	thrustDir = add3(thrustDir, scale3(right, t[0]));
	thrustDir = add3(thrustDir, scale3(up, t[1]));

	const thrustLen = len3(thrustDir);
	const thrustAcceleration =
		thrustLen > 0
			? scale3(thrustDir, (thrusterPower * thrustScale * boost) / thrustLen)
			: ([0, 0, 0] as Vec3);

	const gravityAcceleration = gravityFromBody(relPosition, ctx.body);
	const totalAcc = add3(add3(gravityAcceleration, thrustAcceleration), dragAccel);

	let velocity: Vec3 = [
		ship.velocity[0] + totalAcc[0] * dt,
		ship.velocity[1] + totalAcc[1] * dt,
		ship.velocity[2] + totalAcc[2] * dt
	];

	let position: Vec3 = [
		ship.position[0] + velocity[0] * dt,
		ship.position[1] + velocity[1] * dt,
		ship.position[2] + velocity[2] * dt
	];

	const minRadius = ctx.body.radiusMeters + 1.0;
	const newRel = sub3(position, ctx.body.center);
	const newDist = len3(newRel);
	if (newDist < minRadius) {
		position = add3(ctx.body.center, scale3(normalize3(newRel), minRadius));
		const out = normalize3(newRel);
		const radialVelMag = dot3(velocity, out);
		if (radialVelMag < 0) {
			velocity = sub3(velocity, scale3(out, radialVelMag));
		}
	}

	const r = input.rotate;
	const torque: Vec3 = [
		r[0] * settings.torquePower * torqueScale * boost,
		r[1] * settings.torquePower * torqueScale * boost,
		r[2] * settings.torquePower * torqueScale * boost
	];
	let angularVelocity: Vec3 = [
		ship.angularVelocity[0] + (torque[0] + angularDamp[0]) * dt,
		ship.angularVelocity[1] + (torque[1] + angularDamp[1]) * dt,
		ship.angularVelocity[2] + (torque[2] + angularDamp[2]) * dt
	];

	if (orientationMode !== 'free' && r[2] !== 0) {
		const qRoll = quatFromAxisAngle([0, 0, -1], r[2] * settings.torquePower * dt);
		mouseOffsetRot = quatMultiply(mouseOffsetRot, qRoll);
		angularVelocity = [0, 0, 0];
	} else {
		rotation = integrateRotation(rotation, angularVelocity, dt);
	}

	return {
		ship: { position, velocity, rotation, angularVelocity },
		mouseOffsetRot,
		orientationMode,
		inAtmosphere,
		atmoBlend
	};
}

export function releaseOrientation(settings: SpaceflightSettings): SpaceflightSettings {
	return { ...settings, orientationMode: 'free', mouseOffsetRot: IDENTITY_QUAT };
}

export function setOrientationMode(
	settings: SpaceflightSettings,
	mode: 'prograde' | 'retrograde'
): SpaceflightSettings {
	return { ...settings, orientationMode: mode, mouseOffsetRot: IDENTITY_QUAT };
}
