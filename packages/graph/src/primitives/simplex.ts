import { Type } from '@virtual-planet/schema';

import type { NodePrimitive } from '../primitive.js';
import { registerPrimitive } from '../registry.js';

const PERM = buildPermutationTable();

const GRAD3: readonly (readonly [number, number, number])[] = [
	[1, 1, 0],
	[-1, 1, 0],
	[1, -1, 0],
	[-1, -1, 0],
	[1, 0, 1],
	[-1, 0, 1],
	[1, 0, -1],
	[-1, 0, -1],
	[0, 1, 1],
	[0, -1, 1],
	[0, 1, -1],
	[0, -1, -1]
];

const F3 = 1 / 3;
const G3 = 1 / 6;

function buildPermutationTable(): Uint8Array {
	const p = new Uint8Array(512);
	const base = new Uint8Array(256);
	for (let i = 0; i < 256; i++) base[i] = i;
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

function dot3(g: readonly [number, number, number], x: number, y: number, z: number): number {
	return g[0] * x + g[1] * y + g[2] * z;
}

function contrib(x: number, y: number, z: number, gi: number): number {
	const t = 0.6 - x * x - y * y - z * z;
	if (t < 0) return 0;
	const g = GRAD3[gi % 12]!;
	return t * t * t * t * dot3(g, x, y, z);
}

export function evalSimplex3d(x: number, y: number, z: number): number {
	const s = (x + y + z) * F3;
	const i = Math.floor(x + s);
	const j = Math.floor(y + s);
	const k = Math.floor(z + s);
	const t = (i + j + k) * G3;
	const x0 = x - (i - t);
	const y0 = y - (j - t);
	const z0 = z - (k - t);

	let i1: number;
	let j1: number;
	let k1: number;
	let i2: number;
	let j2: number;
	let k2: number;

	if (x0 >= y0) {
		if (y0 >= z0) {
			i1 = 1;
			j1 = 0;
			k1 = 0;
			i2 = 1;
			j2 = 1;
			k2 = 0;
		} else if (x0 >= z0) {
			i1 = 1;
			j1 = 0;
			k1 = 0;
			i2 = 1;
			j2 = 0;
			k2 = 1;
		} else {
			i1 = 0;
			j1 = 0;
			k1 = 1;
			i2 = 1;
			j2 = 0;
			k2 = 1;
		}
	} else if (y0 < z0) {
		i1 = 0;
		j1 = 0;
		k1 = 1;
		i2 = 0;
		j2 = 1;
		k2 = 1;
	} else if (x0 < z0) {
		i1 = 0;
		j1 = 1;
		k1 = 0;
		i2 = 0;
		j2 = 1;
		k2 = 1;
	} else {
		i1 = 0;
		j1 = 1;
		k1 = 0;
		i2 = 1;
		j2 = 1;
		k2 = 0;
	}

	const ii = i & 255;
	const jj = j & 255;
	const kk = k & 255;

	const gi0 = PERM[ii + PERM[jj + PERM[kk]]] % 12;
	const gi1 = PERM[ii + i1 + PERM[jj + j1 + PERM[kk + k1]]] % 12;
	const gi2 = PERM[ii + i2 + PERM[jj + j2 + PERM[kk + k2]]] % 12;
	const gi3 = PERM[ii + 1 + PERM[jj + 1 + PERM[kk + 1]]] % 12;

	const n0 = contrib(x0, y0, z0, gi0);
	const n1 = contrib(x0 - i1 + G3, y0 - j1 + G3, z0 - k1 + G3, gi1);
	const n2 = contrib(x0 - i2 + 2 * G3, y0 - j2 + 2 * G3, z0 - k2 + 2 * G3, gi2);
	const n3 = contrib(x0 - 1 + 3 * G3, y0 - 1 + 3 * G3, z0 - 1 + 3 * G3, gi3);

	return 32 * (n0 + n1 + n2 + n3);
}

const simplex: NodePrimitive = {
	id: 'noise.simplex',
	category: 'noise',
	inputs: [{ name: 'position', dataType: 'vec3f' }],
	outputs: [{ name: 'value', dataType: 'f32' }],
	params: Type.Object({}),
	wgsl: { moduleId: 'noise.simplex', entry: 'simplex3d' },
	metadata: {
		help: 'Simplex noise in 3D — faster and less directional bias than Perlin.',
		pure: true,
		deterministic: true
	},
	evalCPU(ctx) {
		const position = ctx.inputs.position as number[];
		const value = evalSimplex3d(position[0], position[1], position[2]);
		return { value };
	}
};

registerPrimitive(simplex);
