import { quantity, Type } from '@world-lab/schema';
import type { GroupDefinition } from '@world-lab/graph';

import { mathBinaryNode } from './buildGroupModule.js';

/** Canonical group for `math.remap` — subtract/divide/multiply/add chain. */
export const MATH_REMAP_GROUP: GroupDefinition = {
	id: 'math.remap',
	category: 'math',
	params: Type.Object({
		inMin: quantity('none', { default: 0 }),
		inMax: quantity('none', { default: 1 }),
		outMin: quantity('none', { default: 0 }),
		outMax: quantity('none', { default: 1 })
	}),
	subgraph: {
		version: '2',
		nodes: [
			mathBinaryNode('sub_x', 'math.subtract'),
			mathBinaryNode('sub_in', 'math.subtract'),
			mathBinaryNode('div_t', 'math.divide'),
			mathBinaryNode('sub_out', 'math.subtract'),
			mathBinaryNode('mul_t', 'math.multiply'),
			mathBinaryNode('add_final', 'math.add')
		],
		edges: [
			{ id: 'e1', from: { node: 'sub_x', port: 'value' }, to: { node: 'div_t', port: 'a' } },
			{ id: 'e2', from: { node: 'sub_in', port: 'value' }, to: { node: 'div_t', port: 'b' } },
			{ id: 'e3', from: { node: 'div_t', port: 'value' }, to: { node: 'mul_t', port: 'a' } },
			{ id: 'e4', from: { node: 'sub_out', port: 'value' }, to: { node: 'mul_t', port: 'b' } },
			{ id: 'e5', from: { node: 'mul_t', port: 'value' }, to: { node: 'add_final', port: 'b' } }
		],
		outputs: [{ name: 'value', from: { node: 'add_final', port: 'value' } }],
	},
	interface: {
		inputs: [{ name: 'x', dataType: 'f32', target: { node: 'sub_x', port: 'a' } }],
		params: [
			{ name: 'inMin', target: { node: 'sub_x', port: 'b' } },
			{ name: 'inMax', target: { node: 'sub_in', port: 'a' } },
			{ name: 'inMin', target: { node: 'sub_in', port: 'b' } },
			{ name: 'outMax', target: { node: 'sub_out', port: 'a' } },
			{ name: 'outMin', target: { node: 'sub_out', port: 'b' } },
			{ name: 'outMin', target: { node: 'add_final', port: 'a' } }
		],
		outputs: [{ name: 'value', dataType: 'f32', target: { node: 'add_final', port: 'value' } }]
	}
};
