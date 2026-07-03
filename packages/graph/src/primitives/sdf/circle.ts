import { quantity, Type } from '@world-lab/schema';

import type { NodePrimitiveInput } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';

export function evalSdfCircle(px: number, py: number, radius: number): number {
	return Math.hypot(px, py) - radius;
}

const circle: NodePrimitiveInput = {
	id: 'sdf.circle',
	category: 'SDF',
	inputs: [{ name: 'p', dataType: 'vec2f' }],
	outputs: [{ name: 'distance', dataType: 'f32' }],
	params: Type.Object({
		radius: quantity('none', { default: 1 })
	}),
	wgsl: { moduleId: 'sdf.circle', entry: 'sdfCircle' },
	metadata: {
		keywords: ['Geometry', 'SDF'],
		pure: true,
		deterministic: true,
		help: '2D signed distance to a circle; radius param sets radius.'
	},
	evalCPU(ctx) {
		const p = ctx.inputs.p as number[];
		const radius = ctx.params.radius as number;
		return { distance: evalSdfCircle(p[0], p[1], radius) };
	}
};

registerPrimitive(circle);
