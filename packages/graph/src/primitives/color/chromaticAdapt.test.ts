import { describe, expect, it } from 'vitest';

import { getPrimitive } from '../../registry.js';
import { D50, D65 } from './constants.js';
import { evalChromaticAdapt } from './evalColorlab.js';
import './chromaticAdapt.js';

/** sRGB red primary XYZ (D65). */
const SRGB_RED_XYZ: [number, number, number] = [
	0.412_410_846_5, 0.212_649_342_7, 0.019_331_758_4
];

/** NTSC 1953 illuminant C white (XYZ, Y = 1). */
const NTSC_WHITE: [number, number, number] = [
	0.980_721_664_484_213_5, 1, 1.182_253_809_803_959
];

describe('color.chromaticAdapt', () => {
	it('registers without colliding with slice-A colour-space primitives', () => {
		const primitive = getPrimitive('color.chromaticAdapt')!;
		expect(primitive.category).toBe('Colour');
		expect(primitive.metadata?.keywords).toEqual(['Effects', 'Colour']);
		expect(primitive.metadata?.role).toBeUndefined();
		expect(primitive.wgsl).toEqual({
			moduleId: 'color.chromaticAdapt',
			entry: 'chromaticAdapt'
		});
	});

	it('returns input unchanged when srcWhite equals dstWhite', () => {
		const adapted = evalChromaticAdapt(SRGB_RED_XYZ, D65, D65);
		for (let i = 0; i < 3; i += 1) {
			expect(adapted[i]).toBeCloseTo(SRGB_RED_XYZ[i], 10);
		}
	});

	it('adapts D65 red to D50 (colorlab parity)', () => {
		const expected: [number, number, number] = [
			0.436_039_984_595_136_65, 0.222_485_404_484_683_57, 0.013_928_799_128_366_004
		];
		const adapted = evalChromaticAdapt(SRGB_RED_XYZ, D65, D50);
		for (let i = 0; i < 3; i += 1) {
			expect(adapted[i]).toBeCloseTo(expected[i], 10);
		}
	});

	it('maps source white onto destination white (NTSC → D65)', () => {
		const adapted = evalChromaticAdapt(NTSC_WHITE, NTSC_WHITE, D65);
		for (let i = 0; i < 3; i += 1) {
			expect(adapted[i]).toBeCloseTo(D65[i], 10);
		}
	});

	it('evalCPU uses D65→D50 defaults when whites are omitted', () => {
		const primitive = getPrimitive('color.chromaticAdapt')!;
		const result = primitive.evalCPU!({
			inputs: { xyz: [...SRGB_RED_XYZ] },
			params: {}
		}).adapted as number[];
		const expected = evalChromaticAdapt(SRGB_RED_XYZ, D65, D50);
		for (let i = 0; i < 3; i += 1) {
			expect(result[i]).toBeCloseTo(expected[i], 10);
		}
	});
});
