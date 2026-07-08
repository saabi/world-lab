import { Type } from '@world-lab/schema';

import type { NodePrimitiveInput } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';

const instanceIndex: NodePrimitiveInput = {
	id: 'host.instanceIndex',
	category: 'ShaderToy',
	inputs: [],
	outputs: [{ name: 'index', type: { kind: 'scalar', scalar: 'u32' } }],
	params: Type.Object({}),
	implementation: {
		kind: 'host-input',
		binding: { context: 'stage-builtin', key: 'instanceIndex', stages: ['vertex'] }
	},
	metadata: {
		keywords: ['Inputs', 'Vertex'],
		help: 'The current instance index (@builtin(instance_index)) — vertex-stage only.'
	}
};

registerPrimitive(instanceIndex);
