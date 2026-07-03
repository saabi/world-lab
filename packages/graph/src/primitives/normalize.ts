import { Type } from '@world-lab/schema';

import type { NodePrimitiveInput } from '../primitive.js';
import { registerPrimitive } from '../registry.js';

export function evalNormalizeVec3(v: readonly number[]): number[] {
	const x = Number(v[0] ?? 0);
	const y = Number(v[1] ?? 0);
	const z = Number(v[2] ?? 0);
	const len = Math.sqrt(x * x + y * y + z * z);
	if (len === 0) {
		return [0, 0, 0];
	}
	return [x / len, y / len, z / len];
}

const normalize: NodePrimitiveInput = {
	id: 'math.normalize',
	category: 'math',
	inputs: [{ name: 'v', dataType: 'vec3f' }],
	outputs: [{ name: 'value', dataType: 'vec3f' }],
	params: Type.Object({}),
	wgsl: { moduleId: 'math.normalize', entry: 'normalizeVec3' },
	metadata: {
		help: 'Normalize a vec3 to unit length (zero vector → zero).',
		pure: true,
		deterministic: true
	},
	evalCPU(ctx) {
		const v = ctx.inputs.v as number[];
		return { value: evalNormalizeVec3(v) };
	}
};

registerPrimitive(normalize);
