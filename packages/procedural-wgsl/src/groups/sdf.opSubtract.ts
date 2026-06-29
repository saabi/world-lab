import type { GroupDefinition } from '@virtual-planet/graph';

import { mathBinaryNode, mathUnaryNode } from './buildGroupModule.js';

/** Canonical group for `sdf.opSubtract` — max + negate. */
export const SDF_OP_SUBTRACT_GROUP: GroupDefinition = {
	id: 'sdf.opSubtract',
	category: 'SDF',
	subgraph: {
		version: '1',
		nodes: [mathUnaryNode('neg_b', 'math.negate'), mathBinaryNode('max_ab', 'math.max')],
		edges: [
			{ id: 'e1', from: { node: 'neg_b', port: 'value' }, to: { node: 'max_ab', port: 'b' } }
		],
		outputs: [{ name: 'distance', from: { node: 'max_ab', port: 'value' } }],
		consumers: []
	},
	interface: {
		inputs: [
			{ name: 'a', dataType: 'f32', target: { node: 'max_ab', port: 'a' } },
			{ name: 'b', dataType: 'f32', target: { node: 'neg_b', port: 'a' } }
		],
		outputs: [{ name: 'distance', dataType: 'f32', target: { node: 'max_ab', port: 'value' } }]
	},
	help: 'CSG subtraction (decomposed to `math.max` and negation).',
	usage: 'Subtracts shape B from shape A.'
};
