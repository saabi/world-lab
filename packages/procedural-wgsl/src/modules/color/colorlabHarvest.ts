// Ported from colorlab/fe/src/lib/color/ (pipeline.ts, transfer.ts, interp.ts)

/** Shared colorlab helpers — resolver-only dependency module `color.colorlabCommon`. */
export const COLOR_COLORLAB_COMMON_SOURCE = `// source: colorlab

const D65_X: f32 = 0.9504492183;
const D65_Y: f32 = 1.0;
const D65_Z: f32 = 1.0889166484;

const SRGB2XYZ: array<f32, 9> = array<f32, 9>(
	0.4124108465, 0.3575845679, 0.1804538039,
	0.2126493427, 0.7151691357, 0.0721815216,
	0.0193317584, 0.119194856, 0.9503900341
);
const XYZ2SRGB: array<f32, 9> = array<f32, 9>(
	3.2408123989, -1.5373084456, -0.4985865229,
	-0.969243017, 1.8759663029, 0.0415550309,
	0.0556383984, -0.2040074609, 1.0571295703
);
const OK_M1: array<f32, 9> = array<f32, 9>(
	0.4122214708, 0.5363325363, 0.0514459929,
	0.2119034982, 0.6806995451, 0.1073969566,
	0.0883024619, 0.2817188376, 0.6299787005
);
const OK_M2: array<f32, 9> = array<f32, 9>(
	0.2104542553, 0.793617785, -0.0040720468,
	1.9779984951, -2.428592205, 0.4505937099,
	0.0259040371, 0.7827717662, -0.808675766
);
const OK_M1i: array<f32, 9> = array<f32, 9>(
	4.0767416613, -3.3077115904, 0.2309699287,
	-1.2684380041, 2.6097574007, -0.3413193963,
	-0.0041960865, -0.7034186145, 1.7076147009
);
const OK_M2i: array<f32, 9> = array<f32, 9>(
	0.9999999985, 0.3963377922, 0.2158037581,
	1.0000000089, -0.1055613423, -0.0638541748,
	1.0000000547, -0.0894841821, -1.2914855379
);

fn mulMat3Vec3(m: array<f32, 9>, v: vec3<f32>) -> vec3<f32> {
	return vec3<f32>(
		m[0] * v.x + m[1] * v.y + m[2] * v.z,
		m[3] * v.x + m[4] * v.y + m[5] * v.z,
		m[6] * v.x + m[7] * v.y + m[8] * v.z
	);
}

fn srgbEnc(c: f32) -> f32 {
	if (c <= 0.0031308) {
		return 12.92 * c;
	}
	return 1.055 * pow(c, 1.0 / 2.4) - 0.055;
}

fn srgbDec(c: f32) -> f32 {
	if (c <= 0.04045) {
		return c / 12.92;
	}
	return pow((c + 0.055) / 1.055, 2.4);
}

fn labF(t: f32) -> f32 {
	if (t > 0.008856) {
		return pow(t, 1.0 / 3.0);
	}
	return 7.787 * t + 16.0 / 116.0;
}

fn labFi(t: f32) -> f32 {
	let t3 = t * t * t;
	if (t3 > 0.008856) {
		return t3;
	}
	return (t - 16.0 / 116.0) / 7.787;
}

fn scbrt(v: f32) -> f32 {
	return sign(v) * pow(abs(v), 1.0 / 3.0);
}`;

export const COLOR_COLORLAB_COMMON_MODULE = {
	id: 'color.colorlabCommon',
	source: COLOR_COLORLAB_COMMON_SOURCE
} as const;

const COLORLAB_PROVENANCE = `// source: colorlab`;

const COLORLAB_FRONTMATTER = (
	id: string,
	entry: string,
	inputName: string,
	outputName: string
) => `/*---
id: ${id}
entry: ${entry}
category: Colour
keywords: [Effects, Colour]
role: colorSpace
pure: true
deterministic: true
inputs:
  ${inputName}:
outputs:
  ${outputName}:
---*/
${COLORLAB_PROVENANCE}`;

const COLORLAB_DEPS = ['color.colorlabCommon'] as const;

export const COLOR_SRGB_TRANSFER_SOURCE = `${COLORLAB_FRONTMATTER('color.srgbTransfer', 'srgbTransfer', 'linear', 'encoded')}
// @use color.colorlabCommon
fn srgbTransfer(linear: vec3<f32>) -> vec3<f32> {
	return vec3<f32>(srgbEnc(linear.x), srgbEnc(linear.y), srgbEnc(linear.z));
}`;

export const COLOR_SRGB_TRANSFER_MODULE = {
	id: 'color.srgbTransfer',
	dependencies: [...COLORLAB_DEPS],
	source: COLOR_SRGB_TRANSFER_SOURCE
} as const;

export const COLOR_SRGB_TRANSFER_INV_SOURCE = `${COLORLAB_FRONTMATTER('color.srgbTransferInv', 'srgbTransferInv', 'encoded', 'linear')}
// @use color.colorlabCommon
fn srgbTransferInv(encoded: vec3<f32>) -> vec3<f32> {
	return vec3<f32>(srgbDec(encoded.x), srgbDec(encoded.y), srgbDec(encoded.z));
}`;

