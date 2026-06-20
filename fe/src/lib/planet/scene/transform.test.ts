import { describe, expect, it } from 'vitest';
import { eulerToQuat, quatToEuler, rotateVec3 } from './transform.js';

const DEG = Math.PI / 180;

describe('euler ⇄ quaternion', () => {
	it('round-trips angles away from gimbal lock', () => {
		for (const e of [
			[0, 0, 0],
			[0, 90 * DEG, 0],
			[30 * DEG, -45 * DEG, 60 * DEG]
		] as const) {
			const back = quatToEuler(eulerToQuat(e[0], e[1], e[2]));
			expect(back[0]).toBeCloseTo(e[0], 6);
			expect(back[1]).toBeCloseTo(e[1], 6);
			expect(back[2]).toBeCloseTo(e[2], 6);
		}
	});

	it('a 90° yaw (about Y) rotates +X to −Z', () => {
		const q = eulerToQuat(0, 90 * DEG, 0);
		const v = rotateVec3(q, [1, 0, 0]);
		expect(v[0]).toBeCloseTo(0, 6);
		expect(v[2]).toBeCloseTo(-1, 6);
	});
});
