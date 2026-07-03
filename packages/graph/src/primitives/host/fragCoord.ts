import { Type } from '@world-lab/schema';

import type { NodePrimitiveInput } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';

const fragCoord: NodePrimitiveInput = {
	id: 'host.fragCoord',
	category: 'ShaderToy',
	inputs: [],
	outputs: [{ name: 'coord', dataType: 'vec2f', metadata: { semantic: 'pixel' } }],
	params: Type.Object({}),
	implementation: {
		kind: 'host-input',
		binding: { context: 'stage-builtin', key: 'fragCoord', stages: ['fragment'] }
	},
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
