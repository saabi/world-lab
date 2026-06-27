import { describe, expect, it } from 'vitest';

import {
	evaluateVegetationCoverage,
	generateVegetationCandidates,
	type VegetationCandidateConfig,
	type VegetationFieldSamplers,
	type VegetationPatch,
} from './vegetation.js';

const PATCH: VegetationPatch = {
	id: 'patch',
	origin: [0, 0, 0],
	tangentX: [1, 0, 0],
	tangentY: [0, 1, 0],
	widthMeters: 3,
	heightMeters: 3,
};

const CONFIG: VegetationCandidateConfig = {
	spacingMeters: 1,
	channel: 0,
	placementThreshold: 0.5,
	densityThreshold: 0.5,
	minProminence: 0.1,
};

function twoPeakSamplers(): VegetationFieldSamplers {
	return {
		density: () => [0.8, 0.2, 0.1],
		placement: ([x, y]) => {
			if (x === 0.5 && y === 0.5) return 1;
			if (x === 2.5 && y === 1.5) return 0.9;
			return 0;
		},
	};
}

describe('@virtual-planet/runtime-cpu vegetation', () => {
	it('is deterministic and emits known peaks in stable grid order', () => {
		const first = generateVegetationCandidates(PATCH, CONFIG, twoPeakSamplers());
		const second = generateVegetationCandidates(PATCH, CONFIG, twoPeakSamplers());
		expect(JSON.stringify(second)).toBe(JSON.stringify(first));
		expect(first.map((candidate) => candidate.id)).toEqual(['patch:0:0:0', 'patch:2:1:0']);
		expect(first.map((candidate) => candidate.position)).toEqual([
			[0.5, 0.5, 0],
			[2.5, 1.5, 0],
		]);
	});

	it('does not turn a broad plateau into instances', () => {
		const candidates = generateVegetationCandidates(PATCH, CONFIG, {
			density: () => [1, 0, 0],
			placement: () => 1,
		});
		expect(candidates).toEqual([]);
	});

	it('applies prominence, placement, ecology, altitude, and slope filters independently', () => {
		const patch = { ...PATCH, widthMeters: 1, heightMeters: 1 };
		const peak = ([x, y]: readonly number[]) => (x === 0.5 && y === 0.5 ? 0.8 : 0);
		const base: VegetationFieldSamplers = {
			density: () => [0.8, 0, 0],
			placement: peak,
			terrain: () => ({ altitudeMeters: 100, slope: 0.2 }),
		};

		expect(
			generateVegetationCandidates(patch, { ...CONFIG, minProminence: 0.9 }, base),
		).toEqual([]);
		expect(
			generateVegetationCandidates(patch, { ...CONFIG, placementThreshold: 0.9 }, base),
		).toEqual([]);
		expect(
			generateVegetationCandidates(patch, { ...CONFIG, densityThreshold: 0.9 }, base),
		).toEqual([]);
		expect(
			generateVegetationCandidates(
				patch,
				{ ...CONFIG, minAltitudeMeters: 101 },
				base,
			),
		).toEqual([]);
		expect(
			generateVegetationCandidates(patch, { ...CONFIG, maxSlope: 0.1 }, base),
		).toEqual([]);
	});

	it('samples neighbors beyond patch bounds but emits only owned centers', () => {
		const sampled: number[][] = [];
		const candidates = generateVegetationCandidates(
			{ ...PATCH, widthMeters: 1, heightMeters: 1 },
			CONFIG,
			{
				density: () => [1, 0, 0],
				placement: (position) => {
					sampled.push([...position]);
					return position[0] === 0.5 && position[1] === 0.5 ? 1 : 0;
				},
			},
		);
		expect(candidates).toHaveLength(1);
		expect(sampled.some(([x]) => x === -0.5)).toBe(true);
		expect(sampled.some(([x]) => x === 1.5)).toBe(true);
		expect(candidates[0]!.localMeters).toEqual([0.5, 0.5]);
	});

	it('uses world origins without changing metric spacing', () => {
		const samplers: VegetationFieldSamplers = {
			density: () => [1, 0, 0],
			placement: ([x, y]) =>
				(Math.abs((x - 0.5) % 10) < 1e-9 && Math.abs((y - 0.5) % 10) < 1e-9) ? 1 : 0,
		};
		const local = generateVegetationCandidates(
			{ ...PATCH, widthMeters: 1, heightMeters: 1 },
			CONFIG,
			samplers,
		);
		const shifted = generateVegetationCandidates(
			{ ...PATCH, origin: [10, 20, 30], widthMeters: 1, heightMeters: 1 },
			CONFIG,
			{
				density: () => [1, 0, 0],
				placement: ([x, y]) => (x === 10.5 && y === 20.5 ? 1 : 0),
			},
		);
		expect(local[0]!.localMeters).toEqual(shifted[0]!.localMeters);
		expect(shifted[0]!.position).toEqual([10.5, 20.5, 30]);
	});

	it('rejects invalid patch and configuration geometry', () => {
		expect(() =>
			generateVegetationCandidates({ ...PATCH, tangentX: [2, 0, 0] }, CONFIG, twoPeakSamplers()),
		).toThrow(RangeError);
		expect(() =>
			generateVegetationCandidates(PATCH, { ...CONFIG, spacingMeters: 0 }, twoPeakSamplers()),
		).toThrow(RangeError);
		expect(() =>
			generateVegetationCandidates(
				PATCH,
				{ ...CONFIG, minAltitudeMeters: 2, maxAltitudeMeters: 1 },
				twoPeakSamplers(),
			),
		).toThrow(RangeError);
	});

	it('evaluates continuous coverage independently from candidates', () => {
		const config = { channel: 1 as const, densityStart: 0.25, densityFull: 0.75 };
		expect(evaluateVegetationCoverage([0, 0.2, 0], 1, config)).toBe(0);
		expect(evaluateVegetationCoverage([0, 0.75, 0], 1, config)).toBe(1);
		expect(evaluateVegetationCoverage([0, 1, 0], 0.4, config)).toBeCloseTo(0.4);
		expect(() =>
			evaluateVegetationCoverage(
				[0, 0.5, 0],
				1,
				{ channel: 1, densityStart: 0.8, densityFull: 0.2 },
			),
		).toThrow(RangeError);
	});
});
