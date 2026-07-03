import { quantity, Type } from '@world-lab/schema';

import type { NodePrimitive } from '../../primitive.js';
import { planeGridEulerRotate } from '../pipeline/planeGrid.js';
import { registerPrimitive } from '../../registry.js';

export function evalRotate(
	position: readonly number[],
	rotationX: number,
	rotationY: number,
	rotationZ: number
): number[] {
	return planeGridEulerRotate(
		Number(position[0] ?? 0),
		Number(position[1] ?? 0),
		Number(position[2] ?? 0),
		Number(rotationX),
		Number(rotationY),
		Number(rotationZ)
	);
}

const rotate: NodePrimitive = {
	id: 'transform.rotate',
	category: 'transform',
	inputs: [{ name: 'position', dataType: 'vec3f' }],
	outputs: [{ name: 'position', dataType: 'vec3f' }],
	params: Type.Object({
		rotationX: quantity('none', { default: 0 }),
		rotationY: quantity('none', { default: 0 }),
		rotationZ: quantity('none', { default: 0 })
	}),
	wgsl: { moduleId: 'transform.rotate', entry: 'rotate' },
	metadata: {
		role: 'positionTransform',
		help: 'Rotate a position by Euler XYZ angles in radians (Rx, then Ry, then Rz).',
		usage: 'Wire a position; set rotationX/Y/Z params. Identity angles pass position through unchanged.',
		pure: true,
		deterministic: true
	},
	evalCPU(ctx) {
		const position = ctx.inputs.position as number[];
		const params = ctx.params ?? {};
		const rotationX = typeof params.rotationX === 'number' ? params.rotationX : 0;
		const rotationY = typeof params.rotationY === 'number' ? params.rotationY : 0;
		const rotationZ = typeof params.rotationZ === 'number' ? params.rotationZ : 0;
		return {
			position: evalRotate(position, rotationX, rotationY, rotationZ)
		};
	}
};

registerPrimitive(rotate);
