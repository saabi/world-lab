import { describe, expect, it } from 'vitest';
import { atmosphereBlend, atmosphereDensity } from './atmosphereDensity.js';
import { defaultBodyAtmosphere } from '../scene/bodyAtmosphere.js';
import { flightRegimeFromBlend } from './atmosphereFlight.js';
import { propagateShip } from './propagate.js';
import { defaultSpaceflightSettings } from './types.js';
import type { BodyGravitySource } from './types.js';
import { len3 } from '../math/vec.js';

describe('atmosphereDensity', () => {
	it('density decreases with altitude', () => {
		const atmo = defaultBodyAtmosphere(6.371e6);
		expect(atmosphereDensity(0, atmo)).toBeGreaterThan(atmosphereDensity(100_000, atmo));
	});

	it('blend is zero above shell', () => {
		const atmo = defaultBodyAtmosphere(6.371e6);
		expect(atmosphereBlend(atmo.shellHeightMeters + 1000, atmo)).toBe(0);
	});
});

describe('propagateShip', () => {
	const body: BodyGravitySource = {
		bodyId: 'earth',
		center: [0, 0, 0],
		radiusMeters: 6.371e6,
		gravityG: 9.8
	};

	it('rotate mode torque changes nothing in translate channel', () => {
		const ship = {
			position: [7e6, 0, 0] as [number, number, number],
			velocity: [0, 7800, 0] as [number, number, number],
			rotation: [0, 0, 0, 1] as [number, number, number, number],
			angularVelocity: [0, 0, 0] as [number, number, number]
		};
		const settings = defaultSpaceflightSettings();
		const result = propagateShip(
			ship,
			{ translate: [0, 0, 0], rotate: [0, 1, 0], rcsMode: 'rotate', boost: false },
			settings,
			{ body },
			0.1
		);
		expect(len3(result.ship.angularVelocity)).toBeGreaterThan(0);
	});

	it('flightRegimeFromBlend', () => {
		expect(flightRegimeFromBlend(0)).toBe('vacuum');
		expect(flightRegimeFromBlend(0.5)).toBe('transition');
		expect(flightRegimeFromBlend(1)).toBe('atmosphere');
	});
});
