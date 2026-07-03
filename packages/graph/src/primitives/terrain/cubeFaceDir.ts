import { Type } from '@world-lab/schema';

import type { NodePrimitiveInput } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';
import { PLANET_SPACES } from './spaces.js';

function cubeFaceUvToUnitDir(face: number, u: number, v: number): [number, number, number] {
	const a = u * 2 - 1;
	const b = v * 2 - 1;
	let pos: [number, number, number];
	switch (face) {
		case 0:
			pos = [1, b, -a];
			break;
		case 1:
			pos = [-1, b, a];
			break;
		case 2:
			pos = [a, 1, -b];
			break;
		case 3:
			pos = [a, -1, b];
			break;
		case 4:
			pos = [a, b, 1];
			break;
		default:
			pos = [-a, b, -1];
			break;
	}
	const len = Math.hypot(pos[0], pos[1], pos[2]);
	return [pos[0] / len, pos[1] / len, pos[2] / len];
}

const cubeFaceDir: NodePrimitiveInput = {
	id: 'surface.cubeFaceDir',
	category: 'surface',
	inputs: [{ name: 'uv', dataType: 'vec2f' }],
	outputs: [{ name: 'unit_dir', dataType: 'vec3f', space: PLANET_SPACES.BODY_DIRECTION }],
	params: Type.Object({
		face: Type.Integer({ minimum: 0, maximum: 5, default: 0 })
	}),
	wgsl: { moduleId: 'surface.cubeFaceDir', entry: 'cubeFaceDir' },
	metadata: {
		keywords: ['Domain', 'Surface'],
		help: 'Unit direction on the sphere for a cube-face index and UV.'
	},
	evalCPU(ctx) {
		const uv = ctx.inputs.uv as number[];
		const face = ctx.params.face as number;
		return { unit_dir: cubeFaceUvToUnitDir(face, uv[0], uv[1]) };
	}
};

registerPrimitive(cubeFaceDir);
