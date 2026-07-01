import { Type } from '@virtual-planet/schema';

import type { NodePrimitive } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';

const iTime: NodePrimitive = {
	id: 'host.iTime',
	category: 'ShaderToy',
	inputs: [],
	outputs: [{ name: 'time', dataType: 'f32', metadata: { semantic: 'time' } }],
	params: Type.Object({}),
	wgsl: { moduleId: 'host.iTime', entry: 'i_time' },
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
