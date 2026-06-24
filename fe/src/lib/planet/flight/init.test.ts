import { describe, expect, it } from 'vitest';
import { gravityAccelerationAt, gravitationalParameter } from './gravity.js';
import { circularOrbitSpeed, initCircularOrbit } from './init.js';
import { len3 } from '../math/vec.js';

describe('gravity', () => {
	it('computes mu = g R^2', () => {
		expect(gravitationalParameter(9.8, 6.371e6)).toBeCloseTo(9.8 * 6.371e6 ** 2, -3);
	});

	it('gravity points inward', () => {
		const g = gravityAccelerationAt([1e7, 0, 0], gravitationalParameter(9.8, 6.371e6));
		expect(g[0]).toBeLessThan(0);
		expect(g[1]).toBeCloseTo(0);
	});
});

describe('initCircularOrbit', () => {
	it('circular speed matches sqrt(mu/r)', () => {
		const center: [number, number, number] = [0, 0, 0];
		const pos: [number, number, number] = [7e6, 0, 0];
		const ship = initCircularOrbit(pos, center, [0, 0, 0, 1], 9.8, 6.371e6);
		const expected = circularOrbitSpeed(pos, 9.8, 6.371e6);
		expect(len3(ship.velocity)).toBeCloseTo(expected, 3);
	});
});
