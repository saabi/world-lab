import { add3, dot3, len3, scale3, sub3, type Vec3 } from '../math/vec.js';
import type { BodyAtmosphere } from '../scene/types.js';
import { atmosphereDensity } from './atmosphereDensity.js';
import type { ShipState } from './types.js';

export type FlightRegime = 'vacuum' | 'transition' | 'atmosphere';

export interface AtmosphereFlightSettings {
	dragCoeff: number;
	angularDampCoeff: number;
	minAuthority: number;
}

export const DEFAULT_ATMOSPHERE_FLIGHT: AtmosphereFlightSettings = {
	dragCoeff: 0.8,
	angularDampCoeff: 2.0,
	minAuthority: 0.3
};

export interface AtmosphereFlightContext {
	altitudeM: number;
	density: number;
	dynamicPressure: number;
	blend: number;
}

export function atmosphereFlightContext(
	relPosition: Vec3,
	velocity: Vec3,
	atmo: BodyAtmosphere,
	radiusMeters: number,
	blend: number
): AtmosphereFlightContext {
	const dist = len3(relPosition);
	const altitudeM = Math.max(0, dist - radiusMeters);
	const density = atmosphereDensity(altitudeM, atmo);
	const speed = len3(velocity);
	const dynamicPressure = 0.5 * density * speed * speed;
	return { altitudeM, density, dynamicPressure, blend };
}

export interface AtmosphereForces {
	dragAccel: Vec3;
	angularDamp: Vec3;
	thrustScale: number;
	torqueScale: number;
}

export function atmosphereForces(
	ctx: AtmosphereFlightContext,
	ship: ShipState,
	settings: AtmosphereFlightSettings = DEFAULT_ATMOSPHERE_FLIGHT
): AtmosphereForces {
	const { density, blend } = ctx;
	const speed = len3(ship.velocity);
	const dragAccel: Vec3 =
		speed > 1e-4
			? scale3(
					[
						-ship.velocity[0] / speed,
						-ship.velocity[1] / speed,
						-ship.velocity[2] / speed
					],
					settings.dragCoeff * density * speed * blend
				)
			: [0, 0, 0];

	const angularDamp = scale3(ship.angularVelocity, -settings.angularDampCoeff * density * blend);
	const authority = 1 - blend * (1 - settings.minAuthority);

	return {
		dragAccel,
		angularDamp,
		thrustScale: authority,
		torqueScale: authority
	};
}

export function combineAcceleration(vacuum: Vec3, atmo: Vec3, blend: number): Vec3 {
	return add3(vacuum, scale3(sub3(atmo, vacuum), blend));
}

export function flightRegimeFromBlend(blend: number): 'vacuum' | 'transition' | 'atmosphere' {
	if (blend <= 0.01) return 'vacuum';
	if (blend >= 0.99) return 'atmosphere';
	return 'transition';
}
