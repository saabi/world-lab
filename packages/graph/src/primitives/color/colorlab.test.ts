import { describe, expect, it } from 'vitest';

import { getPrimitive, listPrimitives } from '../../registry.js';
import { COLORLAB_CPU_PARITY } from './parityFixtures.js';
import {
	evalLsrgbToOklab,
	evalOklabToLsrgb,
	evalSrgbToXyz,
	evalXyzToSrgb
} from './evalColorlab.js';
import './index.js';

const COLORLAB_IDS = [
	'color.srgbTransfer',
	'color.srgbTransferInv',
	'color.srgbToXyz',
	'color.xyzToSrgb',
	'color.xyzToLab',
	'color.labToXyz',
	'color.xyzToLuv',
	'color.luvToXyz',
	'color.lsrgbToOklab',
	'color.oklabToLsrgb',
	'color.oklabToOklch',
	'color.oklchToOklab'
] as const;

describe('colorlab harvest primitives', () => {
	it('registers all slice-A ids without colliding with existing colour ops', () => {
		const ids = listPrimitives().map((primitive) => primitive.id);
		for (const id of COLORLAB_IDS) {
			expect(ids).toContain(id);
		}
		expect(ids).toContain('color.srgbToLinear');
		expect(ids).toContain('color.linearToSrgb');
		expect(ids).toContain('color.hsv2rgb');
	});

	it('tags every harvest primitive with colorSpace role metadata', () => {
		for (const id of COLORLAB_IDS) {
			const primitive = getPrimitive(id)!;
			expect(primitive.category).toBe('Colour');
			expect(primitive.metadata?.role).toBe('colorSpace');
			expect(primitive.metadata?.keywords).toEqual(['Effects', 'Colour']);
		}
	});

	it('matches independent CPU parity fixtures exactly', () => {
		for (const fixture of COLORLAB_CPU_PARITY) {
			const primitive = getPrimitive(fixture.id)!;
			const result = primitive.evalCPU!({
				inputs: { [fixture.inputKey]: [...fixture.input] },
				params: {}
			});
			const actual = result[fixture.outputKey] as number[];
			for (let i = 0; i < 3; i += 1) {
				expect(actual[i]).toBe(fixture.output[i]);
			}
		}
	});

	it('mid-grey round-trips srgb→oklab→srgb via evalCPU', () => {
		const srgb: [number, number, number] = [0.5, 0.5, 0.5];
		const xyz = getPrimitive('color.srgbToXyz')!.evalCPU!({
			inputs: { srgb },
			params: {}
		}).xyz as number[];
		const roundTrip = getPrimitive('color.xyzToSrgb')!.evalCPU!({
			inputs: { xyz },
			params: {}
		}).srgb as number[];
		for (let i = 0; i < 3; i += 1) {
			expect(roundTrip[i]).toBeCloseTo(srgb[i], 10);
		}

		const linear = getPrimitive('color.srgbTransferInv')!.evalCPU!({
			inputs: { encoded: srgb },
			params: {}
		}).linear as number[];
		const oklab = getPrimitive('color.lsrgbToOklab')!.evalCPU!({
			inputs: { lsrgb: linear as [number, number, number] },
			params: {}
		}).oklab as number[];
		const back = getPrimitive('color.oklabToLsrgb')!.evalCPU!({
			inputs: { oklab },
			params: {}
		}).lsrgb as number[];
		for (let i = 0; i < 3; i += 1) {
			expect(back[i]).toBeCloseTo(linear[i], 9);
		}
	});

	it('preserves signed cube root for out-of-gamut Oklab channels', () => {
		const oklab = evalLsrgbToOklab([0.5, -0.3, 0.2]);
		expect(oklab[0]).toBeLessThan(0);
		const roundTrip = evalOklabToLsrgb(oklab);
		expect(roundTrip[0]).toBeCloseTo(0.5, 9);
		expect(roundTrip[1]).toBeCloseTo(-0.3, 9);
		expect(roundTrip[2]).toBeCloseTo(0.2, 9);
	});

	it('encoded sRGB white maps to D65 XYZ', () => {
		const xyz = evalSrgbToXyz([1, 1, 1]);
		expect(xyz[0]).toBe(0.950_449_218_3);
		expect(xyz[1]).toBe(1);
		expect(xyz[2]).toBe(1.088_916_648_5);
		expect(evalXyzToSrgb(xyz)[0]).toBeCloseTo(1, 10);
	});
});
