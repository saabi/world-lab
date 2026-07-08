import { Type } from '@world-lab/schema';

import type { NodePrimitiveInput } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';

const vertexIndex: NodePrimitiveInput = {
	id: 'host.vertexIndex',
	category: 'ShaderToy',
	inputs: [],
	outputs: [{ name: 'index', type: { kind: 'scalar', scalar: 'u32' } }],
	params: Type.Object({}),
	implementation: {
		kind: 'host-input',
		binding: { context: 'stage-builtin', key: 'vertexIndex', stages: ['vertex'] }
	},
	metadata: {
		keywords: ['Inputs', 'Vertex'],
		help: 'The current vertex index (@builtin(vertex_index)) — vertex-stage only.'
	}
};

registerPrimitive(vertexIndex);
