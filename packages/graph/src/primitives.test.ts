import { describe, expect, it } from 'vitest';
import { getPrimitive, listPrimitives } from './registry.js';
import './primitives/index.js'; // registers the standard set

describe('@virtual-planet/graph primitives', () => {
	it('registers and looks up primitives', () => {
		expect(getPrimitive('math.remap')).toBeDefined();
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
});
