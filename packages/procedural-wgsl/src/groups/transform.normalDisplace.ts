import type { GroupDefinition } from '@world-lab/graph';

import { vectorAddVec3fNode, vectorMulScalarVec3fNode } from './buildGroupModule.js';

/**
 * Canonical group for `transform.normalDisplace` — scale normal by height, add to position.
 * Uses elemental vector ops (`vector.mulScalar.vec3f`, `vector.add.vec3f`).
 */
export const TRANSFORM_NORMAL_DISPLACE_GROUP: GroupDefinition = {
	id: 'transform.normalDisplace',
	category: 'transform',
	subgraph: {
		version: '2',
		nodes: [
			vectorMulScalarVec3fNode('scale_normal', 'vector.mulScalar.vec3f'),
			vectorAddVec3fNode('add_pos', 'vector.add.vec3f')
		],
		edges: [
			{
				id: 'e1',
				from: { node: 'scale_normal', port: 'value' },
				to: { node: 'add_pos', port: 'b' }
			}
		],
		outputs: [{ name: 'position', from: { node: 'add_pos', port: 'value' } }],
	},
	interface: {
		inputs: [
			{ name: 'position', dataType: 'vec3f', target: { node: 'add_pos', port: 'a' } },
			{ name: 'normal', dataType: 'vec3f', target: { node: 'scale_normal', port: 'value' } },
			{ name: 'height', dataType: 'f32', target: { node: 'scale_normal', port: 'scalar' } }
		],
		outputs: [{ name: 'position', dataType: 'vec3f', target: { node: 'add_pos', port: 'value' } }]
	},
	role: 'positionTransform',
	help: 'Displace a position along a normal by a scalar height (mul + add).',
	usage: 'Wire base position, surface normal, and height offset.'
};
