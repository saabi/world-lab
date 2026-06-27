import { Type } from '@virtual-planet/schema';

import type { NodePrimitive } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';

const plane: NodePrimitive = {
	id: 'surface.plane',
	category: 'surface',
	inputs: [{ name: 'uv', dataType: 'vec2f' }],
	outputs: [
		{ name: 'position', dataType: 'vec3f', space: 'none' },
		{ name: 'normal', dataType: 'vec3f', space: 'none' }
	],
	params: Type.Object({}),
	wgsl: { moduleId: 'surface.plane', entry: 'plane' },
	evalCPU(ctx) {
		const uv = ctx.inputs.uv as number[];
		const u = uv[0];
		const v = uv[1];
		return {
			position: [2 * u - 1, 2 * v - 1, 0],
			normal: [0, 0, 1]
		};
	}
};

registerPrimitive(plane);
