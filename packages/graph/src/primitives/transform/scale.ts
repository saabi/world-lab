import { Type } from '@world-lab/schema';

import type { NodePrimitiveInput } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';

export function evalScale(position: readonly number[], factor: number): number[] {
	const f = Number(factor);
	return [
		Number(position[0] ?? 0) * f,
		Number(position[1] ?? 0) * f,
		Number(position[2] ?? 0) * f
	];
}

const scale: NodePrimitiveInput = {
	id: 'transform.scale',
	category: 'transform',
	inputs: [
		{ name: 'position', dataType: 'vec3f' },
		{ name: 'factor', dataType: 'f32' }
	],
	outputs: [{ name: 'position', dataType: 'vec3f' }],
	params: Type.Object({}),
	implementation: { kind: 'group', groupId: 'transform.scale' },
	metadata: {
		role: 'positionTransform',
		help: 'Uniformly scale a position by a scalar factor (`vector.mulScalar.vec3f`).',
		usage: 'Wire base position and factor; output is position × factor (all axes).',
		pure: true,
		deterministic: true
	},
	evalCPU(ctx) {
		return {
			position: evalScale(ctx.inputs.position as number[], ctx.inputs.factor as number)
		};
	}
};

registerPrimitive(scale);
