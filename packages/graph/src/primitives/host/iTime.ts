import { Type } from '@world-lab/schema';

import type { NodePrimitiveInput } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';

const iTime: NodePrimitiveInput = {
	id: 'host.iTime',
	category: 'ShaderToy',
	inputs: [],
	outputs: [{ name: 'time', dataType: 'f32', metadata: { semantic: 'time' } }],
	params: Type.Object({}),
	implementation: {
		kind: 'host-input',
		binding: { context: 'playback', key: 'iTime' }
	},
	metadata: {
		keywords: ['Inputs', 'ShaderToy'],
		help: 'Elapsed animation time in seconds (ShaderToy iTime).'
	},
	evalCPU(ctx) {
		const time = ctx.procedural?.iTime;
		if (typeof time !== 'number') {
			throw new Error('host.iTime requires ctx.procedural.iTime');
		}
		return { time };
	}
};

registerPrimitive(iTime);
