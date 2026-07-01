import { Type } from '@virtual-planet/schema';

import type { NodePrimitive } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';

const fragCoord: NodePrimitive = {
	id: 'host.fragCoord',
	category: 'ShaderToy',
	inputs: [],
	outputs: [{ name: 'coord', dataType: 'vec2f', metadata: { semantic: 'pixel' } }],
	params: Type.Object({}),
	wgsl: { moduleId: 'host.fragCoord', entry: 'frag_coord' },
	metadata: {
		keywords: ['Inputs', 'ShaderToy'],
		help: 'Fragment pixel coordinates (ShaderToy fragCoord / iMouse.xy).'
	},
	evalCPU(ctx) {
		const coord = ctx.procedural?.fragCoord;
		if (!coord) {
			throw new Error('host.fragCoord requires ctx.procedural.fragCoord');
		}
		return { coord };
	}
};

registerPrimitive(fragCoord);
