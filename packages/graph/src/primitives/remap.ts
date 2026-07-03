import { quantity, Type } from '@world-lab/schema';

import type { NodePrimitiveInput } from '../primitive.js';
import { registerPrimitive } from '../registry.js';

const remap: NodePrimitiveInput = {
	id: 'math.remap',
	category: 'math',
	inputs: [{ name: 'x', dataType: 'f32' }],
	outputs: [{ name: 'value', dataType: 'f32' }],
	params: Type.Object({
		inMin: quantity('none', { default: 0 }),
		inMax: quantity('none', { default: 1 }),
		outMin: quantity('none', { default: 0 }),
		outMax: quantity('none', { default: 1 })
	}),
	implementation: { kind: 'group', groupId: 'math.remap' },
	metadata: {
		help: 'Linearly map x from [inMin, inMax] to [outMin, outMax].',
		pure: true,
		deterministic: true
	},
	evalCPU(ctx) {
		const x = ctx.inputs.x as number;
		const inMin = ctx.params.inMin as number;
		const inMax = ctx.params.inMax as number;
		const outMin = ctx.params.outMin as number;
		const outMax = ctx.params.outMax as number;
		const value = outMin + ((x - inMin) / (inMax - inMin)) * (outMax - outMin);
		return { value };
	}
};

registerPrimitive(remap);
