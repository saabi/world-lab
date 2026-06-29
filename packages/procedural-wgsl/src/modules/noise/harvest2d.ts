// Ported from _docs/architecture/procedural-graph/noise-functions.glsl (MIT, @Peace @lumiey)

/** Shared 2D hash helpers — resolver-only dependency module `noise.hash2d`. */
export const NOISE_HASH2D_SOURCE = `// Ported from noise-functions.glsl (MIT, @Peace @lumiey)

fn hash12(p: vec2f) -> f32 {
	let u = bitcast<vec2u>(p * vec2f(141421356.0, 2718281828.0));
	return f32((u.x ^ u.y) * 3141592653u) / f32(0xffffffffu);
}

fn hash22(p: vec2f) -> vec2f {
	let u = bitcast<vec2u>(p * vec2f(141421356.0, 2718281828.0));
	let xored = u.x ^ u.y;
	return vec2f(f32(xored * 3141592653u), f32(xored * 1618033988u)) / f32(0xffffffffu);
}

fn hash32(p: vec2f) -> vec3f {
	let u = bitcast<vec2u>(p * vec2f(141421356.0, 2718281828.0));
	let xored = u.x ^ u.y;
	return vec3f(
		f32(xored * 1732050807u),
		f32(xored * 2645751311u),
		f32(xored * 3316624790u)
	) / f32(0xffffffffu);
}`;

export const NOISE_HASH2D_MODULE = {
	id: 'noise.hash2d',
	source: NOISE_HASH2D_SOURCE
} as const;

const NOISE_PROVENANCE = `// Ported from noise-functions.glsl (MIT, @Peace @lumiey)`;

const NOISE_FRONTMATTER = (id: string, entry: string, outputs: string, params = '') => `/*---
id: ${id}
entry: ${entry}
category: noise
keywords: [Fields]
pure: true
deterministic: true
inputs:
  position:
${params}${outputs}
---*/
${NOISE_PROVENANCE}`;

export const NOISE_VALUE2D_SOURCE = `${NOISE_FRONTMATTER('noise.value2d', 'value2d', `outputs:
  value:`)}
// @use noise.hash2d
fn value2d(position: vec2<f32>) -> f32 {
	let i = floor(position);
	var f = position - i;
	f = f * f * (3.0 - 2.0 * f);
	return mix(
		mix(hash12(i), hash12(i + vec2f(1.0, 0.0)), f.x),
		mix(hash12(i + vec2f(0.0, 1.0)), hash12(i + vec2f(1.0, 1.0)), f.x),
		f.y
	);
}`;

export const NOISE_VALUE2D_MODULE = {
	id: 'noise.value2d',
	dependencies: ['noise.hash2d'],
	source: NOISE_VALUE2D_SOURCE
} as const;

export const NOISE_PERLIN2D_SOURCE = `${NOISE_FRONTMATTER('noise.perlin2d', 'perlin2d', `outputs:
  value:`)}
// @use noise.hash2d
fn perlin2d(position: vec2<f32>) -> f32 {
	let i = floor(position);
	let f = position - i;
	let u = f * f * f * (10.0 + f * (6.0 * f - 15.0));
	let ga = normalize(hash22(i + vec2f(0.0, 0.0)) - vec2f(0.5));
	let gb = normalize(hash22(i + vec2f(1.0, 0.0)) - vec2f(0.5));
	let gc = normalize(hash22(i + vec2f(0.0, 1.0)) - vec2f(0.5));
	let gd = normalize(hash22(i + vec2f(1.0, 1.0)) - vec2f(0.5));
	let a = dot(ga, f - vec2f(0.0, 0.0));
	let b = dot(gb, f - vec2f(1.0, 0.0));
	let c = dot(gc, f - vec2f(0.0, 1.0));
	let d = dot(gd, f - vec2f(1.0, 1.0));
	return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 0.7 + 0.5;
}`;

export const NOISE_PERLIN2D_MODULE = {
	id: 'noise.perlin2d',
	dependencies: ['noise.hash2d'],
	source: NOISE_PERLIN2D_SOURCE
} as const;

