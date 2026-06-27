import { quantity, Type } from '@virtual-planet/schema';

import type { NodePrimitive } from '../primitive.js';
import { registerPrimitive } from '../registry.js';
import { evalPerlin3d } from './perlin3d.js';

export function evalRidgedFbm3d(
	x: number,
	y: number,
	z: number,
	octaves: number,
	persistence: number,
	lacunarity: number,
	offset: number
): number {
	let value = 0;
	let amplitude = 1;
	let frequency = 1;
	let weight = 1;

	for (let i = 0; i < octaves; i++) {
		let signal = offset - Math.abs(evalPerlin3d(x * frequency, y * frequency, z * frequency));
		signal *= signal;
		signal *= weight;
		weight = Math.min(1, signal * 2);
		value += signal * amplitude;
		amplitude *= persistence;
		frequency *= lacunarity;
	}

	return value;
}

const ridgedFbm: NodePrimitive = {
	id: 'noise.ridgedFbm',
	category: 'noise',
	inputs: [{ name: 'position', dataType: 'vec3f' }],
	outputs: [{ name: 'value', dataType: 'f32' }],
	params: Type.Object({
		octaves: quantity('none', { integer: true, default: 4, min: 1, max: 8 }),
		persistence: quantity('none', { default: 0.5, min: 0, max: 1 }),
		lacunarity: quantity('none', { default: 2.0, min: 1, max: 4 }),
		offset: quantity('none', { default: 1.0, min: 0, max: 2 })
	}),
	wgsl: { moduleId: 'noise.ridgedFbm', entry: 'ridgedFbm' },
	evalCPU(ctx) {
		const position = ctx.inputs.position as number[];
		const octaves = ctx.params.octaves as number;
		const persistence = ctx.params.persistence as number;
		const lacunarity = ctx.params.lacunarity as number;
		const offset = ctx.params.offset as number;
		const value = evalRidgedFbm3d(
			position[0],
			position[1],
			position[2],
			octaves,
			persistence,
			lacunarity,
			offset
		);
		return { value };
	}
};

registerPrimitive(ridgedFbm);
