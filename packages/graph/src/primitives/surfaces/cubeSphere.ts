import { Type } from '@world-lab/schema';

import type { NodePrimitive } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';
import { cubeFaceUvToPosition } from './cubeFaceMath.js';

function normalize3(v: [number, number, number]): [number, number, number] {
	const len = Math.hypot(v[0], v[1], v[2]);
	if (len === 0) {
		return [0, 0, 1];
	}
	return [v[0] / len, v[1] / len, v[2] / len];
}

const cubeSphere: NodePrimitive = {
	id: 'surface.cubeSphere',
	category: 'surface',
	inputs: [{ name: 'uv', dataType: 'vec2f' }],
	outputs: [
		{ name: 'position', dataType: 'vec3f', space: 'body_pos' },
		{ name: 'normal', dataType: 'vec3f', space: 'body_dir' }
	],
	params: Type.Object({
		face: Type.Integer({ minimum: 0, maximum: 5, default: 0 })
	}),
	wgsl: { moduleId: 'surface.cubeSphere', entry: 'cubeSphere' },
	metadata: {
		help: 'Map UV on a cube face (0–5) to a normalized sphere position and normal.',
		pure: true,
		deterministic: true
	},
	evalCPU(ctx) {
		const uv = ctx.inputs.uv as number[];
		const face = ctx.params.face as number;
		const position = normalize3(cubeFaceUvToPosition(face, uv[0], uv[1]));
		return { position, normal: position };
	}
};

registerPrimitive(cubeSphere);
