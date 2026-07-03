import { describe, expect, it } from 'vitest';
import './primitives/index.js';
import { listPrimitives } from './registry.js';
import {
	canonicalDataType,
	dataTypeToWgsl,
	formatPortDefaultWgsl,
	isCanonicalDataType
} from './dataType.js';
import { compatibleDataTypes } from './ports.js';

describe('@world-lab/graph canonicalDataType', () => {
	it('folds WGSL long-form and alias spellings to short aliases', () => {
		expect(canonicalDataType('vec2<f32>')).toBe('vec2f');
		expect(canonicalDataType('vec2< f32 >')).toBe('vec2f');
		expect(canonicalDataType('vec2f')).toBe('vec2f');
		expect(canonicalDataType('tuple<vec3<f32>>')).toBe('tuple<vec3f>');
	});

	it('round-trips value types through dataTypeToWgsl', () => {
		for (const dataType of ['f32', 'bool', 'vec2f', 'vec3f', 'vec4f'] as const) {
			expect(canonicalDataType(dataTypeToWgsl(dataType))).toBe(dataType);
		}
	});

	it('connects vec2<f32> and vec2f ports', () => {
		expect(compatibleDataTypes('vec2<f32>', 'vec2f')).toBe(true);
		expect(compatibleDataTypes('vec2f', 'vec2<f32>')).toBe(true);
	});

	it('formats scalar and vector port defaults for WGSL', () => {
		expect(formatPortDefaultWgsl(0, 'f32')).toBe('0.0');
		expect(formatPortDefaultWgsl(1, 'f32')).toBe('1.0');
		expect(formatPortDefaultWgsl([0, 0, 0, 1], 'vec4f')).toBe('vec4<f32>(0.0, 0.0, 0.0, 1.0)');
	});
});

describe('@world-lab/graph primitive port canonical guard', () => {
	it('registers every primitive port dataType in canonical form', () => {
		for (const primitive of listPrimitives()) {
			for (const port of [...primitive.inputs, ...primitive.outputs]) {
				expect(isCanonicalDataType(port.dataType!)).toBe(true);
				expect(canonicalDataType(port.dataType!)).toBe(port.dataType);
			}
		}
	});
});
