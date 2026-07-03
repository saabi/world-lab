import { Type } from '@world-lab/schema';

import type { NodePrimitive } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';
import { evalNormalizeVec3 } from '../normalize.js';

const spherify: NodePrimitive = {
	id: 'transform.spherify',
	category: 'transform',
	inputs: [{ name: 'position', dataType: 'vec3f' }],
	outputs: [{ name: 'position', dataType: 'vec3f' }],
	params: Type.Object({}),
	wgsl: { moduleId: 'transform.spherify', entry: 'spherify' },
	metadata: {
		role: 'positionTransform',
		help: 'Normalize vertex positions onto the unit sphere (`math.normalize`).',
		usage: 'Wire a vertex position; output lies on the unit sphere.',
		pure: true,
		deterministic: true
	},
	evalCPU(ctx) {
		const position = ctx.inputs.position as number[];
		return { position: evalNormalizeVec3(position) };
	}
};

registerPrimitive(spherify);