export const COLOR_SRGB_TRANSFER_INV_MODULE = {
	id: 'color.srgbTransferInv',
	dependencies: [...COLORLAB_DEPS],
	source: COLOR_SRGB_TRANSFER_INV_SOURCE
} as const;

export const COLOR_SRGB_TO_XYZ_SOURCE = `${COLORLAB_FRONTMATTER('color.srgbToXyz', 'srgbToXyz', 'srgb', 'xyz')}
// @use color.colorlabCommon
fn srgbToXyz(srgb: vec3<f32>) -> vec3<f32> {
	let linear = vec3<f32>(srgbDec(srgb.x), srgbDec(srgb.y), srgbDec(srgb.z));
	return mulMat3Vec3(SRGB2XYZ, linear);
}`;

export const COLOR_SRGB_TO_XYZ_MODULE = {
	id: 'color.srgbToXyz',
	dependencies: [...COLORLAB_DEPS],
	source: COLOR_SRGB_TO_XYZ_SOURCE
} as const;

export const COLOR_XYZ_TO_SRGB_SOURCE = `${COLORLAB_FRONTMATTER('color.xyzToSrgb', 'xyzToSrgb', 'xyz', 'srgb')}
// @use color.colorlabCommon
fn xyzToSrgb(xyz: vec3<f32>) -> vec3<f32> {
	let linear = mulMat3Vec3(XYZ2SRGB, xyz);
	return vec3<f32>(srgbEnc(linear.x), srgbEnc(linear.y), srgbEnc(linear.z));
}`;

export const COLOR_XYZ_TO_SRGB_MODULE = {
	id: 'color.xyzToSrgb',
	dependencies: [...COLORLAB_DEPS],
	source: COLOR_XYZ_TO_SRGB_SOURCE
} as const;

export const COLOR_XYZ_TO_LAB_SOURCE = `${COLORLAB_FRONTMATTER('color.xyzToLab', 'xyzToLab', 'xyz', 'lab')}
// @use color.colorlabCommon
fn xyzToLab(xyz: vec3<f32>) -> vec3<f32> {
	let fx = labF(xyz.x / D65_X);
	let fy = labF(xyz.y / D65_Y);
	let fz = labF(xyz.z / D65_Z);
	return vec3<f32>(116.0 * fy - 16.0, 500.0 * (fx - fy), 200.0 * (fy - fz));
}`;

export const COLOR_XYZ_TO_LAB_MODULE = {
	id: 'color.xyzToLab',
	dependencies: [...COLORLAB_DEPS],
	source: COLOR_XYZ_TO_LAB_SOURCE
} as const;

export const COLOR_LAB_TO_XYZ_SOURCE = `${COLORLAB_FRONTMATTER('color.labToXyz', 'labToXyz', 'lab', 'xyz')}
// @use color.colorlabCommon
fn labToXyz(lab: vec3<f32>) -> vec3<f32> {
	let fy = (lab.x + 16.0) / 116.0;
	let fx = lab.y / 500.0 + fy;
	let fz = fy - lab.z / 200.0;
	return vec3<f32>(D65_X * labFi(fx), D65_Y * labFi(fy), D65_Z * labFi(fz));
}`;

export const COLOR_LAB_TO_XYZ_MODULE = {
	id: 'color.labToXyz',
	dependencies: [...COLORLAB_DEPS],
	source: COLOR_LAB_TO_XYZ_SOURCE
} as const;

export const COLOR_XYZ_TO_LUV_SOURCE = `${COLORLAB_FRONTMATTER('color.xyzToLuv', 'xyzToLuv', 'xyz', 'luv')}
// @use color.colorlabCommon
fn xyzToLuv(xyz: vec3<f32>) -> vec3<f32> {
	let denom = xyz.x + 15.0 * xyz.y + 3.0 * xyz.z;
	var up = 0.0;
	var vp = 0.0;
	if (denom != 0.0) {
		up = (4.0 * xyz.x) / denom;
		vp = (9.0 * xyz.y) / denom;
	}
	let wd = D65_X + 15.0 * D65_Y + 3.0 * D65_Z;
	let un = (4.0 * D65_X) / wd;
	let vn = (9.0 * D65_Y) / wd;
	let L = 116.0 * labF(xyz.y / D65_Y) - 16.0;
	return vec3<f32>(L, 13.0 * L * (up - un), 13.0 * L * (vp - vn));
}`;

export const COLOR_XYZ_TO_LUV_MODULE = {
	id: 'color.xyzToLuv',
	dependencies: [...COLORLAB_DEPS],
	source: COLOR_XYZ_TO_LUV_SOURCE
} as const;

