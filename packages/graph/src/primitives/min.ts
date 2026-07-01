import { Type } from '@virtual-planet/schema';

import type { NodePrimitive } from '../primitive.js';
import { registerPrimitive } from '../registry.js';

const min: NodePrimitive = {
	id: 'math.min',
	category: 'math',
	inputs: [
		{ name: 'a', dataType: 'f32' },
		{ name: 'b', dataType: 'f32' }
	],
	outputs: [{ name: 'value', dataType: 'f32' }],
	params: Type.Object({}),
	wgsl: { moduleId: 'math.min', entry: 'mathMin' },
	metadata: {
		help: 'SDF union — use `math.min(a, b)` to combine two distance fields.',
		usage: 'Wire two scalar SDF outputs into a and b; the closer surface wins.'
	},
	evalCPU(ctx) {
		const a = ctx.inputs.a as number;
		const b = ctx.inputs.b as number;
		return { value: Math.min(a, b) };
	}
};

registerPrimitive(min);
