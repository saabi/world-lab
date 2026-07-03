import { describe, expect, it } from 'vitest';
import { getPrimitive } from '@world-lab/graph';
import '@world-lab/graph';

import { cubeFaceUvToPosition } from './cubeFaceMath.js';

describe('surface.cubeFace', () => {
	it('maps UV on face 0 to +X cube coordinates', () => {
		const prim = getPrimitive('surface.cubeFace')!;
		const result = prim.evalCPU!({
			inputs: { uv: [0.5, 0.5] },
			params: { face: 0 }
		});
		const position = result.position as number[];
		expect(position[0]).toBe(1);
		expect(position[1]).toBeCloseTo(0, 6);
		expect(position[2]).toBeCloseTo(0, 6);
	});

	it('matches cubeFaceUvToPosition helper byte-for-byte', () => {
		expect(cubeFaceUvToPosition(4, 0.25, 0.75)).toEqual([-0.5, 0.5, 1]);
	});
});
