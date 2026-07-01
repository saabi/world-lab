import { quantity, Type } from '@virtual-planet/schema';

import type { NodePrimitive } from '../primitive.js';
import { registerPrimitive } from '../registry.js';
import { evalPerlin3d } from './perlin3d.js';

export function evalFbm3d(
	x: number,
	y: number,
	z: number,
	octaves: number,
	persistence: number,
	lacunarity: number
): number {
	let value = 0;
	let amplitude = 1;
	let frequency = 1;
	let maxValue = 0;
	for (let i = 0; i < octaves; i++) {
		value += amplitude * evalPerlin3d(x * frequency, y * frequency, z * frequency);
		maxValue += amplitude;
		amplitude *= persistence;
		frequency *= lacunarity;
	}
	return value / maxValue;
}

const fbm: NodePrimitive = {
	id: 'noise.fbm',
	category: 'noise',
	inputs: [{ name: 'position', dataType: 'vec3f' }],
	outputs: [{ name: 'value', dataType: 'f32' }],
	params: Type.Object({
		octaves: quantity('none', { integer: true, default: 4, min: 1, max: 8 }),
		persistence: quantity('none', { default: 0.5, min: 0, max: 1 }),
		lacunarity: quantity('none', { default: 2.0, min: 1, max: 4 })
	}),
	wgsl: { moduleId: 'noise.fbm', entry: 'fbm' },
	metadata: {
		help: 'Fractional Brownian motion — stacked Perlin octaves with persistence and lacunarity.',
		pure: true,
		deterministic: true
	},
	evalCPU(ctx) {
		const position = ctx.inputs.position as number[];
		const octaves = ctx.params.octaves as number;
		const persistence = ctx.params.persistence as number;
		const lacunarity = ctx.params.lacunarity as number;
		const value = evalFbm3d(
			position[0],
			position[1],
			position[2],
			octaves,
			persistence,
			lacunarity
		);
		return { value };
	}
};

registerPrimitive(fbm);
