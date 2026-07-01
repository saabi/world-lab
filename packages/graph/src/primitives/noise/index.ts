import { quantity, Type } from '@virtual-planet/schema';

import type { NodePrimitive } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';
import {
	evalBlue2d,
	evalPerlin2d,
	evalPerlin2dDeriv,
	evalValue2d,
	evalVoronoi2d,
	evalWorley2d
} from './eval2d.js';

const noiseMeta = { keywords: ['Fields'], pure: true, deterministic: true };

const value2d: NodePrimitive = {
	id: 'noise.value2d',
	category: 'noise',
	inputs: [{ name: 'position', dataType: 'vec2f' }],
	outputs: [{ name: 'value', dataType: 'f32' }],
	params: Type.Object({}),
	wgsl: { moduleId: 'noise.value2d', entry: 'value2d' },
	metadata: {
		...noiseMeta,
		help: 'Hash-based value noise in 2D; blocky at integer scales.'
	},
	evalCPU(ctx) {
		const position = ctx.inputs.position as number[];
		return { value: evalValue2d(position[0], position[1]) };
	}
};

const perlin2d: NodePrimitive = {
	id: 'noise.perlin2d',
	category: 'noise',
	inputs: [{ name: 'position', dataType: 'vec2f' }],
	outputs: [{ name: 'value', dataType: 'f32' }],
	params: Type.Object({}),
	wgsl: { moduleId: 'noise.perlin2d', entry: 'perlin2d' },
	metadata: {
		...noiseMeta,
		help: 'Classic gradient Perlin noise in 2D.'
	},
	evalCPU(ctx) {
		const position = ctx.inputs.position as number[];
		return { value: evalPerlin2d(position[0], position[1]) };
	}
};

const perlin2dDeriv: NodePrimitive = {
	id: 'noise.perlin2dDeriv',
	category: 'noise',
	inputs: [{ name: 'position', dataType: 'vec2f' }],
	outputs: [{ name: 'sample', dataType: 'vec3f' }],
	params: Type.Object({}),
	wgsl: { moduleId: 'noise.perlin2dDeriv', entry: 'perlin2dDeriv' },
	metadata: {
		...noiseMeta,
		help: 'Perlin value with analytic ∂/∂x and ∂/∂y in .xy; gradient magnitude in .z.'
	},
	evalCPU(ctx) {
		const position = ctx.inputs.position as number[];
		const sample = evalPerlin2dDeriv(position[0], position[1]);
		return { sample: [...sample] };
	}
};

const worley2d: NodePrimitive = {
	id: 'noise.worley2d',
	category: 'noise',
	inputs: [{ name: 'position', dataType: 'vec2f' }],
	outputs: [{ name: 'value', dataType: 'f32' }],
	params: Type.Object({}),
	wgsl: { moduleId: 'noise.worley2d', entry: 'worley2d' },
	metadata: {
		...noiseMeta,
		help: 'Cellular Worley distance noise in 2D.'
	},
	evalCPU(ctx) {
		const position = ctx.inputs.position as number[];
		return { value: evalWorley2d(position[0], position[1]) };
	}
};

const voronoi2d: NodePrimitive = {
	id: 'noise.voronoi2d',
	category: 'noise',
	inputs: [{ name: 'position', dataType: 'vec2f' }],
	outputs: [{ name: 'value', dataType: 'f32' }],
	params: Type.Object({
		smoothness: quantity('none', { default: 1, min: 0.01, max: 8 })
	}),
	wgsl: { moduleId: 'noise.voronoi2d', entry: 'voronoi2d' },
	metadata: {
		...noiseMeta,
		help: 'Smooth Voronoi cell noise; smoothness softens cell edges.'
	},
	evalCPU(ctx) {
		const position = ctx.inputs.position as number[];
		const smoothness = ctx.params.smoothness as number;
		return { value: evalVoronoi2d(position[0], position[1], smoothness) };
	}
};

const blue2d: NodePrimitive = {
	id: 'noise.blue2d',
	category: 'noise',
	inputs: [{ name: 'position', dataType: 'vec2f' }],
	outputs: [{ name: 'value', dataType: 'f32' }],
	params: Type.Object({}),
	wgsl: { moduleId: 'noise.blue2d', entry: 'blue2d' },
	metadata: {
		...noiseMeta,
		help: 'Blue-noise hash in 2D — high-frequency, less coherent than Perlin.'
	},
	evalCPU(ctx) {
		const position = ctx.inputs.position as number[];
		return { value: evalBlue2d(position[0], position[1]) };
	}
};

registerPrimitive(value2d);
registerPrimitive(perlin2d);
registerPrimitive(perlin2dDeriv);
registerPrimitive(worley2d);
registerPrimitive(voronoi2d);
registerPrimitive(blue2d);
