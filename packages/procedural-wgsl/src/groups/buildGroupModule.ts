import type { GroupDefinition, Node } from '@virtual-planet/graph';
import { groupToFunction, loadWgslPrimitive, type WgslModule } from '@virtual-planet/compiler';

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
