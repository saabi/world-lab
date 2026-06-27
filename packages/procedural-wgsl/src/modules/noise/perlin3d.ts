/** Deterministic Fisher–Yates shuffle — mirrors `packages/graph/src/primitives/perlin3d.ts`. */
function buildPermutationTable(): number[] {
	const base = new Uint8Array(256);
	for (let i = 0; i < 256; i++) base[i] = i;
	let seed = 1315423911;
	for (let i = 255; i > 0; i--) {
		seed = (seed * 1664525 + 1013904223) >>> 0;
		const j = seed % (i + 1);
		const tmp = base[i]!;
		base[i] = base[j]!;
		base[j] = tmp;
	}
	const p = new Array<number>(512);
	for (let i = 0; i < 512; i++) p[i] = base[i & 255]!;
	return p;
}

function formatPermArray(values: number[]): string {
	const lines: string[] = [];
	for (let i = 0; i < values.length; i += 16) {
		lines.push('\t' + values.slice(i, i + 16).join(', ') + ',');
	}
	return lines.join('\n');
}

/** WGSL module `noise.perlin3d` — classic 3D Perlin (matches graph evalCPU). */
export const NOISE_PERLIN3D_SOURCE = `const PERM: array<u32, 512> = array<u32, 512>(
${formatPermArray(buildPermutationTable())}
);

fn perlin_fade(t: f32) -> f32 {
	return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

fn perlin_grad(hash: u32, x: f32, y: f32, z: f32) -> f32 {
	let h = hash & 15u;
	let u = select(y, x, h < 8u);
	let v = select(select(z, x, h == 12u || h == 14u), y, h < 4u);
	let u_term = select(-u, u, (h & 1u) == 0u);
	let v_term = select(-v, v, (h & 2u) == 0u);
	return u_term + v_term;
}

fn perlin_lerp(a: f32, b: f32, t: f32) -> f32 {
	return a + t * (b - a);
}

fn perlin3d(position: vec3<f32>) -> f32 {
	let x = position.x;
	let y = position.y;
	let z = position.z;
	let xi = u32(floor(x)) & 255u;
	let yi = u32(floor(y)) & 255u;
	let zi = u32(floor(z)) & 255u;
	let xf = x - floor(x);
	let yf = y - floor(y);
	let zf = z - floor(z);
	let u = perlin_fade(xf);
	let v = perlin_fade(yf);
	let w = perlin_fade(zf);

	let aaa = PERM[PERM[PERM[xi] + yi] + zi];
	let aba = PERM[PERM[PERM[xi] + yi + 1u] + zi];
	let aab = PERM[PERM[PERM[xi] + yi] + zi + 1u];
	let abb = PERM[PERM[PERM[xi] + yi + 1u] + zi + 1u];
	let baa = PERM[PERM[PERM[xi + 1u] + yi] + zi];
	let bba = PERM[PERM[PERM[xi + 1u] + yi + 1u] + zi];
	let bab = PERM[PERM[PERM[xi + 1u] + yi] + zi + 1u];
	let bbb = PERM[PERM[PERM[xi + 1u] + yi + 1u] + zi + 1u];

	let x1 = perlin_lerp(
		perlin_grad(aaa, xf, yf, zf),
		perlin_grad(baa, xf - 1.0, yf, zf),
		u
	);
	let x2 = perlin_lerp(
		perlin_grad(aba, xf, yf - 1.0, zf),
		perlin_grad(bba, xf - 1.0, yf - 1.0, zf),
		u
	);
	let y1 = perlin_lerp(x1, x2, v);

	let x3 = perlin_lerp(
		perlin_grad(aab, xf, yf, zf - 1.0),
		perlin_grad(bab, xf - 1.0, yf, zf - 1.0),
		u
	);
	let x4 = perlin_lerp(
		perlin_grad(abb, xf, yf - 1.0, zf - 1.0),
		perlin_grad(bbb, xf - 1.0, yf - 1.0, zf - 1.0),
		u
	);
	let y2 = perlin_lerp(x3, x4, v);

	return perlin_lerp(y1, y2, w);
}`;

export const NOISE_PERLIN3D_MODULE = {
	id: 'noise.perlin3d',
	source: NOISE_PERLIN3D_SOURCE
} as const;
