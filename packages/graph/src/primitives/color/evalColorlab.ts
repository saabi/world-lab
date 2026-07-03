import { D65, D50, mulMat3, mulMat3Vec3, BRADFORD, BRADFORD_INV, OK_M1, OK_M1i, OK_M2, OK_M2i, SRGB2XYZ, XYZ2SRGB, type Mat3, type Vec3 } from './constants.js';

const DEG = 180 / Math.PI;

/** Exact sRGB piecewise encode (linear → encoded). */
export function srgbEnc(v: number): number {
	return v <= 0.003_130_8 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
}

/** Exact sRGB piecewise decode (encoded → linear). */
export function srgbDec(v: number): number {
	return v <= 0.040_45 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function map3(v: Vec3, fn: (c: number) => number): Vec3 {
	return [fn(v[0]), fn(v[1]), fn(v[2])];
}

function labF(t: number): number {
	return t > 0.008_856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}

function labFi(t: number): number {
	const t3 = t * t * t;
	return t3 > 0.008_856 ? t3 : (t - 16 / 116) / 7.787;
}

/** Signed cube root — preserves negative/out-of-gamut Oklab channels. */
function scbrt(v: number): number {
	return Math.sign(v) * Math.cbrt(Math.abs(v));
}

export function evalSrgbTransfer(linear: Vec3): Vec3 {
	return map3(linear, srgbEnc);
}

export function evalSrgbTransferInv(encoded: Vec3): Vec3 {
	return map3(encoded, srgbDec);
}

export function evalSrgbToXyz(srgb: Vec3): Vec3 {
	return mulMat3Vec3(SRGB2XYZ, map3(srgb, srgbDec));
}

export function evalXyzToSrgb(xyz: Vec3): Vec3 {
	return map3(mulMat3Vec3(XYZ2SRGB, xyz), srgbEnc);
}

export function evalXyzToLab(xyz: Vec3): Vec3 {
	const fx = labF(xyz[0] / D65[0]);
	const fy = labF(xyz[1] / D65[1]);
	const fz = labF(xyz[2] / D65[2]);
	return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function evalLabToXyz(lab: Vec3): Vec3 {
	const fy = (lab[0] + 16) / 116;
	const fx = lab[1] / 500 + fy;
	const fz = fy - lab[2] / 200;
	return [D65[0] * labFi(fx), D65[1] * labFi(fy), D65[2] * labFi(fz)];
}

export function evalXyzToLuv(xyz: Vec3): Vec3 {
	const denom = xyz[0] + 15 * xyz[1] + 3 * xyz[2];
	const up = denom === 0 ? 0 : (4 * xyz[0]) / denom;
	const vp = denom === 0 ? 0 : (9 * xyz[1]) / denom;
	const wd = D65[0] + 15 * D65[1] + 3 * D65[2];
	const un = (4 * D65[0]) / wd;
	const vn = (9 * D65[1]) / wd;
	const L = 116 * labF(xyz[1] / D65[1]) - 16;
	return [L, 13 * L * (up - un), 13 * L * (vp - vn)];
}

export function evalLuvToXyz(luv: Vec3): Vec3 {
	const L = luv[0];
	if (L <= 1e-8) return [0, 0, 0];
	const wd = D65[0] + 15 * D65[1] + 3 * D65[2];
	const un = (4 * D65[0]) / wd;
	const vn = (9 * D65[1]) / wd;
	const up = luv[1] / (13 * L) + un;
	const vp = luv[2] / (13 * L) + vn;
	const Y = D65[1] * labFi((L + 16) / 116);
	if (vp === 0) return [0, Y, 0];
	const X = (Y * 9 * up) / (4 * vp);
	const Z = (Y * (12 - 3 * up - 20 * vp)) / (4 * vp);
	return [X, Y, Z];
}

export function evalLsrgbToOklab(lsrgb: Vec3): Vec3 {
	const l = map3(mulMat3Vec3(OK_M1, lsrgb), scbrt);
	return mulMat3Vec3(OK_M2, l);
}

export function evalOklabToLsrgb(oklab: Vec3): Vec3 {
	const l = map3(mulMat3Vec3(OK_M2i, oklab), (v) => v * v * v);
	return mulMat3Vec3(OK_M1i, l);
}

export function evalOklabToOklch(oklab: Vec3): Vec3 {
	const [l, a, b] = oklab;
	return [l, Math.hypot(a, b), ((Math.atan2(b, a) * DEG) % 360 + 360) % 360];
}

export function evalOklchToOklab(oklch: Vec3): Vec3 {
	const [l, c, h] = oklch;
	return [l, c * Math.cos(h / DEG), c * Math.sin(h / DEG)];
}

function bradfordAdaptationMatrix(srcWhite: Vec3, dstWhite: Vec3): Mat3 {
	const s = mulMat3Vec3(BRADFORD, srcWhite);
	const d = mulMat3Vec3(BRADFORD, dstWhite);
	const scale: Mat3 = [d[0] / s[0], 0, 0, 0, d[1] / s[1], 0, 0, 0, d[2] / s[2]];
	return mulMat3(BRADFORD_INV, mulMat3(scale, BRADFORD));
}

/** Bradford chromatic adaptation — XYZ under srcWhite → XYZ under dstWhite. */
export function evalChromaticAdapt(xyz: Vec3, srcWhite: Vec3, dstWhite: Vec3): Vec3 {
	return mulMat3Vec3(bradfordAdaptationMatrix(srcWhite, dstWhite), xyz);
}
