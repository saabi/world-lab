import type { NodePrimitive } from '../primitive.js';
import { registerPrimitive } from '../registry.js';

const clamp: NodePrimitive = {
	id: 'math.clamp',
	category: 'math',
	inputs: [{ name: 'x', dataType: 'f32' }],
	outputs: [{ name: 'value', dataType: 'f32' }],
	params: [
		{ name: 'min', type: 'f32', default: 0 },
		{ name: 'max', type: 'f32', default: 1 }
	],
	wgsl: { moduleId: 'math.clamp', entry: 'clamp' },
	evalCPU(ctx) {
		const x = ctx.inputs.x as number;
		const min = ctx.params.min as number;
		const max = ctx.params.max as number;
		const value = Math.min(max, Math.max(min, x));
		return { value };
	}
};

registerPrimitive(clamp);
