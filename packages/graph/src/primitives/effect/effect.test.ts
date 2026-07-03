import '@world-lab/graph';
import { describe, expect, it } from 'vitest';
import { getPrimitive } from '@world-lab/graph';

describe('effect.cosinePalette primitive', () => {
	it('registers with ShaderToy category and vec4 color output', () => {
		const prim = getPrimitive('effect.cosinePalette');
		expect(prim).toBeDefined();
		expect(prim!.category).toBe('ShaderToy');
		expect(prim!.outputs[0]?.dataType).toBe('vec4f');
		expect(prim!.wgsl!.moduleId).toBe('effect.cosinePalette');
		expect(prim!.wgsl!.entry).toBe('cosine_palette');
	});

	it('evalCPU matches cosine palette formula at origin', () => {
		const prim = getPrimitive('effect.cosinePalette');
		const result = prim!.evalCPU!({
			inputs: {
				fragCoord: [0, 0],
				iResolution: [64, 64],
				iTime: 0
			},
			params: {}
		});
		const color = result.color as number[];
		expect(color[0]).toBeCloseTo(1.0);
		expect(color[1]).toBeCloseTo(0.5 + 0.5 * Math.cos(2));
		expect(color[2]).toBeCloseTo(0.5 + 0.5 * Math.cos(4));
		expect(color[3]).toBe(1);
	});
});

describe('host ShaderToy input primitives', () => {
	it('registers fragCoord, iResolution, and iTime', () => {
		expect(getPrimitive('host.fragCoord')?.category).toBe('ShaderToy');
		expect(getPrimitive('host.iResolution')?.category).toBe('ShaderToy');
		expect(getPrimitive('host.iTime')?.category).toBe('ShaderToy');
	});
});
