import { Type } from '@world-lab/schema';

import type { NodePrimitiveInput } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';

export function evalNormalDisplace(
	position: readonly number[],
	normal: readonly number[],
	height: number
): number[] {
	const h = Number(height);
	return [
		Number(position[0] ?? 0) + Number(normal[0] ?? 0) * h,
		Number(position[1] ?? 0) + Number(normal[1] ?? 0) * h,
		Number(position[2] ?? 0) + Number(normal[2] ?? 0) * h
	];
}

const normalDisplace: NodePrimitiveInput = {
	id: 'transform.normalDisplace',
	category: 'transform',
	inputs: [
		{ name: 'position', dataType: 'vec3f' },
		{ name: 'normal', dataType: 'vec3f' },
		{ name: 'height', dataType: 'f32' }
	],
	outputs: [{ name: 'position', dataType: 'vec3f' }],
	params: Type.Object({}),
	implementation: { kind: 'group', groupId: 'transform.normalDisplace' },
	metadata: {
		role: 'positionTransform',
		help: 'Displace a position along a normal by a scalar height (mul + add).',
		usage: 'Wire base position, surface normal, and height offset.',
		pure: true,
		deterministic: true
	},
	evalCPU(ctx) {
		return {
			position: evalNormalDisplace(
				ctx.inputs.position as number[],
				ctx.inputs.normal as number[],
				ctx.inputs.height as number
			)
		};
	}
};

registerPrimitive(normalDisplace);
