import { Type } from '@virtual-planet/schema';

import type { NodePrimitive } from '../primitive.js';
import { registerPrimitive } from '../registry.js';

const abs: NodePrimitive = {
	id: 'math.abs',
	category: 'math',
	inputs: [{ name: 'x', dataType: 'f32' }],
	outputs: [{ name: 'value', dataType: 'f32' }],
	params: Type.Object({}),
	wgsl: { moduleId: 'math.abs', entry: 'abs' },
	evalCPU(ctx) {
		const x = ctx.inputs.x as number;
		return { value: Math.abs(x) };
	}
};

registerPrimitive(abs);
