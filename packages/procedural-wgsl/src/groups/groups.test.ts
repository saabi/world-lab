import { describe, expect, it } from 'vitest';
import {
	annotationsOf,
	fields,
	type TSchema
} from '@virtual-planet/schema';
import {
	getPrimitive,
	type NodePrimitive,
	type PortSpec
} from '@virtual-planet/graph';
import { loadWgslPrimitive, textLinker } from '@virtual-planet/compiler';
import '@virtual-planet/graph';

import {
	MATH_REMAP_GROUP,
	MATH_REMAP_MODULE,
	SDF_OP_SUBTRACT_GROUP,
	SDF_OP_SUBTRACT_MODULE
} from './index.js';
import { MATH_ADD_MODULE } from '../modules/math/add.js';
import { MATH_SUBTRACT_MODULE } from '../modules/math/subtract.js';
import { MATH_DIVIDE_MODULE } from '../modules/math/divide.js';
import { MATH_MULTIPLY_MODULE } from '../modules/math/multiply.js';
import { MATH_MAX_MODULE } from '../modules/math/max.js';
import { MATH_NEGATE_MODULE } from '../modules/math/negate.js';

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
});
