import { Type } from '@world-lab/schema';

import type { NodePrimitiveInput } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';

const channel: NodePrimitiveInput = {
	id: 'input.channel',
	category: 'ShaderToy',
	inputs: [],
	outputs: [{ name: 'color', dataType: 'vec4f' }],
	params: Type.Object({
		channel: Type.Integer({ default: 0, minimum: 0, maximum: 3 }),
		sourceDisplayId: Type.String({ default: '' })
	}),
	implementation: {
		kind: 'host-input',
		binding: { context: 'read-resource', key: 'channel' }
	},
	metadata: {
		keywords: ['Inputs', 'ShaderToy'],
		help: 'Samples another display target from the current frame.'
	},
	evalCPU() {
		throw new Error('input.channel is GPU-pipeline only; no CPU evaluation path');
	}
};

registerPrimitive(channel);
