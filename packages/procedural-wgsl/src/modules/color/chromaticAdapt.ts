/** WGSL module `color.chromaticAdapt` — Bradford chromatic adaptation (colorlab adapt.ts). */
export const COLOR_CHROMATIC_ADAPT_SOURCE = `/*---
id: color.chromaticAdapt
entry: chromaticAdapt
category: Colour
keywords: [Effects, Colour]
pure: true
deterministic: true
inputs:
  xyz:
  srcWhite:
  dstWhite:
outputs:
  adapted:
---*/
// source: colorlab
// @use color.colorlabCommon

const BRADFORD: array<f32, 9> = array<f32, 9>(
	0.8951, 0.2664, -0.1614,
	-0.7502, 1.7135, 0.0367,
	0.0389, -0.0685, 1.0296
);
const BRADFORD_INV: array<f32, 9> = array<f32, 9>(
	0.9869929054667123, -0.14705425642099013, 0.15996265166373122,
	0.43230526972339456, 0.5183602715367776, 0.0492912282128556,
	-0.008528664575177328, 0.04004282165408487, 0.9684866957875501
);

fn mulMat3(a: array<f32, 9>, b: array<f32, 9>) -> array<f32, 9> {
	return array<f32, 9>(
		a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
		a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
		a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
		a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
		a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
		a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
		a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
		a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
		a[6] * b[2] + a[7] * b[5] + a[8] * b[8]
	);
}

fn bradfordAdaptation(srcWhite: vec3<f32>, dstWhite: vec3<f32>) -> array<f32, 9> {
	let s = mulMat3Vec3(BRADFORD, srcWhite);
	let d = mulMat3Vec3(BRADFORD, dstWhite);
	let scale = array<f32, 9>(
		d.x / s.x, 0.0, 0.0,
		0.0, d.y / s.y, 0.0,
		0.0, 0.0, d.z / s.z
	);
	return mulMat3(BRADFORD_INV, mulMat3(scale, BRADFORD));
}

fn chromaticAdapt(xyz: vec3<f32>, srcWhite: vec3<f32>, dstWhite: vec3<f32>) -> vec3<f32> {
	return mulMat3Vec3(bradfordAdaptation(srcWhite, dstWhite), xyz);
}`;

export const COLOR_CHROMATIC_ADAPT_MODULE = {
	id: 'color.chromaticAdapt',
	dependencies: ['color.colorlabCommon'] as const,
	source: COLOR_CHROMATIC_ADAPT_SOURCE
} as const;
