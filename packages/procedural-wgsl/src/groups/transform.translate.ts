import type { GroupDefinition } from '@world-lab/graph';

import { vectorAddVec3fNode } from './buildGroupModule.js';

/** Canonical group for `transform.translate` — add an offset vec3f to position. */
export const TRANSFORM_TRANSLATE_GROUP: GroupDefinition = {
	id: 'transform.translate',
	category: 'transform',
	subgraph: {
		version: '2',
		nodes: [vectorAddVec3fNode('add', 'vector.add.vec3f')],
		edges: [],
		outputs: [{ name: 'position', from: { node: 'add', port: 'value' } }],
	},
	interface: {
		inputs: [
			{ name: 'position', dataType: 'vec3f', target: { node: 'add', port: 'a' } },
			{ name: 'offset', dataType: 'vec3f', target: { node: 'add', port: 'b' } }
		],
		outputs: [{ name: 'position', dataType: 'vec3f', target: { node: 'add', port: 'value' } }]
	},
	role: 'positionTransform',
	help: 'Translate a position by a vec3f offset (`vector.add.vec3f`).',
	usage: 'Wire base position and offset; output is position + offset.'
};
