import { Type, Value } from '@world-lab/schema';
import { describe, expect, it } from 'vitest';

import {
	dataTypeToTypeRef,
	typeRefToDataType,
	typeRefToTypeBoxSchema,
	typeRefToWgsl
} from './dataType.js';
import { resolveCoercion } from './coercion.js';
import type { DataType, TypeRef } from './types.js';
import { getPrimitive, registerPrimitive, replacePrimitive } from './registry.js';

const LEGACY_TYPES = [
	'image',
	'mesh',
	'audio',
	'geometry',
	'varyings',
	'texture',
	'vertexBuffer',
	'indexBuffer',
	'renderTarget',
	'bindGroup',
	'storageBuffer',
	'tuple<f32>',
	'tuple<vec2f>',
	'tuple<vec3f>',
	'tuple<vec4f>'
] as const satisfies readonly DataType[];

describe('TypeRef compatibility', () => {
	it('maps value aliases to structural types', () => {
		expect(dataTypeToTypeRef('f32')).toEqual({ kind: 'scalar', scalar: 'f32' });
		expect(dataTypeToTypeRef('bool')).toEqual({ kind: 'scalar', scalar: 'bool' });
		expect(dataTypeToTypeRef('vec3f')).toEqual({
			kind: 'vector',
			element: 'f32',
			width: 3
		});
	});

	it('round-trips every legacy resource, pipeline, and tuple alias', () => {
		for (const dataType of LEGACY_TYPES) {
			const type = dataTypeToTypeRef(dataType);
			expect(type).toEqual({ kind: 'legacy', alias: dataType });
			expect(typeRefToDataType(type)).toBe(dataType);
		}
	});

	it('returns undefined when no DataType alias exists', () => {
		expect(typeRefToDataType({ kind: 'struct', id: 'test', fields: [] })).toBeUndefined();
		expect(typeRefToDataType({ kind: 'scalar', scalar: 'i32' })).toBeUndefined();
	});

	it('emits integer and matrix WGSL types', () => {
		expect(typeRefToWgsl({ kind: 'scalar', scalar: 'i32' })).toBe('i32');
		expect(
			typeRefToWgsl({ kind: 'matrix', element: 'f32', columns: 3, rows: 3 })
		).toBe('mat3x3<f32>');
	});

	it('resolves structural identity independently of object key order', () => {
		expect(
			resolveCoercion(
				{ kind: 'vector', element: 'f32', width: 3 },
				{ width: 3, element: 'f32', kind: 'vector' }
			)
		).toEqual({ kind: 'identity' });
	});

	it('converts only scalar, vector, and struct value schemas', () => {
		const type: TypeRef = {
			kind: 'struct',
			id: 'sample',
			fields: [
				{ name: 'count', type: { kind: 'scalar', scalar: 'u32' } },
				{ name: 'offset', type: { kind: 'vector', element: 'f32', width: 2 } }
			]
		};
		const schema = typeRefToTypeBoxSchema(type);
		expect(schema).toBeDefined();
		expect(Value.Check(schema!, { count: 3, offset: [1, 2] })).toBe(true);
		expect(Value.Check(schema!, { count: 3.5, offset: [1, 2] })).toBe(false);
		expect(
			typeRefToTypeBoxSchema({
				kind: 'buffer',
				element: { kind: 'scalar', scalar: 'f32' },
				access: 'read',
				usages: ['storage']
			})
		).toBeUndefined();
	});

	it('normalizes register and replace through the same compatibility boundary', () => {
		const id = 'test.f1_5_normalization';
		registerPrimitive({
			id,
			category: 'test',
			inputs: [{ name: 'value', dataType: 'f32', semantics: ['uv', 'uv'] }],
			outputs: [{ name: 'result', dataType: 'f32' }],
			params: Type.Object({}),
			wgsl: { moduleId: id, entry: 'test_f1_5_normalization' }
		});
		expect(getPrimitive(id)?.inputs[0]).toMatchObject({
			type: { kind: 'scalar', scalar: 'f32' },
			dataType: 'f32',
			semantics: ['uv']
		});

		replacePrimitive({
			id,
			category: 'test',
			inputs: [{ name: 'value', dataType: 'vec2f', semantics: ['color', 'color'] }],
			outputs: [{ name: 'result', dataType: 'vec3f' }],
			params: Type.Object({}),
			wgsl: { moduleId: id, entry: 'test_f1_5_normalization' }
		});
		expect(getPrimitive(id)?.inputs[0]).toMatchObject({
			type: { kind: 'vector', element: 'f32', width: 2 },
			dataType: 'vec2f',
			semantics: ['color']
		});
	});
});
