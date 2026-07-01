import { Type } from '@virtual-planet/schema';

import type { NodePrimitive } from '../primitive.js';
import { registerPrimitive } from '../registry.js';

const PERM = buildPermutationTable();

function buildPermutationTable(): Uint8Array {
	const p = new Uint8Array(512);
	const base = new Uint8Array(256);
	for (let i = 0; i < 256; i++) base[i] = i;
	// Deterministic Fisher–Yates shuffle with fixed seed sequence.
	let seed = 1315423911;
	for (let i = 255; i > 0; i--) {
		seed = (seed * 1664525 + 1013904223) >>> 0;
		const j = seed % (i + 1);
		const tmp = base[i];
		base[i] = base[j];
		base[j] = tmp;
	}
	for (let i = 0; i < 512; i++) p[i] = base[i & 255];
	return p;
}

function fade(t: number): number {
	return t * t * t * (t * (t * 6 - 15) + 10);
}

function grad(hash: number, x: number, y: number, z: number): number {
	const h = hash & 15;
	const u = h < 8 ? x : y;
	const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
	return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

export function evalPerlin3d(x: number, y: number, z: number): number {
	const xi = Math.floor(x) & 255;
	const yi = Math.floor(y) & 255;
	const zi = Math.floor(z) & 255;
	const xf = x - Math.floor(x);
	const yf = y - Math.floor(y);
	const zf = z - Math.floor(z);
	const u = fade(xf);
	const v = fade(yf);
	const w = fade(zf);

	const aaa = PERM[PERM[PERM[xi] + yi] + zi];
	const aba = PERM[PERM[PERM[xi] + yi + 1] + zi];
	const aab = PERM[PERM[PERM[xi] + yi] + zi + 1];
	const abb = PERM[PERM[PERM[xi] + yi + 1] + zi + 1];
	const baa = PERM[PERM[PERM[xi + 1] + yi] + zi];
	const bba = PERM[PERM[PERM[xi + 1] + yi + 1] + zi];
	const bab = PERM[PERM[PERM[xi + 1] + yi] + zi + 1];
	const bbb = PERM[PERM[PERM[xi + 1] + yi + 1] + zi + 1];

	const x1 = lerp(
		grad(aaa, xf, yf, zf),
		grad(baa, xf - 1, yf, zf),
		u
	);
	const x2 = lerp(
		grad(aba, xf, yf - 1, zf),
		grad(bba, xf - 1, yf - 1, zf),
		u
	);
	const y1 = lerp(x1, x2, v);

	const x3 = lerp(
		grad(aab, xf, yf, zf - 1),
		grad(bab, xf - 1, yf, zf - 1),
		u
	);
	const x4 = lerp(
		grad(abb, xf, yf - 1, zf - 1),
		grad(bbb, xf - 1, yf - 1, zf - 1),
		u
	);
	const y2 = lerp(x3, x4, v);

	return lerp(y1, y2, w);
}

function lerp(a: number, b: number, t: number): number {
	return a + t * (b - a);
}

const perlin3dPrimitive: NodePrimitive = {
	id: 'noise.perlin3d',
	category: 'noise',
	inputs: [{ name: 'position', dataType: 'vec3f' }],
	outputs: [{ name: 'value', dataType: 'f32' }],
	params: Type.Object({}),
	wgsl: { moduleId: 'noise.perlin3d', entry: 'perlin3d' },
	metadata: {
		help: 'Classic gradient Perlin noise in 3D.',
		pure: true,
		deterministic: true
	},
	evalCPU(ctx) {
		const position = ctx.inputs.position as number[];
		const value = evalPerlin3d(position[0], position[1], position[2]);
		return { value };
	}
};

registerPrimitive(perlin3dPrimitive);
