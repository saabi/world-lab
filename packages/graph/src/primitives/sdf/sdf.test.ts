import { describe, expect, it } from 'vitest';

import { getPrimitive, listPrimitives } from '../../registry.js';
import { evalSdfBox } from './box.js';
import { evalSdfCircle } from './circle.js';
import { evalOpIntersect, evalOpSubtract, evalOpUnion } from './ops.js';
import './index.js';

describe('harvested SDF primitives', () => {
	it('registers without id collisions', () => {
		const ids = listPrimitives().map((primitive) => primitive.id);
		for (const id of ['sdf.circle', 'sdf.box', 'sdf.segment', 'sdf.opSubtract']) {
			expect(ids).toContain(id);
		}
		expect(ids).not.toContain('sdf.opUnion');
		expect(ids).not.toContain('sdf.opIntersect');
	});

	it('sdf.circle returns negative distance inside a unit circle', () => {
		const out = getPrimitive('sdf.circle')!.evalCPU!({
			inputs: { p: [0, 0] },
			params: { radius: 1 }
		});
		expect(out.distance).toBe(-1);
		expect(evalSdfCircle(1, 0, 1)).toBe(0);
	});

	it('sdf.box is negative at the center of a unit box', () => {
		expect(
			getPrimitive('sdf.box')!.evalCPU!({
				inputs: { p: [0, 0] },
				params: { halfX: 0.5, halfY: 0.5 }
			}).distance
		).toBeLessThan(0);
		expect(evalSdfBox(0, 0, 0.5, 0.5)).toBe(-0.5);
	});

	it('sdf CSG ops combine distances', () => {
		expect(evalOpUnion(0.2, 0.5)).toBe(0.2);
		expect(evalOpSubtract(0.2, -0.1)).toBe(0.2);
		expect(evalOpIntersect(0.2, 0.5)).toBe(0.5);
	});
});
