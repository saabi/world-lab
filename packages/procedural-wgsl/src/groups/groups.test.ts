import { describe, expect, it } from 'vitest';
import {
	annotationsOf,
	fields,
	type TSchema
} from '@world-lab/schema';
import {
	getPrimitive,
	type NodePrimitive,
	type PortSpec
} from '@world-lab/graph';
import { loadWgslPrimitive, textLinker } from '@world-lab/compiler';
import '@world-lab/graph';

import {
	MATH_REMAP_GROUP,
	MATH_REMAP_MODULE,
	SDF_OP_SUBTRACT_GROUP,
	SDF_OP_SUBTRACT_MODULE,
	TRANSFORM_NORMAL_DISPLACE_GROUP,
	TRANSFORM_NORMAL_DISPLACE_MODULE,
	TRANSFORM_SCALE_GROUP,
	TRANSFORM_SCALE_MODULE,
	TRANSFORM_SPHERIFY_GROUP,
	TRANSFORM_SPHERIFY_MODULE,
	TRANSFORM_TRANSLATE_GROUP,
	TRANSFORM_TRANSLATE_MODULE
} from './index.js';
import { MATH_ADD_MODULE } from '../modules/math/add.js';
import { MATH_SUBTRACT_MODULE } from '../modules/math/subtract.js';
import { MATH_DIVIDE_MODULE } from '../modules/math/divide.js';
import { MATH_MULTIPLY_MODULE } from '../modules/math/multiply.js';
import { MATH_MAX_MODULE } from '../modules/math/max.js';
import { MATH_NEGATE_MODULE } from '../modules/math/negate.js';
import { MATH_NORMALIZE_MODULE } from '../modules/math/normalize.js';
import {
	VECTOR_ADD_VEC3F_MODULE,
	VECTOR_MUL_SCALAR_VEC3F_MODULE
} from '../modules/vector/index.js';
import { TRANSFORM_ROTATE_MODULE } from '../modules/transform/rotate.js';

function portNames(ports: PortSpec[]): string[] {
	return ports.map((port) => port.name);
}

function paramDefaults(schema: TSchema): Record<string, unknown> {
	return Object.fromEntries(
		fields(schema).map((field) => [field.key, annotationsOf(field.schema).default])
	);
}

function assertMechanicalParity(moduleId: string, source: string): void {
	const graphPrim = getPrimitive(moduleId)!;
	const loaded = loadWgslPrimitive({ moduleId, source }).primitive;

	expect(loaded.id).toBe(graphPrim.id);
	expect(loaded.category).toBe(graphPrim.category);
	expect(portNames(loaded.inputs)).toEqual(portNames(graphPrim.inputs));
	expect(portNames(loaded.outputs)).toEqual(portNames(graphPrim.outputs));
	expect(paramDefaults(loaded.params)).toEqual(paramDefaults(graphPrim.params));
	expect(loaded.wgsl.entry).toBe(graphPrim.wgsl.entry);
	expect(loaded.wgsl.moduleId).toBe(graphPrim.wgsl.moduleId);

	const loadedArgs = loaded.wgsl.arguments?.map((arg) => `${arg.name}:${arg.source}`) ?? [];
	const graphArgs = graphPrim.wgsl.arguments?.map((arg) => `${arg.name}:${arg.source}`) ?? [];
	if (graphArgs.length > 0) {
		expect(loadedArgs).toEqual(graphArgs);
	} else {
		expect(loadedArgs.length).toBeGreaterThan(0);
	}
}

function assertMetadataParity(graphPrim: NodePrimitive, loaded: NodePrimitive): void {
	for (const key of ['role', 'help', 'usage'] as const) {
		expect(loaded.metadata?.[key] ?? undefined).toBe(graphPrim.metadata?.[key] ?? undefined);
	}
}

