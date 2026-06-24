import { describe, expect, it } from 'vitest';
import { cubeFaceUvToUnitDir } from './cubeSphere.js';
import { bodyDirToWorldDir, bodyDirToWorldPos } from './screenSpace.js';
import { quatFromAxisAngle, rotateVec3 } from '../scene/transform.js';

describe('body-fixed tessellation coordinates', () => {
	it('keeps body_dir invariant for fixed cube UV across rotations', () => {
		const bodyDir = cubeFaceUvToUnitDir(0, 0.35, 0.62);
		const spinA = quatFromAxisAngle([0, 1, 0], 0.4);
		const spinB = quatFromAxisAngle([0, 1, 0], 2.1);
		expect(bodyDirToWorldDir(bodyDir, spinA)).not.toEqual(bodyDirToWorldDir(bodyDir, spinB));
		expect(cubeFaceUvToUnitDir(0, 0.35, 0.62)).toEqual(bodyDir);
	});

	it('places world_pos by rotating body_dir (CPU mirror of cube-sphere VS)', () => {
		const bodyDir = cubeFaceUvToUnitDir(4, 0.5, 0.5);
		const rot = quatFromAxisAngle([0, 1, 0], Math.PI / 3);
		const r = 100;
		const world = bodyDirToWorldPos(bodyDir, r, rot);
		const expected = rotateVec3(rot, bodyDir).map((c) => c * r);
		expect(world[0]).toBeCloseTo(expected[0]!, 5);
		expect(world[1]).toBeCloseTo(expected[1]!, 5);
		expect(world[2]).toBeCloseTo(expected[2]!, 5);
	});
});
