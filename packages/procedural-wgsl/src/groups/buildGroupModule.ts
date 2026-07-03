import type { GroupDefinition, Node } from '@world-lab/graph';
import { groupToFunction, loadWgslPrimitive, type WgslModule } from '@world-lab/compiler';

/** Build a standard-library module from a canonical group definition. */
export function buildGroupModule(def: GroupDefinition): WgslModule {
	const { wgsl, frontmatter } = groupToFunction(def);
	const source = `${frontmatter}\n${wgsl}`;
	const loaded = loadWgslPrimitive({ moduleId: def.id, source });
	return {
		id: def.id,
		source,
		dependencies: loaded.imports
	};
}

/** Binary f32 math node template for group subgraphs. */
export function mathBinaryNode(id: string, primitive: string): Node {
	return {
		id,
		primitive,
		inputs: [
			{ id: 'a', name: 'a', direction: 'in', dataType: 'f32' },
			{ id: 'b', name: 'b', direction: 'in', dataType: 'f32' }
		],
		outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }]
	};
}

/** Unary f32 math node template for group subgraphs. */
export function mathUnaryNode(id: string, primitive: string): Node {
	return {
		id,
		primitive,
		inputs: [{ id: 'a', name: 'a', direction: 'in', dataType: 'f32' }],
		outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }]
	};
}

/** Unary vec3f math node template for group subgraphs. */
export function mathVec3UnaryNode(id: string, primitive: string): Node {
	return {
		id,
		primitive,
		inputs: [{ id: 'v', name: 'v', direction: 'in', dataType: 'vec3f' }],
		outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'vec3f' }]
	};
}

/** vec3f × f32 scalar multiply node template for group subgraphs. */
export function vectorMulScalarVec3fNode(id: string, primitive: string): Node {
	return {
		id,
		primitive,
		inputs: [
			{ id: 'value', name: 'value', direction: 'in', dataType: 'vec3f' },
			{ id: 'scalar', name: 'scalar', direction: 'in', dataType: 'f32' }
		],
		outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'vec3f' }]
	};
}

/** vec3f addition node template for group subgraphs. */
export function vectorAddVec3fNode(id: string, primitive: string): Node {
	return {
		id,
		primitive,
		inputs: [
			{ id: 'a', name: 'a', direction: 'in', dataType: 'vec3f' },
			{ id: 'b', name: 'b', direction: 'in', dataType: 'vec3f' }
		],
		outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'vec3f' }]
	};
}
