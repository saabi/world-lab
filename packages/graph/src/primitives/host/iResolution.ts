import { Type } from '@virtual-planet/schema';

import type { NodePrimitive } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';

const iResolution: NodePrimitive = {
	id: 'host.iResolution',
	category: 'ShaderToy',
	inputs: [],
	outputs: [{ name: 'resolution', dataType: 'vec2f', metadata: { semantic: 'target-resolution' } }],
	params: Type.Object({}),
	wgsl: { moduleId: 'host.iResolution', entry: 'i_resolution' },
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
