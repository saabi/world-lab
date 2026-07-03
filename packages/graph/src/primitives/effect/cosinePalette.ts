import { Type } from '@world-lab/schema';

import type { NodePrimitiveInput } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';

const cosinePalette: NodePrimitiveInput = {
	id: 'effect.cosinePalette',
	category: 'ShaderToy',
	inputs: [
		{ name: 'fragCoord', dataType: 'vec2f', metadata: { semantic: 'pixel' } },
		{ name: 'iResolution', dataType: 'vec2f', metadata: { semantic: 'target-resolution' } },
		{ name: 'iTime', dataType: 'f32', metadata: { semantic: 'time' } }
	],
	outputs: [{ name: 'color', dataType: 'vec4f', metadata: { semantic: 'rgba' } }],
	params: Type.Object({}),
	wgsl: {
		moduleId: 'effect.cosinePalette',
		entry: 'cosine_palette',
		arguments: [
			{ name: 'fragCoord', source: 'input' },
			{ name: 'iResolution', source: 'input' },
			{ name: 'iTime', source: 'input' }
		]
	},
	metadata: {
		keywords: ['Effects', 'ShaderToy'],
		pure: true,
		deterministic: false,
		help: 'Inigo Quilez cosine gradient palette driven by fragCoord, resolution, and time.'
	},
	evalCPU(ctx) {
		const fragCoord = ctx.inputs.fragCoord as number[];
		const iResolution = ctx.inputs.iResolution as number[];
		const iTime = ctx.inputs.iTime as number;
		const uv = [fragCoord[0]! / iResolution[0]!, fragCoord[1]! / iResolution[1]!];
		const col = [0, 1, 2].map((i) => {
			const phase = iTime + (i === 0 ? uv[0]! : i === 1 ? uv[1]! : uv[0]!) + [0, 2, 4][i]!;
			return 0.5 + 0.5 * Math.cos(phase);
		});
		return { color: [...col, 1] };
	}
};

registerPrimitive(cosinePalette);
