import { Type } from '@world-lab/schema';

import type { NodePrimitiveInput } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';
import { PLANET_SPACES } from '../terrain/spaces.js';
import { cubeFaceUvToPosition } from './cubeFaceMath.js';

const cubeFace: NodePrimitiveInput = {
	id: 'surface.cubeFace',
	category: 'surface',
	inputs: [{ name: 'uv', dataType: 'vec2f' }],
	outputs: [{ name: 'position', dataType: 'vec3f', space: PLANET_SPACES.BODY_POSITION }],
	params: Type.Object({
		face: Type.Integer({ minimum: 0, maximum: 5, default: 0 })
	}),
	wgsl: { moduleId: 'surface.cubeFace', entry: 'cubeFace' },
	metadata: {
		help: 'Map UV on a cube face (0–5) to a raw, un-normalized cube position.',
		pure: true,
		deterministic: true
	},
	evalCPU(ctx) {
		const uv = ctx.inputs.uv as number[];
		const face = ctx.params.face as number;
		return {
			position: cubeFaceUvToPosition(face, uv[0], uv[1])
		};
	}
};

registerPrimitive(cubeFace);
