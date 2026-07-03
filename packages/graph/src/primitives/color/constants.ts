/** Frozen D65 / sRGB / Oklab matrices (evaluated from colorlab pipeline.ts). */

export type Vec3 = readonly [number, number, number];
export type Mat3 = readonly [
	number,
	number,
	number,
	number,
	number,
	number,
	number,
	number,
	number
];

/** D65 white point XYZ (fixed observer). */
export const D65: Vec3 = [0.950_449_218_3, 1, 1.088_916_648_4];

/** Linear sRGB → XYZ (D65). */
export const SRGB2XYZ: Mat3 = [
	0.412_410_846_5, 0.357_584_567_9, 0.180_453_803_9, 0.212_649_342_7, 0.715_169_135_7,
	0.072_181_521_6, 0.019_331_758_4, 0.119_194_856, 0.950_390_034_1
];

/** XYZ (D65) → linear sRGB. */
export const XYZ2SRGB: Mat3 = [
	3.240_812_398_9, -1.537_308_445_6, -0.498_586_522_9, -0.969_243_017, 1.875_966_302_9,
	0.041_555_030_9, 0.055_638_398_4, -0.204_007_460_9, 1.057_129_570_3
];

/** Oklab M1 (linear sRGB → LMS, non-linear). */
export const OK_M1: Mat3 = [
	0.412_221_470_8, 0.536_332_536_3, 0.051_445_992_9, 0.211_903_498_2, 0.680_699_545_1,
	0.107_396_956_6, 0.088_302_461_9, 0.281_718_837_6, 0.629_978_700_5
];

/** Oklab M2 (non-linear LMS → Oklab). */
export const OK_M2: Mat3 = [
	0.210_454_255_3, 0.793_617_785, -0.004_072_046_8, 1.977_998_495_1, -2.428_592_205,
	0.450_593_709_9, 0.025_904_037_1, 0.782_771_766_2, -0.808_675_766
];

/** Inverse Oklab M2 (frozen; no runtime inversion). */
export const OK_M2i: Mat3 = [
	0.999_999_998_5, 0.396_337_792_2, 0.215_803_758_1, 1.000_000_008_9, -0.105_561_342_3,
	-0.063_854_174_8, 1.000_000_054_7, -0.089_484_182_1, -1.291_485_537_9
];

/** Inverse Oklab M1 (frozen; no runtime inversion). */
export const OK_M1i: Mat3 = [
	4.076_741_661_3, -3.307_711_590_4, 0.230_969_928_7, -1.268_438_004_1, 2.609_757_400_7,
	-0.341_319_396_3, -0.004_196_086_5, -0.703_418_614_5, 1.707_614_700_9
];

/** D50 white point XYZ (CIE 1931, 2°). */
export const D50: Vec3 = [0.964_211_994_421_199_4, 1, 0.825_188_284_518_828_8];

/** Bradford cone-response matrix (XYZ → sharpened LMS). */
export const BRADFORD: Mat3 = [
	0.895_1, 0.266_4, -0.161_4, -0.750_2, 1.713_5, 0.036_7, 0.038_9, -0.068_5, 1.029_6
];

/** Inverse Bradford matrix (frozen; no runtime inversion). */
export const BRADFORD_INV: Mat3 = [
	0.986_992_905_466_712_3, -0.147_054_256_420_990_13, 0.159_962_651_663_731_22,
	0.432_305_269_723_394_56, 0.518_360_271_536_777_6, 0.049_291_228_212_855_6,
	-0.008_528_664_575_177_328, 0.040_042_821_654_084_87, 0.968_486_695_787_550_1
];

export function mulMat3(a: Mat3, b: Mat3): Mat3 {
	return [
		a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
		a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
		a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
		a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
		a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
		a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
		a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
		a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
		a[6] * b[2] + a[7] * b[5] + a[8] * b[8]
	];
}

export function mulMat3Vec3(m: Mat3, v: Vec3): Vec3 {
	return [
		m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
		m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
		m[6] * v[0] + m[7] * v[1] + m[8] * v[2]
	];
}
