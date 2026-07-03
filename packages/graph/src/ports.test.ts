import { describe, expect, it } from 'vitest';
import { compatibleDataTypes } from './ports.js';

describe('@world-lab/graph ports', () => {
	it('allows vec2f to vec3f promotion', () => {
		expect(compatibleDataTypes('vec2f', 'vec3f')).toBe(true);
		expect(compatibleDataTypes('vec2<f32>', 'vec3f')).toBe(true);
	});

	it('rejects unrelated type pairs', () => {
		expect(compatibleDataTypes('vec2f', 'f32')).toBe(false);
	});

	it('allows T to tuple<T> and storageBuffer to tuple<T> connections', () => {
		expect(compatibleDataTypes('f32', 'tuple<f32>')).toBe(true);
		expect(compatibleDataTypes('vec2f', 'tuple<vec3f>')).toBe(true); // vec2f -> vec3f -> tuple<vec3f>
		expect(compatibleDataTypes('storageBuffer', 'tuple<f32>')).toBe(true);
		expect(compatibleDataTypes('f32', 'tuple<vec3f>')).toBe(false);
	});
});
