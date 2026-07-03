import { quantity, Type } from '@world-lab/schema';

import type { NodePrimitiveInput } from '../primitive.js';
import { registerPrimitive } from '../registry.js';

/** Perlin bias curve — pushes values toward 0 or 1 depending on bias amount. */
export function evalBias(x: number, bias: number): number {
	return x / ((1 / bias - 2) * (1 - x) + 1);
}

const bias: NodePrimitiveInput = {
	id: 'math.bias',
	category: 'math',
	inputs: [{ name: 'x', dataType: 'f32' }],
	outputs: [{ name: 'value', dataType: 'f32' }],
	params: Type.Object({
		bias: quantity('none', { default: 0.5, min: 0.001, max: 0.999 })
	}),
	wgsl: { moduleId: 'math.bias', entry: 'bias' },
	metadata: {
		help: 'Perlin bias curve — shifts values toward 0 or 1.',
		pure: true,
		deterministic: true
	},
	evalCPU(ctx) {
		const x = ctx.inputs.x as number;
		const amount = ctx.params.bias as number;
		return { value: evalBias(x, amount) };
	}
};

registerPrimitive(bias);
