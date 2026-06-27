import type { NodePrimitive } from '../primitive.js';
import { registerPrimitive } from '../registry.js';

const remap: NodePrimitive = {
	id: 'math.remap',
	category: 'math',
	inputs: [{ name: 'x', dataType: 'f32' }],
	outputs: [{ name: 'value', dataType: 'f32' }],
	params: [
		{ name: 'inMin', type: 'f32', default: 0 },
		{ name: 'inMax', type: 'f32', default: 1 },
		{ name: 'outMin', type: 'f32', default: 0 },
		{ name: 'outMax', type: 'f32', default: 1 }
	],
	wgsl: { moduleId: 'math.remap', entry: 'remap' },
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
