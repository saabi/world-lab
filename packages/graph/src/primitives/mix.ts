import { Type } from '@world-lab/schema';

import type { NodePrimitiveInput } from '../primitive.js';
import { registerPrimitive } from '../registry.js';

const mix: NodePrimitiveInput = {
	id: 'math.mix',
	category: 'math',
	inputs: [
		{ name: 'a', dataType: 'f32' },
		{ name: 'b', dataType: 'f32' },
		{ name: 't', dataType: 'f32' }
	],
	outputs: [{ name: 'value', dataType: 'f32' }],
	params: Type.Object({}),
	wgsl: { moduleId: 'math.mix', entry: 'mix' },
	metadata: {
		help: 'Linear interpolation: mix(a, b, t) = a + (b − a)·t.',
		pure: true,
		deterministic: true
	},
	evalCPU(ctx) {
		const a = ctx.inputs.a as number;
		const b = ctx.inputs.b as number;
		const t = ctx.inputs.t as number;
		return { value: a + (b - a) * t };
	}
};

registerPrimitive(mix);
