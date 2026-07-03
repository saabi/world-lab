import { Type } from '@world-lab/schema';

import type { NodePrimitiveInput } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';

const plane: NodePrimitiveInput = {
	id: 'surface.plane',
	category: 'surface',
	inputs: [{ name: 'uv', dataType: 'vec2f' }],
	outputs: [
		{ name: 'position', dataType: 'vec3f', space: 'none' },
		{ name: 'normal', dataType: 'vec3f', space: 'none' }
	],
	params: Type.Object({}),
	wgsl: { moduleId: 'surface.plane', entry: 'plane' },
	metadata: {
		help: 'Map UV to a flat Z-facing plane position and normal in [-1,1]².',
		pure: true,
		deterministic: true
	},
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