export const NOISE_PERLIN2D_DERIV_SOURCE = `${NOISE_FRONTMATTER('noise.perlin2dDeriv', 'perlin2dDeriv', `outputs:
  sample:`)}
// @use noise.hash2d
fn perlin2dDeriv(position: vec2<f32>) -> vec3<f32> {
	let i = floor(position);
	let f = fract(position);
	let u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
	let du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
	let ga = hash22(i + vec2f(0.0, 0.0)) * 2.0 - 1.0;
	let gb = hash22(i + vec2f(1.0, 0.0)) * 2.0 - 1.0;
	let gc = hash22(i + vec2f(0.0, 1.0)) * 2.0 - 1.0;
	let gd = hash22(i + vec2f(1.0, 1.0)) * 2.0 - 1.0;
	let va = dot(ga, f - vec2f(0.0, 0.0));
	let vb = dot(gb, f - vec2f(1.0, 0.0));
	let vc = dot(gc, f - vec2f(0.0, 1.0));
	let vd = dot(gd, f - vec2f(1.0, 1.0));
	let s = va - vb - vc + vd;
	let inner = vec2f(u.y, u.x) * s + vec2f(vb, vc) - vec2f(va);
	let grad = ga + u.x * (gb - ga) + u.y * (gc - ga) + u.x * u.y * (ga - gb - gc + gd) + du * inner;
	let value = va + u.x * (vb - va) + u.y * (vc - va) + u.x * u.y * s;
	return vec3<f32>(value, grad.x, grad.y);
}`;

export const NOISE_PERLIN2D_DERIV_MODULE = {
	id: 'noise.perlin2dDeriv',
	dependencies: ['noise.hash2d'],
	source: NOISE_PERLIN2D_DERIV_SOURCE
} as const;

export const NOISE_WORLEY2D_SOURCE = `${NOISE_FRONTMATTER('noise.worley2d', 'worley2d', `outputs:
  value:`)}
// @use noise.hash2d
fn worley2d(position: vec2<f32>) -> f32 {
	let i = floor(position);
	var p = position - i;
	var w = 1e9;
	for (var x = -1; x <= 1; x = x + 1) {
		for (var y = -1; y <= 1; y = y + 1) {
			let h = hash12(i + vec2f(f32(x), f32(y)));
			let c = p - vec2f(f32(x), f32(y)) - vec2f(h);
			w = min(w, dot(c, c));
		}
	}
	return 1.0 - sqrt(w);
}`;

export const NOISE_WORLEY2D_MODULE = {
	id: 'noise.worley2d',
	dependencies: ['noise.hash2d'],
	source: NOISE_WORLEY2D_SOURCE
} as const;

export const NOISE_VORONOI2D_SOURCE = `${NOISE_FRONTMATTER(
	'noise.voronoi2d',
	'voronoi2d',
	`params:
  smoothness: { default: 1, min: 0.01, max: 8 }
outputs:
  value:`,
	''
)}
// @use noise.hash2d
fn voronoi2d(position: vec2<f32>, smoothness: f32) -> f32 {
	var s = 1.0 / smoothness;
	let p = floor(position);
	let f = position - p;
	var va = 0.0;
	var wt = 0.0;
	for (var x = -1; x <= 1; x = x + 1) {
		for (var y = -1; y <= 1; y = y + 1) {
			let o = hash32(p + vec2f(f32(x), f32(y)));
			let d = length(vec2f(f32(x), f32(y)) - f + o.xy);
			let ww = pow(smoothstep(1.414, 0.0, d), s);
			va += o.z * ww;
			wt += ww;
		}
	}
	return va / wt;
}`;

export const NOISE_VORONOI2D_MODULE = {
	id: 'noise.voronoi2d',
	dependencies: ['noise.hash2d'],
	source: NOISE_VORONOI2D_SOURCE
} as const;

export const NOISE_BLUE2D_SOURCE = `${NOISE_FRONTMATTER('noise.blue2d', 'blue2d', `outputs:
  value:`)}
// @use noise.hash2d
fn blue2d(position: vec2<f32>) -> f32 {
	var v = 0.0;
	for (var k = 0; k < 9; k = k + 1) {
		let ox = f32(k % 3 - 1);
		let oy = f32(k / 3 - 1);
		v += hash12(position + vec2f(ox, oy));
	}
	return 0.9 * (1.125 * hash12(position) - v / 8.0) + 0.5;
}`;

export const NOISE_BLUE2D_MODULE = {
	id: 'noise.blue2d',
	dependencies: ['noise.hash2d'],
	source: NOISE_BLUE2D_SOURCE
} as const;
