import { Type } from '@world-lab/schema';

import type { NodePrimitiveInput } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';

const iResolution: NodePrimitiveInput = {
	id: 'host.iResolution',
	category: 'ShaderToy',
	inputs: [],
	outputs: [{ name: 'resolution', dataType: 'vec2f', metadata: { semantic: 'target-resolution' } }],
	params: Type.Object({}),
	implementation: {
		kind: 'host-input',
		binding: { context: 'write-target', key: 'iResolution' }
	},
	metadata: {
		keywords: ['Inputs', 'ShaderToy'],
		help: 'Render target resolution in pixels (ShaderToy iResolution).'
	},
	evalCPU(ctx) {
		const resolution = ctx.procedural?.iResolution;
		if (!resolution) {
			throw new Error('host.iResolution requires ctx.procedural.iResolution');
		}
		return { resolution };
	}
};

registerPrimitive(iResolution);
