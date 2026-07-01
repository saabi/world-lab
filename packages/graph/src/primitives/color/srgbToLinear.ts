import { Type } from '@virtual-planet/schema';

import type { NodePrimitive } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';

const SRGB_GAMMA = 2.2;

export function evalSrgbToLinear(rgb: readonly [number, number, number]): [number, number, number] {
	return rgb.map((channel) => Math.pow(channel, SRGB_GAMMA)) as [number, number, number];
}

const srgbToLinear: NodePrimitive = {
	id: 'color.srgbToLinear',
	category: 'Colour',
	inputs: [{ name: 'srgb', dataType: 'vec3f' }],
	outputs: [{ name: 'linear', dataType: 'vec3f' }],
	params: Type.Object({}),
	wgsl: { moduleId: 'color.srgbToLinear', entry: 'srgbToLinear' },
	metadata: {
		keywords: ['Effects', 'Colour'],
		pure: true,
		deterministic: true,
		help: 'Fast sRGB gamma decode (power 2.2) to linear RGB.'
	},
	evalCPU(ctx) {
		const srgb = ctx.inputs.srgb as number[];
		return { linear: evalSrgbToLinear(srgb as [number, number, number]) };
	}
};

registerPrimitive(srgbToLinear);
