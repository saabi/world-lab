import { describe, expect, it } from 'vitest';
import { Value } from '@virtual-planet/schema';

import { getPrimitive } from '../../registry.js';
import '../index.js';

describe('vector utility primitives', () => {
	it('registers scalar constants, vector constructors, and component extractors', () => {
		expect(getPrimitive('constant.f32')).toBeDefined();
		expect(getPrimitive('vector.vec2f')).toMatchObject({
			inputs: [
				{ name: 'x', dataType: 'f32' },
				{ name: 'y', dataType: 'f32' }
			],
			outputs: [{ name: 'value', dataType: 'vec2f' }]
		});
		expect(getPrimitive('vector.vec3f.z')).toMatchObject({
			inputs: [{ name: 'value', dataType: 'vec3f' }],
			outputs: [{ name: 'z', dataType: 'f32' }]
		});
		expect(getPrimitive('vector.vec4f.w')).toMatchObject({
			inputs: [{ name: 'value', dataType: 'vec4f' }],
			outputs: [{ name: 'w', dataType: 'f32' }]
		});
	});

	it('registers common vector math primitives for vec2f, vec3f, and vec4f', () => {
		for (const type of ['vec2f', 'vec3f', 'vec4f'] as const) {
			expect(getPrimitive(`vector.add.${type}`)).toMatchObject({
				inputs: [
					{ name: 'a', dataType: type },
					{ name: 'b', dataType: type }
				],
				outputs: [{ name: 'value', dataType: type }]
			});
			expect(getPrimitive(`vector.mulScalar.${type}`)).toMatchObject({
				inputs: [
					{ name: 'value', dataType: type },
					{ name: 'scalar', dataType: 'f32' }
				],
				outputs: [{ name: 'value', dataType: type }]
			});
			expect(getPrimitive(`vector.dot.${type}`)).toMatchObject({
				inputs: [
					{ name: 'a', dataType: type },
					{ name: 'b', dataType: type }
				],
				outputs: [{ name: 'value', dataType: 'f32' }]
			});
			expect(getPrimitive(`vector.length.${type}`)).toMatchObject({
				inputs: [{ name: 'value', dataType: type }],
				outputs: [{ name: 'value', dataType: 'f32' }]
			});
			expect(getPrimitive(`vector.normalize.${type}`)).toMatchObject({
				inputs: [{ name: 'value', dataType: type }],
				outputs: [{ name: 'value', dataType: type }]
			});
			expect(getPrimitive(`vector.mix.${type}`)).toMatchObject({
				inputs: [
					{ name: 'a', dataType: type },
					{ name: 'b', dataType: type },
					{ name: 't', dataType: 'f32' }
				],
				outputs: [{ name: 'value', dataType: type }]
			});
		}
	});

	it('constant.f32 uses a TypeBox-backed default value', () => {
		const primitive = getPrimitive('constant.f32')!;
		expect(Value.Create(primitive.params)).toEqual({ value: 0 });
		expect(primitive.evalCPU!({ inputs: {}, params: { value: 2.5 } })).toEqual({ value: 2.5 });
	});

	it('constructs vec2f, vec3f, and vec4f from f32 components', () => {
		expect(
			getPrimitive('vector.vec2f')!.evalCPU!({ inputs: { x: 1, y: 2 }, params: {} })
		).toEqual({ value: [1, 2] });
		expect(
			getPrimitive('vector.vec3f')!.evalCPU!({ inputs: { x: 1, y: 2, z: 3 }, params: {} })
		).toEqual({ value: [1, 2, 3] });
		expect(
			getPrimitive('vector.vec4f')!.evalCPU!({
				inputs: { x: 1, y: 2, z: 3, w: 4 },
				params: {}
			})
		).toEqual({ value: [1, 2, 3, 4] });
	});

	it('extracts scalar components from vectors', () => {
		expect(
			getPrimitive('vector.vec2f.y')!.evalCPU!({ inputs: { value: [5, 6] }, params: {} })
		).toEqual({ y: 6 });
		expect(
			getPrimitive('vector.vec3f.z')!.evalCPU!({ inputs: { value: [5, 6, 7] }, params: {} })
		).toEqual({ z: 7 });
		expect(
			getPrimitive('vector.vec4f.w')!.evalCPU!({ inputs: { value: [5, 6, 7, 8] }, params: {} })
		).toEqual({ w: 8 });
	});

	it('adds and subtracts vectors component-wise', () => {
		expect(
			getPrimitive('vector.add.vec2f')!.evalCPU!({
				inputs: { a: [1, 2], b: [3, 4] },
				params: {}
			})
		).toEqual({ value: [4, 6] });
		expect(
			getPrimitive('vector.sub.vec3f')!.evalCPU!({
				inputs: { a: [5, 7, 11], b: [2, 3, 5] },
				params: {}
			})
		).toEqual({ value: [3, 4, 6] });
	});

	it('multiplies and divides vectors by scalars', () => {
		expect(
			getPrimitive('vector.mulScalar.vec3f')!.evalCPU!({
				inputs: { value: [1, -2, 3], scalar: 2 },
				params: {}
			})
		).toEqual({ value: [2, -4, 6] });
		expect(
			getPrimitive('vector.divScalar.vec4f')!.evalCPU!({
				inputs: { value: [8, 6, 4, 2], scalar: 2 },
				params: {}
			})
		).toEqual({ value: [4, 3, 2, 1] });
	});

	it('computes dot products and vector lengths', () => {
		expect(
			getPrimitive('vector.dot.vec4f')!.evalCPU!({
				inputs: { a: [1, 2, 3, 4], b: [5, 6, 7, 8] },
				params: {}
			})
		).toEqual({ value: 70 });
		expect(
			getPrimitive('vector.length.vec3f')!.evalCPU!({
				inputs: { value: [2, 3, 6] },
				params: {}
			})
		).toEqual({ value: 7 });
	});

	it('normalizes vectors with a stable zero-vector fallback', () => {
		expect(
			getPrimitive('vector.normalize.vec2f')!.evalCPU!({
				inputs: { value: [3, 4] },
				params: {}
			})
		).toEqual({ value: [0.6, 0.8] });
		expect(
			getPrimitive('vector.normalize.vec4f')!.evalCPU!({
				inputs: { value: [0, 0, 0, 0] },
				params: {}
			})
		).toEqual({ value: [0, 0, 0, 0] });
	});

	it('mixes vectors by a scalar factor', () => {
		expect(
			getPrimitive('vector.mix.vec3f')!.evalCPU!({
				inputs: { a: [0, 10, 20], b: [10, 20, 40], t: 0.25 },
				params: {}
			})
		).toEqual({ value: [2.5, 12.5, 25] });
	});

	it('combines smaller vectors and scalars into larger vectors', () => {
		expect(
			getPrimitive('vector.combine.vec2f_f32')!.evalCPU!({
				inputs: { xy: [1, 2], z: 3 },
				params: {}
			})
		).toEqual({ value: [1, 2, 3] });
		expect(
			getPrimitive('vector.combine.vec2f_f32')!.evalCPU!({
				inputs: { xy: [1, 2] },
				params: {}
			})
		).toEqual({ value: [1, 2, 0] });
		expect(
			getPrimitive('vector.combine.vec3f_f32')!.evalCPU!({
				inputs: { xyz: [1, 2, 3], w: 0.5 },
				params: {}
			})
		).toEqual({ value: [1, 2, 3, 0.5] });
		expect(
			getPrimitive('vector.combine.vec3f_f32')!.evalCPU!({
				inputs: { xyz: [1, 2, 3] },
				params: {}
			})
		).toEqual({ value: [1, 2, 3, 1] });
		expect(
			getPrimitive('vector.combine.vec2f_f32_f32')!.evalCPU!({
				inputs: { xy: [4, 5], z: 6, w: 7 },
				params: {}
			})
		).toEqual({ value: [4, 5, 6, 7] });
		expect(
			getPrimitive('vector.combine.vec2f_vec2f')!.evalCPU!({
				inputs: { xy: [1, 2], zw: [3, 4] },
				params: {}
			})
		).toEqual({ value: [1, 2, 3, 4] });
	});

	it('declares port defaults on combine appended scalars', () => {
		expect(getPrimitive('vector.combine.vec3f_f32')!.inputs).toEqual(
			expect.arrayContaining([
				{ name: 'xyz', dataType: 'vec3f' },
				{ name: 'w', dataType: 'f32', default: 1 }
			])
		);
		expect(getPrimitive('vector.combine.vec2f_f32')!.inputs).toEqual(
			expect.arrayContaining([{ name: 'z', dataType: 'f32', default: 0 }])
		);
	});
});
