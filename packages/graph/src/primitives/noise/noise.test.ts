import { describe, expect, it } from 'vitest';

import { getPrimitive, listPrimitives } from '../../registry.js';
import { hash12, hash22, hash32 } from './hash2d.js';
import {
	HASH12_PARITY,
	HASH22_PARITY,
	HASH32_PARITY,
	NOISE2D_CPU_PARITY
} from './parityFixtures.js';
import './index.js';

describe('harvested 2D noise primitives', () => {
	it('registers the first-slice ids without collisions', () => {
		const ids = listPrimitives().map((primitive) => primitive.id);
		for (const id of [
			'noise.value2d',
			'noise.perlin2d',
			'noise.perlin2dDeriv',
			'noise.worley2d',
			'noise.voronoi2d',
			'noise.blue2d'
		]) {
			expect(ids).toContain(id);
		}
	});

	it('hash12 matches independent WGSL/f32 parity vectors', () => {
		for (const fixture of HASH12_PARITY) {
			expect(hash12(fixture.position)).toBe(fixture.value);
		}
	});

	it('hash22 matches independent WGSL/f32 parity vectors', () => {
		for (const fixture of HASH22_PARITY) {
			const value = hash22(fixture.position);
			expect(value[0]).toBe(fixture.value[0]);
			expect(value[1]).toBe(fixture.value[1]);
		}
	});

	it('hash32 matches independent WGSL/f32 parity vectors', () => {
		for (const fixture of HASH32_PARITY) {
			const value = hash32(fixture.position);
			expect(value[0]).toBe(fixture.value[0]);
			expect(value[1]).toBe(fixture.value[1]);
			expect(value[2]).toBe(fixture.value[2]);
		}
	});

	it('all six CPU evaluators match independent parity fixtures', () => {
		for (const fixture of NOISE2D_CPU_PARITY) {
			const evalCPU = getPrimitive(fixture.id)!.evalCPU!;
			const result = evalCPU({
				inputs: { position: [...fixture.position] },
				params: fixture.params ?? {}
			});
			for (const [key, expected] of Object.entries(fixture.output)) {
				const actual = result[key];
				if (Array.isArray(expected)) {
					expect(actual).toEqual([...expected]);
				} else {
					expect(actual).toBe(expected);
				}
			}
		}
	});

	it('all first-slice noise primitives are pure and deterministic', () => {
		for (const id of [
			'noise.value2d',
			'noise.perlin2d',
			'noise.perlin2dDeriv',
			'noise.worley2d',
			'noise.voronoi2d',
			'noise.blue2d'
		]) {
			const primitive = getPrimitive(id)!;
			expect(primitive.category).toBe('noise');
			expect(primitive.metadata?.pure).toBe(true);
			expect(primitive.metadata?.deterministic).toBe(true);
			expect(primitive.inputs[0]?.dataType).toBe('vec2f');
		}
	});
});
