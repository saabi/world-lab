import type { GroupDefinition } from '@world-lab/graph';

import { vectorMulScalarVec3fNode } from './buildGroupModule.js';

/** Canonical group for `transform.scale` — uniform scale of a vec3f position. */
export const TRANSFORM_SCALE_GROUP: GroupDefinition = {
	id: 'transform.scale',
	category: 'transform',
	subgraph: {
		version: '2',
		nodes: [vectorMulScalarVec3fNode('mul', 'vector.mulScalar.vec3f')],
		edges: [],
		outputs: [{ name: 'position', from: { node: 'mul', port: 'value' } }],
	},
	interface: {
		inputs: [
			{ name: 'position', dataType: 'vec3f', target: { node: 'mul', port: 'value' } },
			{ name: 'factor', dataType: 'f32', target: { node: 'mul', port: 'scalar' } }
		],
		outputs: [{ name: 'position', dataType: 'vec3f', target: { node: 'mul', port: 'value' } }]
	},
	role: 'positionTransform',
	help: 'Uniformly scale a position by a scalar factor (`vector.mulScalar.vec3f`).',
	usage: 'Wire base position and factor; output is position × factor (all axes).'
};
