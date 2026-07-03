import { Type } from '@world-lab/schema';

import type { NodePrimitiveInput } from '../primitive.js';
import { registerPrimitive } from '../registry.js';

const multiply: NodePrimitiveInput = {
	id: 'math.multiply',
	category: 'math',
	inputs: [
		{ name: 'a', dataType: 'f32' },
		{ name: 'b', dataType: 'f32' }
	],
	outputs: [{ name: 'value', dataType: 'f32' }],
	params: Type.Object({}),
	wgsl: { moduleId: 'math.multiply', entry: 'multiply' },
	metadata: {
		help: 'Product of two scalars: a × b.',
		pure: true,
		deterministic: true
	},
	evalCPU(ctx) {
		const a = ctx.inputs.a as number;
		const b = ctx.inputs.b as number;
		return { value: a * b };
	}
};

registerPrimitive(multiply);
