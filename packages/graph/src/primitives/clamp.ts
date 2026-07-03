import { quantity, Type } from '@world-lab/schema';

import type { NodePrimitiveInput } from '../primitive.js';
import { registerPrimitive } from '../registry.js';

const clamp: NodePrimitiveInput = {
	id: 'math.clamp',
	category: 'math',
	inputs: [{ name: 'x', dataType: 'f32' }],
	outputs: [{ name: 'value', dataType: 'f32' }],
	params: Type.Object({
		min: quantity('none', { default: 0 }),
		max: quantity('none', { default: 1 })
	}),
	wgsl: { moduleId: 'math.clamp', entry: 'clamp' },
	metadata: {
		help: 'Clamp x to the [min, max] interval.',
		pure: true,
		deterministic: true
	},
	evalCPU(ctx) {
		const x = ctx.inputs.x as number;
		const min = ctx.params.min as number;
		const max = ctx.params.max as number;
		const value = Math.min(max, Math.max(min, x));
		return { value };
	}
};

registerPrimitive(clamp);
