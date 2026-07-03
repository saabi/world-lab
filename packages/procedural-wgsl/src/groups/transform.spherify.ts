import type { GroupDefinition } from '@world-lab/graph';

import { mathVec3UnaryNode } from './buildGroupModule.js';

/** Canonical group for `transform.spherify` — normalize position onto the unit sphere. */
export const TRANSFORM_SPHERIFY_GROUP: GroupDefinition = {
	id: 'transform.spherify',
	category: 'transform',
	subgraph: {
		version: '1',
		nodes: [mathVec3UnaryNode('norm', 'math.normalize')],
		edges: [],
		outputs: [{ name: 'position', from: { node: 'norm', port: 'value' } }],
		consumers: []
	},
	interface: {
		inputs: [{ name: 'position', dataType: 'vec3f', target: { node: 'norm', port: 'v' } }],
		outputs: [{ name: 'position', dataType: 'vec3f', target: { node: 'norm', port: 'value' } }]
	},
	role: 'positionTransform',
	help: 'Normalize vertex positions onto the unit sphere (`math.normalize`).',
	usage: 'Wire a vertex position; output lies on the unit sphere.'
};
