import { Type } from '@world-lab/schema';

import type { NodePrimitiveInput } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';
import { D50, D65 } from './constants.js';
import { evalChromaticAdapt } from './evalColorlab.js';

const chromaticAdapt: NodePrimitiveInput = {
	id: 'color.chromaticAdapt',
	category: 'Colour',
	inputs: [
		{ name: 'xyz', dataType: 'vec3f' },
		{ name: 'srcWhite', dataType: 'vec3f', default: [...D65] },
		{ name: 'dstWhite', dataType: 'vec3f', default: [...D50] }
	],
	outputs: [{ name: 'adapted', dataType: 'vec3f' }],
	params: Type.Object({}),
	wgsl: { moduleId: 'color.chromaticAdapt', entry: 'chromaticAdapt' },
	metadata: {
		keywords: ['Effects', 'Colour'],
		pure: true,
		deterministic: true,
		help: 'Bradford chromatic adaptation: re-references XYZ from srcWhite illuminant to dstWhite (defaults D65→D50).'
	},
	evalCPU(ctx) {
		const xyz = ctx.inputs.xyz as number[];
		const srcWhite = (ctx.inputs.srcWhite as number[] | undefined) ?? [...D65];
		const dstWhite = (ctx.inputs.dstWhite as number[] | undefined) ?? [...D50];
		return {
			adapted: [
				...evalChromaticAdapt(
					xyz as [number, number, number],
					srcWhite as [number, number, number],
					dstWhite as [number, number, number]
				)
			]
		};
	}
};

registerPrimitive(chromaticAdapt);
