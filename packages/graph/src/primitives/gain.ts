import { quantity, Type } from '@world-lab/schema';

import type { NodePrimitiveInput } from '../primitive.js';
import { registerPrimitive } from '../registry.js';
import { evalBias } from './bias.js';

/** Perlin gain curve — contrast around 0.5; gain 0.5 is identity. */
export function evalGain(x: number, gain: number): number {
	if (x < 0.5) {
		return 0.5 * evalBias(2 * x, gain);
	}
	return 0.5 + 0.5 * evalBias(2 * x - 1, 1 - gain);
}

const gain: NodePrimitiveInput = {
	id: 'math.gain',
	category: 'math',
	inputs: [{ name: 'x', dataType: 'f32' }],
	outputs: [{ name: 'value', dataType: 'f32' }],
	params: Type.Object({
		gain: quantity('none', { default: 0.5, min: 0.001, max: 0.999 })
	}),
	wgsl: { moduleId: 'math.gain', entry: 'gain' },
	metadata: {
		help: 'Perlin gain curve — increases or decreases contrast around 0.5.',
		pure: true,
		deterministic: true
	},
	evalCPU(ctx) {
		const x = ctx.inputs.x as number;
		const amount = ctx.params.gain as number;
		return { value: evalGain(x, amount) };
	}
};

registerPrimitive(gain);
