import { Type } from '@virtual-planet/schema';

import type { NodePrimitive } from '../primitive.js';
import { registerPrimitive } from '../registry.js';

const negate: NodePrimitive = {
	id: 'math.negate',
	category: 'math',
	inputs: [{ name: 'a', dataType: 'f32' }],
	outputs: [{ name: 'value', dataType: 'f32' }],
	params: Type.Object({}),
	wgsl: { moduleId: 'math.negate', entry: 'negate' },
	metadata: {
		help: 'Unary negation: −a.',
		pure: true,
		deterministic: true
	},
	evalCPU(ctx) {
		return { value: -(ctx.inputs.a as number) };
	}
};

registerPrimitive(negate);
