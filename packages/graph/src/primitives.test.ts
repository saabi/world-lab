import { describe, expect, it } from 'vitest';
import { getPrimitive, listPrimitives } from './registry.js';
import './primitives/index.js'; // registers the standard set

describe('@virtual-planet/graph primitives', () => {
	it('registers and looks up primitives', () => {
		expect(getPrimitive('math.remap')).toBeDefined();
		expect(getPrimitive('procedural.uv')).toBeDefined();
		expect(listPrimitives().map((p) => p.id)).toContain('noise.perlin3d');
	});

	it('remap maps linearly', () => {
		const out = getPrimitive('math.remap')!.evalCPU!({ inputs: { x: 0.5 }, params: { inMin: 0, inMax: 1, outMin: 0, outMax: 10 } });
		expect(out.value).toBeCloseTo(5);
	});

	it('clamp bounds its input', () => {
		const clamp = getPrimitive('math.clamp')!.evalCPU!;
		expect(clamp({ inputs: { x: 2 }, params: { min: 0, max: 1 } }).value).toBe(1);
		expect(clamp({ inputs: { x: -1 }, params: { min: 0, max: 1 } }).value).toBe(0);
	});

	it('smoothstep is 0 / 0.5 / 1 at edges and midpoint', () => {
		const ss = getPrimitive('math.smoothstep')!.evalCPU!;
		const params = { edge0: 0, edge1: 1 };
		expect(ss({ inputs: { x: 0 }, params }).value).toBe(0);
		expect(ss({ inputs: { x: 1 }, params }).value).toBe(1);
		expect(ss({ inputs: { x: 0.5 }, params }).value).toBeCloseTo(0.5);
	});

	it('perlin3d evalCPU is deterministic and bounded', () => {
		const perlin = getPrimitive('noise.perlin3d')!.evalCPU!;
		const ctx = { inputs: { position: [1.5, -2.0, 0.25] }, params: {} };
		const a = perlin(ctx).value as number;
		const b = perlin(ctx).value as number;
		expect(a).toBe(b);
		expect(Math.abs(a)).toBeLessThanOrEqual(1.0001);
	});

	it('worley evalCPU is deterministic and in [0, 1]', () => {
		const worley = getPrimitive('noise.worley')!.evalCPU!;
		const ctx = { inputs: { position: [2.0, 3.5, -1.0] }, params: {} };
		const a = worley(ctx).value as number;
		const b = worley(ctx).value as number;
		expect(a).toBe(b);
		expect(a).toBeGreaterThanOrEqual(0);
		expect(a).toBeLessThanOrEqual(1);
	});

	it('fbm evalCPU is deterministic and bounded', () => {
		const fbm = getPrimitive('noise.fbm')!.evalCPU!;
		const ctx = {
			inputs: { position: [1.0, 2.0, 3.0] },
			params: { octaves: 4, persistence: 0.5, lacunarity: 2.0 }
		};
		const a = fbm(ctx).value as number;
		const b = fbm(ctx).value as number;
		expect(a).toBe(b);
		expect(Math.abs(a)).toBeLessThanOrEqual(1.0001);
	});

	it('add sums its inputs', () => {
		const add = getPrimitive('math.add')!.evalCPU!;
		expect(add({ inputs: { a: 3, b: 4 }, params: {} }).value).toBe(7);
	});

	it('multiply scales its inputs', () => {
		const multiply = getPrimitive('math.multiply')!.evalCPU!;
		expect(multiply({ inputs: { a: 3, b: 4 }, params: {} }).value).toBe(12);
	});

	it('mix interpolates between a and b', () => {
		const mix = getPrimitive('math.mix')!.evalCPU!;
		expect(mix({ inputs: { a: 0, b: 10, t: 0.5 }, params: {} }).value).toBeCloseTo(5);
		expect(mix({ inputs: { a: 2, b: 6, t: 0 }, params: {} }).value).toBe(2);
		expect(mix({ inputs: { a: 2, b: 6, t: 1 }, params: {} }).value).toBe(6);
	});

	it('pow raises x to the exponent', () => {
		const pow = getPrimitive('math.pow')!.evalCPU!;
		expect(pow({ inputs: { x: 3 }, params: { exponent: 2 } }).value).toBe(9);
		expect(pow({ inputs: { x: 8 }, params: { exponent: 1 / 3 } }).value).toBeCloseTo(2);
	});

	it('simplex evalCPU is deterministic and bounded', () => {
		const simplex = getPrimitive('noise.simplex')!.evalCPU!;
		const ctx = { inputs: { position: [0.75, -1.25, 2.0] }, params: {} };
		const a = simplex(ctx).value as number;
		const b = simplex(ctx).value as number;
		expect(a).toBe(b);
		expect(Math.abs(a)).toBeLessThanOrEqual(1.0001);
	});

	it('ridgedFbm evalCPU is deterministic and non-negative', () => {
		const ridged = getPrimitive('noise.ridgedFbm')!.evalCPU!;
		const ctx = {
			inputs: { position: [1.0, 2.0, 3.0] },
			params: { octaves: 4, persistence: 0.5, lacunarity: 2.0, offset: 1.0 }
		};
		const a = ridged(ctx).value as number;
		const b = ridged(ctx).value as number;
		expect(a).toBe(b);
		expect(a).toBeGreaterThanOrEqual(0);
	});

	it('bias is identity at 0.5 and pulls toward zero below 0.5', () => {
		const bias = getPrimitive('math.bias')!.evalCPU!;
		expect(bias({ inputs: { x: 0.5 }, params: { bias: 0.5 } }).value).toBeCloseTo(0.5);
		expect(bias({ inputs: { x: 0.5 }, params: { bias: 0.25 } }).value).toBeCloseTo(0.25);
	});

	it('gain is identity at 0.5', () => {
		const gain = getPrimitive('math.gain')!.evalCPU!;
		expect(gain({ inputs: { x: 0.25 }, params: { gain: 0.5 } }).value).toBeCloseTo(0.25);
		expect(gain({ inputs: { x: 0.75 }, params: { gain: 0.5 } }).value).toBeCloseTo(0.75);
	});

	it('abs returns the magnitude of x', () => {
		const abs = getPrimitive('math.abs')!.evalCPU!;
		expect(abs({ inputs: { x: -3.5 }, params: {} }).value).toBe(3.5);
	});

	it('procedural.metricPosition is registered with vec3f position output', () => {
		const primitive = getPrimitive('procedural.metricPosition');
		expect(primitive).toBeDefined();
		expect(primitive!.category).toBe('procedural');
		expect(primitive!.inputs).toHaveLength(0);
		expect(primitive!.outputs).toHaveLength(1);
		expect(primitive!.outputs[0]).toMatchObject({
			name: 'position',
			dataType: 'vec3f'
		});
	});

	it('procedural.metricPosition evalCPU returns ctx.procedural.metricPosition', () => {
		const evalCPU = getPrimitive('procedural.metricPosition')!.evalCPU!;
		expect(evalCPU({ inputs: {}, params: {}, procedural: { metricPosition: [1, 2, 3] } })).toEqual({
			position: [1, 2, 3]
		});
		expect(evalCPU({ inputs: {}, params: {} })).toEqual({ position: [0, 0, 0] });
	});
});
