import { Type } from '@virtual-planet/schema';

import type { NodePrimitive } from '../primitive.js';
import { registerPrimitive } from '../registry.js';

const uv: NodePrimitive = {
	id: 'procedural.uv',
	category: 'Input',
	inputs: [],
	outputs: [{ name: 'uv', dataType: 'vec2f', space: 'none' }],
	params: Type.Object({}),
	wgsl: { moduleId: 'procedural.uv', entry: 'uv' },
	metadata: {
		help: 'Surface UV coordinates supplied by the procedural evaluation context.'
	},
	evalCPU(ctx) {
		const uvValue = ctx.procedural?.uv;
		if (uvValue === undefined) {
			throw new Error('procedural.uv requires ctx.procedural.uv');
		}
		return { uv: uvValue };
	}
};

registerPrimitive(uv);
