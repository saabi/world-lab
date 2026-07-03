import { quantity, Type } from '@world-lab/schema';

import type { NodePrimitiveInput } from '../primitive.js';
import { registerPrimitive } from '../registry.js';

const smoothstep: NodePrimitiveInput = {
	id: 'math.smoothstep',
	category: 'math',
	inputs: [{ name: 'x', dataType: 'f32' }],
	outputs: [{ name: 'value', dataType: 'f32' }],
	params: Type.Object({
		edge0: quantity('none', { default: 0 }),
		edge1: quantity('none', { default: 1 })
	}),
	wgsl: { moduleId: 'math.smoothstep', entry: 'smoothstep' },
	metadata: {
		help: 'Hermite smoothstep between edge0 and edge1.',
		pure: true,
		deterministic: true
	},
	evalCPU(ctx) {
		const x = ctx.inputs.x as number;
		const edge0 = ctx.params.edge0 as number;
		const edge1 = ctx.params.edge1 as number;
		const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
		const value = t * t * (3 - 2 * t);
		return { value };
	}
};

registerPrimitive(smoothstep);
