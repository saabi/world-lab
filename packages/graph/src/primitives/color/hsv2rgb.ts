import { quantity, Type } from '@virtual-planet/schema';

import type { NodePrimitive } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';

export function evalHsv2rgb(h: number, s: number, v: number): [number, number, number] {
	const c = v * s;
	const hp = ((h % 1) + 1) % 1 * 6;
	const x = c * (1 - Math.abs((hp % 2) - 1));
	const m = v - c;
	let r = 0;
	let g = 0;
	let b = 0;
	if (hp < 1) {
		r = c;
		g = x;
	} else if (hp < 2) {
		r = x;
		g = c;
	} else if (hp < 3) {
		g = c;
		b = x;
	} else if (hp < 4) {
		g = x;
		b = c;
	} else if (hp < 5) {
		r = x;
		b = c;
	} else {
		r = c;
		b = x;
	}
	return [r + m, g + m, b + m];
}

const hsv2rgb: NodePrimitive = {
	id: 'color.hsv2rgb',
	category: 'Colour',
	inputs: [],
	outputs: [{ name: 'rgb', dataType: 'vec3f' }],
	params: Type.Object({
		h: quantity('none', { default: 0, min: 0, max: 1 }),
		s: quantity('none', { default: 1, min: 0, max: 1 }),
		v: quantity('none', { default: 1, min: 0, max: 1 })
	}),
	wgsl: { moduleId: 'color.hsv2rgb', entry: 'hsv2rgb' },
	metadata: {
		keywords: ['Effects', 'Colour'],
		pure: true,
		deterministic: true,
		help: 'Convert HSV (h,s,v each 0–1) to RGB.'
	},
	evalCPU(ctx) {
		const h = ctx.params.h as number;
		const s = ctx.params.s as number;
		const v = ctx.params.v as number;
		return { rgb: evalHsv2rgb(h, s, v) };
	}
};

registerPrimitive(hsv2rgb);
