import { Type } from '@virtual-planet/schema';

import type { NodePrimitive } from '../primitive.js';
import { registerPrimitive } from '../registry.js';

const max: NodePrimitive = {
	id: 'math.max',
	category: 'math',
	inputs: [
		{ name: 'a', dataType: 'f32' },
		{ name: 'b', dataType: 'f32' }
	],
	outputs: [{ name: 'value', dataType: 'f32' }],
	params: Type.Object({}),
	wgsl: { moduleId: 'math.max', entry: 'mathMax' },
	metadata: {
		help: 'SDF intersection — use `math.max(a, b)` to intersect two distance fields.',
		usage: 'Wire two scalar SDF outputs into a and b; the farther surface wins.'
	},
	evalCPU(ctx) {
		const a = ctx.inputs.a as number;
		const b = ctx.inputs.b as number;
		return { value: Math.max(a, b) };
	}
};

registerPrimitive(max);
