import { describe, expect, it } from 'vitest';
import { getPrimitive } from '@world-lab/graph';
import '@world-lab/graph';

import { evalNormalizeVec3 } from '../normalize.js';
import { evalNormalDisplace } from './normalDisplace.js';
import { evalRotate } from './rotate.js';
import { evalScale } from './scale.js';
import { evalTranslate } from './translate.js';
import { planeGridEulerRotate, planeGridPosition } from '../pipeline/planeGrid.js';

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

describe('transform.translate', () => {
	it('adds offset to position', () => {
		const prim = getPrimitive('transform.translate')!;
		const result = prim.evalCPU!({
			inputs: { position: [1, 2, 3], offset: [0.5, -1, 2] },
			params: {}
		});
		expect(result.position).toEqual([1.5, 1, 5]);
	});

	it('matches evalTranslate helper', () => {
		expect(evalTranslate([1, 0, 0], [0, 2, 0])).toEqual([1, 2, 0]);
	});
});

describe('transform.scale', () => {
	it('scales position uniformly', () => {
		const prim = getPrimitive('transform.scale')!;
		const result = prim.evalCPU!({
			inputs: { position: [1, -2, 3], factor: 2 },
			params: {}
		});
		expect(result.position).toEqual([2, -4, 6]);
	});

	it('matches evalScale helper', () => {
		expect(evalScale([1, 2, 3], 0.5)).toEqual([0.5, 1, 1.5]);
	});
});

describe('transform.rotate', () => {
	it('returns input unchanged at identity rotation', () => {
		const prim = getPrimitive('transform.rotate')!;
		const input = [0.3, -0.7, 1.2];
		const result = prim.evalCPU!({ inputs: { position: input }, params: {} });
		expect(result.position).toEqual(input);
	});

	it('matches planeGridEulerRotate for non-zero angles', () => {
		const prim = getPrimitive('transform.rotate')!;
		const input = [1, 0, 0];
		const rotY = Math.PI / 2;
		const expected = planeGridEulerRotate(1, 0, 0, 0, rotY, 0);
		const result = prim.evalCPU!({
			inputs: { position: input },
			params: { rotationX: 0, rotationY: rotY, rotationZ: 0 }
		});
		expect(result.position).toEqual(expected);
	});

	it('matches evalRotate helper', () => {
		expect(evalRotate([1, 2, 0], 0, 0, 0)).toEqual([1, 2, 0]);
	});
});
