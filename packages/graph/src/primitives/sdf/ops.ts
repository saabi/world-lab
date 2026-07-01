import { Type } from '@virtual-planet/schema';

import type { NodePrimitive } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';

export function evalOpUnion(a: number, b: number): number {
	return Math.min(a, b);
}

export function evalOpSubtract(a: number, b: number): number {
	return Math.max(a, -b);
}

export function evalOpIntersect(a: number, b: number): number {
	return Math.max(a, b);
}

const opSubtract: NodePrimitive = {
	id: 'sdf.opSubtract',
	category: 'SDF',
	inputs: [
		{ name: 'a', dataType: 'f32' },
		{ name: 'b', dataType: 'f32' }
	],
	outputs: [{ name: 'distance', dataType: 'f32' }],
	params: Type.Object({}),
	wgsl: { moduleId: 'sdf.opSubtract', entry: 'opSubtract' },
	metadata: {
		keywords: ['Geometry', 'SDF'],
		pure: true,
		deterministic: true,
		help: 'CSG subtraction (decomposed to `math.max` and negation).',
		usage: 'Subtracts shape B from shape A.'
	},
	evalCPU(ctx) {
		return {
			distance: evalOpSubtract(ctx.inputs.a as number, ctx.inputs.b as number)
		};
	}
};

registerPrimitive(opSubtract);
