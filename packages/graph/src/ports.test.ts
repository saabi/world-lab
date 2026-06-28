import { describe, expect, it } from 'vitest';
import { compatibleDataTypes } from './ports.js';

describe('@virtual-planet/graph ports', () => {
	it('allows vec2f to vec3f promotion', () => {
		expect(compatibleDataTypes('vec2f', 'vec3f')).toBe(true);
	});

	it('rejects unrelated type pairs', () => {
		expect(compatibleDataTypes('vec2f', 'f32')).toBe(false);
	});

	it('allows T to list<T> and storageBuffer to list<T> connections', () => {
		expect(compatibleDataTypes('f32', 'list<f32>')).toBe(true);
		expect(compatibleDataTypes('vec2f', 'list<vec3f>')).toBe(true); // vec2f -> vec3f -> list<vec3f>
		expect(compatibleDataTypes('storageBuffer', 'list<f32>')).toBe(true);
		expect(compatibleDataTypes('f32', 'list<vec3f>')).toBe(false);
	});
});
