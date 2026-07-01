import { Type } from '@virtual-planet/schema';

import type { NodePrimitive } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';

const SRGB_GAMMA = 2.2;

export function evalLinearToSrgb(rgb: readonly [number, number, number]): [number, number, number] {
	return rgb.map((channel) => Math.pow(channel, 1 / SRGB_GAMMA)) as [number, number, number];
}

const linearToSrgb: NodePrimitive = {
	id: 'color.linearToSrgb',
	category: 'Colour',
	inputs: [{ name: 'linear', dataType: 'vec3f' }],
	outputs: [{ name: 'srgb', dataType: 'vec3f' }],
	params: Type.Object({}),
	wgsl: { moduleId: 'color.linearToSrgb', entry: 'linearToSrgb' },
	metadata: {
		keywords: ['Effects', 'Colour'],
		pure: true,
		deterministic: true,
		help: 'Fast sRGB gamma encode (power 1/2.2) from linear RGB.'
	},
	evalCPU(ctx) {
		const linear = ctx.inputs.linear as number[];
		return { srgb: evalLinearToSrgb(linear as [number, number, number]) };
	}
};

registerPrimitive(linearToSrgb);