export const COLOR_LUV_TO_XYZ_SOURCE = `${COLORLAB_FRONTMATTER('color.luvToXyz', 'luvToXyz', 'luv', 'xyz')}
// @use color.colorlabCommon
fn luvToXyz(luv: vec3<f32>) -> vec3<f32> {
	let L = luv.x;
	if (L <= 1e-8) {
		return vec3<f32>(0.0);
	}
	let wd = D65_X + 15.0 * D65_Y + 3.0 * D65_Z;
	let un = (4.0 * D65_X) / wd;
	let vn = (9.0 * D65_Y) / wd;
	let up = luv.y / (13.0 * L) + un;
	let vp = luv.z / (13.0 * L) + vn;
	let Y = D65_Y * labFi((L + 16.0) / 116.0);
	if (vp == 0.0) {
		return vec3<f32>(0.0, Y, 0.0);
	}
	let X = (Y * 9.0 * up) / (4.0 * vp);
	let Z = (Y * (12.0 - 3.0 * up - 20.0 * vp)) / (4.0 * vp);
	return vec3<f32>(X, Y, Z);
}`;

export const COLOR_LUV_TO_XYZ_MODULE = {
	id: 'color.luvToXyz',
	dependencies: [...COLORLAB_DEPS],
	source: COLOR_LUV_TO_XYZ_SOURCE
} as const;

export const COLOR_LSRGB_TO_OKLAB_SOURCE = `${COLORLAB_FRONTMATTER('color.lsrgbToOklab', 'lsrgbToOklab', 'lsrgb', 'oklab')}
// @use color.colorlabCommon
fn lsrgbToOklab(lsrgb: vec3<f32>) -> vec3<f32> {
	let lms = mulMat3Vec3(OK_M1, lsrgb);
	let l = vec3<f32>(scbrt(lms.x), scbrt(lms.y), scbrt(lms.z));
	return mulMat3Vec3(OK_M2, l);
}`;

export const COLOR_LSRGB_TO_OKLAB_MODULE = {
	id: 'color.lsrgbToOklab',
	dependencies: [...COLORLAB_DEPS],
	source: COLOR_LSRGB_TO_OKLAB_SOURCE
} as const;

export const COLOR_OKLAB_TO_LSRGB_SOURCE = `${COLORLAB_FRONTMATTER('color.oklabToLsrgb', 'oklabToLsrgb', 'oklab', 'lsrgb')}
// @use color.colorlabCommon
fn oklabToLsrgb(oklab: vec3<f32>) -> vec3<f32> {
	let l = mulMat3Vec3(OK_M2i, oklab);
	let lms = vec3<f32>(l.x * l.x * l.x, l.y * l.y * l.y, l.z * l.z * l.z);
	return mulMat3Vec3(OK_M1i, lms);
}`;

export const COLOR_OKLAB_TO_LSRGB_MODULE = {
	id: 'color.oklabToLsrgb',
	dependencies: [...COLORLAB_DEPS],
	source: COLOR_OKLAB_TO_LSRGB_SOURCE
} as const;

export const COLOR_OKLAB_TO_OKLCH_SOURCE = `${COLORLAB_FRONTMATTER('color.oklabToOklch', 'oklabToOklch', 'oklab', 'oklch')}
fn oklabToOklch(oklab: vec3<f32>) -> vec3<f32> {
	let l = oklab.x;
	let a = oklab.y;
	let b = oklab.z;
	let c = length(vec2<f32>(a, b));
	var hue = degrees(atan2(b, a));
	hue = hue % 360.0;
	if (hue < 0.0) {
		hue += 360.0;
	}
	return vec3<f32>(l, c, hue);
}`;

export const COLOR_OKLAB_TO_OKLCH_MODULE = {
	id: 'color.oklabToOklch',
	source: COLOR_OKLAB_TO_OKLCH_SOURCE
} as const;

export const COLOR_OKLCH_TO_OKLAB_SOURCE = `${COLORLAB_FRONTMATTER('color.oklchToOklab', 'oklchToOklab', 'oklch', 'oklab')}
fn oklchToOklab(oklch: vec3<f32>) -> vec3<f32> {
	let l = oklch.x;
	let c = oklch.y;
	let hRad = radians(oklch.z);
	return vec3<f32>(l, c * cos(hRad), c * sin(hRad));
}`;

export const COLOR_OKLCH_TO_OKLAB_MODULE = {
	id: 'color.oklchToOklab',
	source: COLOR_OKLCH_TO_OKLAB_SOURCE
} as const;

export const COLORLAB_HARVEST_MODULES = [
	COLOR_SRGB_TRANSFER_MODULE,
	COLOR_SRGB_TRANSFER_INV_MODULE,
	COLOR_SRGB_TO_XYZ_MODULE,
	COLOR_XYZ_TO_SRGB_MODULE,
	COLOR_XYZ_TO_LAB_MODULE,
	COLOR_LAB_TO_XYZ_MODULE,
	COLOR_XYZ_TO_LUV_MODULE,
	COLOR_LUV_TO_XYZ_MODULE,
	COLOR_LSRGB_TO_OKLAB_MODULE,
	COLOR_OKLAB_TO_LSRGB_MODULE,
	COLOR_OKLAB_TO_OKLCH_MODULE,
	COLOR_OKLCH_TO_OKLAB_MODULE
] as const;
