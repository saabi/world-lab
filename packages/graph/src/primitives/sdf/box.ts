import { quantity, Type } from '@virtual-planet/schema';

import type { NodePrimitive } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';

export function evalSdfBox(px: number, py: number, hx: number, hy: number): number {
	const dx = Math.abs(px) - hx;
	const dy = Math.abs(py) - hy;
	return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0);
}

const box: NodePrimitive = {
	id: 'sdf.box',
	category: 'SDF',
	inputs: [{ name: 'p', dataType: 'vec2f' }],
	outputs: [{ name: 'distance', dataType: 'f32' }],
	params: Type.Object({
		halfX: quantity('none', { default: 0.5 }),
		halfY: quantity('none', { default: 0.5 })
	}),
	wgsl: { moduleId: 'sdf.box', entry: 'sdfBox' },
	metadata: {
		keywords: ['Geometry', 'SDF'],
		pure: true,
		deterministic: true,
		help: '2D signed distance to an axis-aligned box; halfX/halfY set half-extents.'
	},
	evalCPU(ctx) {
		const p = ctx.inputs.p as number[];
		return {
			distance: evalSdfBox(
				p[0],
				p[1],
				ctx.params.halfX as number,
				ctx.params.halfY as number
			)
		};
	}
};

registerPrimitive(box);