describe('canonical built-in groups', () => {
	it('math.remap group generates WGSL with params after inputs and declared deps', () => {
		expect(MATH_REMAP_MODULE.id).toBe('math.remap');
		expect(MATH_REMAP_MODULE.source).toContain('fn remap(x: f32, inMin: f32, inMax: f32, outMin: f32, outMax: f32)');
		expect(MATH_REMAP_MODULE.source).toContain('subtract(');
		expect(MATH_REMAP_MODULE.source).toContain('divide(');
		expect(MATH_REMAP_MODULE.source).toContain('multiply(');
		expect(MATH_REMAP_MODULE.source).toContain('add(');
		expect(MATH_REMAP_MODULE.dependencies?.sort()).toEqual(
			['math.add', 'math.divide', 'math.multiply', 'math.subtract'].sort()
		);
	});

	it('sdf.opSubtract group generates WGSL over mathMax and negate with declared deps', () => {
		expect(SDF_OP_SUBTRACT_MODULE.id).toBe('sdf.opSubtract');
		expect(SDF_OP_SUBTRACT_MODULE.source).toContain('fn opSubtract(a: f32, b: f32)');
		expect(SDF_OP_SUBTRACT_MODULE.source).toContain('negate(');
		expect(SDF_OP_SUBTRACT_MODULE.source).toContain('mathMax(');
		expect(SDF_OP_SUBTRACT_MODULE.dependencies?.sort()).toEqual(['math.max', 'math.negate'].sort());
	});

	it('parity: math.remap graph registration matches generated loader contract', () => {
		assertMechanicalParity('math.remap', MATH_REMAP_MODULE.source);
	});

	it('parity: sdf.opSubtract graph registration matches generated loader contract', () => {
		const graphPrim = getPrimitive('sdf.opSubtract')!;
		const loaded = loadWgslPrimitive({
			moduleId: 'sdf.opSubtract',
			source: SDF_OP_SUBTRACT_MODULE.source
		}).primitive;
		assertMechanicalParity('sdf.opSubtract', SDF_OP_SUBTRACT_MODULE.source);
		assertMetadataParity(graphPrim, loaded);
	});

	it('linked math.remap WGSL includes dependency modules (not undefined callees)', () => {
		const linked = textLinker.link({
			entry: 'math.remap',
			modules: {
				[MATH_ADD_MODULE.id]: MATH_ADD_MODULE.source,
				[MATH_SUBTRACT_MODULE.id]: MATH_SUBTRACT_MODULE.source,
				[MATH_DIVIDE_MODULE.id]: MATH_DIVIDE_MODULE.source,
				[MATH_MULTIPLY_MODULE.id]: MATH_MULTIPLY_MODULE.source,
				[MATH_REMAP_MODULE.id]: MATH_REMAP_MODULE.source
			}
		});
		expect(linked).toContain('fn add(');
		expect(linked).toContain('fn subtract(');
		expect(linked).toContain('fn divide(');
		expect(linked).toContain('fn multiply(');
		expect(linked).toContain('fn remap(');
	});

	it('linked sdf.opSubtract WGSL includes max and negate dependency modules', () => {
		const linked = textLinker.link({
			entry: 'sdf.opSubtract',
			modules: {
				[MATH_MAX_MODULE.id]: MATH_MAX_MODULE.source,
				[MATH_NEGATE_MODULE.id]: MATH_NEGATE_MODULE.source,
				[SDF_OP_SUBTRACT_MODULE.id]: SDF_OP_SUBTRACT_MODULE.source
			}
		});
		expect(linked).toContain('fn mathMax(');
		expect(linked).toContain('fn negate(');
		expect(linked).toContain('fn opSubtract(');
	});

	it('exports canonical GroupDefinitions for remap and opSubtract', () => {
		expect(MATH_REMAP_GROUP.id).toBe('math.remap');
		expect(SDF_OP_SUBTRACT_GROUP.id).toBe('sdf.opSubtract');
	});

	it('transform.spherify group generates WGSL over math.normalize', () => {
		expect(TRANSFORM_SPHERIFY_MODULE.id).toBe('transform.spherify');
		expect(TRANSFORM_SPHERIFY_MODULE.source).toContain('fn spherify(position: vec3<f32>)');
		expect(TRANSFORM_SPHERIFY_MODULE.source).toContain('normalizeVec3(position)');
		expect(TRANSFORM_SPHERIFY_MODULE.dependencies).toEqual(['math.normalize']);
	});

	it('transform.normalDisplace group generates WGSL over vector mulScalar and add', () => {
		expect(TRANSFORM_NORMAL_DISPLACE_MODULE.id).toBe('transform.normalDisplace');
		expect(TRANSFORM_NORMAL_DISPLACE_MODULE.source).toContain(
			'fn normalDisplace(position: vec3<f32>, normal: vec3<f32>, height: f32)'
		);
		expect(TRANSFORM_NORMAL_DISPLACE_MODULE.source).toContain('mulScalarVec3f(');
		expect(TRANSFORM_NORMAL_DISPLACE_MODULE.source).toContain('addVec3f(position, ');
		expect(TRANSFORM_NORMAL_DISPLACE_MODULE.dependencies?.sort()).toEqual(
			['vector.add.vec3f', 'vector.mulScalar.vec3f'].sort()
		);
	});

	it('parity: transform.spherify graph registration matches generated loader contract', () => {
		assertMechanicalParity('transform.spherify', TRANSFORM_SPHERIFY_MODULE.source);
		const graphPrim = getPrimitive('transform.spherify')!;
		const loaded = loadWgslPrimitive({
			moduleId: 'transform.spherify',
			source: TRANSFORM_SPHERIFY_MODULE.source
		}).primitive;
		assertMetadataParity(graphPrim, loaded);
	});

	it('parity: transform.normalDisplace graph registration matches generated loader contract', () => {
		assertMechanicalParity('transform.normalDisplace', TRANSFORM_NORMAL_DISPLACE_MODULE.source);
		const graphPrim = getPrimitive('transform.normalDisplace')!;
		const loaded = loadWgslPrimitive({
			moduleId: 'transform.normalDisplace',
			source: TRANSFORM_NORMAL_DISPLACE_MODULE.source
		}).primitive;
		assertMetadataParity(graphPrim, loaded);
	});

	it('linked transform.spherify WGSL includes math.normalize dependency', () => {
		const linked = textLinker.link({
			entry: 'transform.spherify',
			modules: {
				[MATH_NORMALIZE_MODULE.id]: MATH_NORMALIZE_MODULE.source,
				[TRANSFORM_SPHERIFY_MODULE.id]: TRANSFORM_SPHERIFY_MODULE.source
			}
		});
		expect(linked).toContain('fn normalizeVec3(');
		expect(linked).toContain('fn spherify(');
	});

	it('linked transform.normalDisplace WGSL includes vector dependency modules', () => {
		const linked = textLinker.link({
			entry: 'transform.normalDisplace',
			modules: {
				[VECTOR_MUL_SCALAR_VEC3F_MODULE.id]: VECTOR_MUL_SCALAR_VEC3F_MODULE.source,
				[VECTOR_ADD_VEC3F_MODULE.id]: VECTOR_ADD_VEC3F_MODULE.source,
				[TRANSFORM_NORMAL_DISPLACE_MODULE.id]: TRANSFORM_NORMAL_DISPLACE_MODULE.source
			}
		});
		expect(linked).toContain('fn mulScalarVec3f(');
		expect(linked).toContain('fn addVec3f(');
		expect(linked).toContain('fn normalDisplace(');
	});

	it('exports canonical GroupDefinitions for transform groups', () => {
		expect(TRANSFORM_SPHERIFY_GROUP.id).toBe('transform.spherify');
		expect(TRANSFORM_NORMAL_DISPLACE_GROUP.id).toBe('transform.normalDisplace');
		expect(TRANSFORM_TRANSLATE_GROUP.id).toBe('transform.translate');
		expect(TRANSFORM_SCALE_GROUP.id).toBe('transform.scale');
	});

	it('transform.translate group generates WGSL over vector.add.vec3f', () => {
		expect(TRANSFORM_TRANSLATE_MODULE.id).toBe('transform.translate');
		expect(TRANSFORM_TRANSLATE_MODULE.source).toContain(
			'fn translate(position: vec3<f32>, offset: vec3<f32>)'
		);
		expect(TRANSFORM_TRANSLATE_MODULE.source).toContain('addVec3f(position, offset)');
		expect(TRANSFORM_TRANSLATE_MODULE.dependencies).toEqual(['vector.add.vec3f']);
	});

	it('transform.scale group generates WGSL over vector.mulScalar.vec3f', () => {
		expect(TRANSFORM_SCALE_MODULE.id).toBe('transform.scale');
		expect(TRANSFORM_SCALE_MODULE.source).toContain(
			'fn scale(position: vec3<f32>, factor: f32)'
		);
		expect(TRANSFORM_SCALE_MODULE.source).toContain('mulScalarVec3f(position, factor)');
		expect(TRANSFORM_SCALE_MODULE.dependencies).toEqual(['vector.mulScalar.vec3f']);
	});

	it('parity: transform.translate graph registration matches generated loader contract', () => {
		assertMechanicalParity('transform.translate', TRANSFORM_TRANSLATE_MODULE.source);
		const graphPrim = getPrimitive('transform.translate')!;
		const loaded = loadWgslPrimitive({
			moduleId: 'transform.translate',
			source: TRANSFORM_TRANSLATE_MODULE.source
		}).primitive;
		assertMetadataParity(graphPrim, loaded);
	});

	it('parity: transform.scale graph registration matches generated loader contract', () => {
		assertMechanicalParity('transform.scale', TRANSFORM_SCALE_MODULE.source);
		const graphPrim = getPrimitive('transform.scale')!;
		const loaded = loadWgslPrimitive({
			moduleId: 'transform.scale',
			source: TRANSFORM_SCALE_MODULE.source
		}).primitive;
		assertMetadataParity(graphPrim, loaded);
	});

	it('parity: transform.rotate graph registration matches rotate module contract', () => {
		assertMechanicalParity('transform.rotate', TRANSFORM_ROTATE_MODULE.source);
		const graphPrim = getPrimitive('transform.rotate')!;
		const loaded = loadWgslPrimitive({
			moduleId: 'transform.rotate',
			source: TRANSFORM_ROTATE_MODULE.source
		}).primitive;
		assertMetadataParity(graphPrim, loaded);
	});

	it('linked transform.translate WGSL includes vector.add.vec3f dependency', () => {
		const linked = textLinker.link({
			entry: 'transform.translate',
			modules: {
				[VECTOR_ADD_VEC3F_MODULE.id]: VECTOR_ADD_VEC3F_MODULE.source,
				[TRANSFORM_TRANSLATE_MODULE.id]: TRANSFORM_TRANSLATE_MODULE.source
			}
		});
		expect(linked).toContain('fn addVec3f(');
		expect(linked).toContain('fn translate(');
	});

	it('linked transform.scale WGSL includes vector.mulScalar.vec3f dependency', () => {
		const linked = textLinker.link({
			entry: 'transform.scale',
			modules: {
				[VECTOR_MUL_SCALAR_VEC3F_MODULE.id]: VECTOR_MUL_SCALAR_VEC3F_MODULE.source,
				[TRANSFORM_SCALE_MODULE.id]: TRANSFORM_SCALE_MODULE.source
			}
		});
		expect(linked).toContain('fn mulScalarVec3f(');
		expect(linked).toContain('fn scale(');
	});

	it('transform.rotate module contains euler rotation matching geometry.plane convention', () => {
		expect(TRANSFORM_ROTATE_MODULE.source).toContain('fn rotate(position: vec3<f32>, rotationX: f32');
		expect(TRANSFORM_ROTATE_MODULE.source).toContain('fn euler_rotate(');
		expect(TRANSFORM_ROTATE_MODULE.dependencies ?? []).toEqual([]);
	});
});
