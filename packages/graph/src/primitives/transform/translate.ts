import { Type } from '@world-lab/schema';

import type { NodePrimitiveInput } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';

export function evalTranslate(position: readonly number[], offset: readonly number[]): number[] {
	return [
		Number(position[0] ?? 0) + Number(offset[0] ?? 0),
		Number(position[1] ?? 0) + Number(offset[1] ?? 0),
		Number(position[2] ?? 0) + Number(offset[2] ?? 0)
	];
}

const translate: NodePrimitiveInput = {
	id: 'transform.translate',
	category: 'transform',
	inputs: [
		{ name: 'position', dataType: 'vec3f' },
		{ name: 'offset', dataType: 'vec3f' }
	],
	outputs: [{ name: 'position', dataType: 'vec3f' }],
	params: Type.Object({}),
	implementation: { kind: 'group', groupId: 'transform.translate' },
	metadata: {
		role: 'positionTransform',
		help: 'Translate a position by a vec3f offset (`vector.add.vec3f`).',
		usage: 'Wire base position and offset; output is position + offset.',
		pure: true,
		deterministic: true
	},
	evalCPU(ctx) {
		return {
			position: evalTranslate(ctx.inputs.position as number[], ctx.inputs.offset as number[])
		};
	}
};

registerPrimitive(translate);
