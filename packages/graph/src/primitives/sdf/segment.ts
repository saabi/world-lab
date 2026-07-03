import { Type } from '@world-lab/schema';

import type { NodePrimitiveInput } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';

export function evalSdfSegment(
	px: number,
	py: number,
	ax: number,
	ay: number,
	bx: number,
	by: number
): number {
	const pax = px - ax;
	const pay = py - ay;
	const bax = bx - ax;
	const bay = by - ay;
	const denom = bax * bax + bay * bay;
	const h = denom === 0 ? 0 : Math.min(1, Math.max(0, (pax * bax + pay * bay) / denom));
	const dx = pax - bax * h;
	const dy = pay - bay * h;
	return Math.hypot(dx, dy);
}

const segment: NodePrimitiveInput = {
	id: 'sdf.segment',
	category: 'SDF',
	inputs: [
		{ name: 'p', dataType: 'vec2f' },
		{ name: 'a', dataType: 'vec2f' },
		{ name: 'b', dataType: 'vec2f' }
	],
	outputs: [{ name: 'distance', dataType: 'f32' }],
	params: Type.Object({}),
	wgsl: { moduleId: 'sdf.segment', entry: 'sdfSegment' },
	metadata: {
		keywords: ['Geometry', 'SDF'],
		pure: true,
		deterministic: true,
		help: '2D signed distance from point p to line segment a→b.'
	},
	evalCPU(ctx) {
		const p = ctx.inputs.p as number[];
		const a = ctx.inputs.a as number[];
		const b = ctx.inputs.b as number[];
		return {
			distance: evalSdfSegment(p[0], p[1], a[0], a[1], b[0], b[1])
		};
	}
};

registerPrimitive(segment);
