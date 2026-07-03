import { describe, expect, it } from 'vitest';
import { getPrimitive } from '@world-lab/graph';
import '@world-lab/graph';

import { evalNormalizeVec3 } from '../normalize.js';
import { evalNormalDisplace } from './normalDisplace.js';
import { planeGridPosition } from '../pipeline/planeGrid.js';

describe('math.normalize', () => {
	it('normalizes a non-unit vector', () => {
		const prim = getPrimitive('math.normalize')!;
		const result = prim.evalCPU!({ inputs: { v: [3, 4, 0] }, params: {} });
		expect(result.value).toEqual([0.6, 0.8, 0]);
	});

	it('matches evalNormalizeVec3 helper', () => {
		expect(evalNormalizeVec3([3, 4, 0])).toEqual([0.6, 0.8, 0]);
		expect(evalNormalizeVec3([0, 0, 0])).toEqual([0, 0, 0]);
	});
});

describe('transform.spherify', () => {
	it('returns unit-length positions', () => {
		const prim = getPrimitive('transform.spherify')!;
		const result = prim.evalCPU!({ inputs: { position: [3, 4, 0] }, params: {} });
		expect(result.position).toEqual([0.6, 0.8, 0]);
	});

	it('spherifies plane grid corners onto the unit sphere', () => {
		const prim = getPrimitive('transform.spherify')!;
		for (const vid of [0, 1, 2, 3, 4, 5]) {
			const local = planeGridPosition(vid, 2, 2);
			const sphere = prim.evalCPU!({ inputs: { position: local }, params: {} }).position as number[];
			const len = Math.hypot(sphere[0]!, sphere[1]!, sphere[2]!);
			expect(len).toBeCloseTo(1, 5);
		}
	});
});

describe('transform.normalDisplace', () => {
	it('offsets position along normal by height', () => {
		const prim = getPrimitive('transform.normalDisplace')!;
		const result = prim.evalCPU!({
			inputs: { position: [1, 0, 0], normal: [0, 1, 0], height: 2 },
			params: {}
		});
		expect(result.position).toEqual([1, 2, 0]);
	});

	it('matches evalNormalDisplace helper', () => {
		expect(evalNormalDisplace([0, 0, 1], [0, 0, 1], 0.5)).toEqual([0, 0, 1.5]);
	});
});
