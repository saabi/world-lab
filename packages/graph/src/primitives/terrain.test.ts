import { describe, expect, it } from 'vitest';

import { getPrimitive } from '../registry.js';
import './terrain/index.js';
import { evalHeightRemap } from './terrain/heightRemap.js';

const HARVESTED_IDS = [
	'terrain.domainWarp',
	'terrain.voronoi',
	'terrain.detailFbm',
	'terrain.heightRemap',
	'terrain.fineTextureNoise',
	'terrain.polarTerm',
	'terrain.biomeMaterial',
	'terrain.normalEstimator',
	'terrain.worldNormal',
	'terrain.selfShadow',
	'material.pbrLighting',
	'surface.cubeFaceDir'
] as const;

describe('planet-shader primitive harvest', () => {
	for (const id of HARVESTED_IDS) {
		it(`registers ${id}`, () => {
			expect(getPrimitive(id)).toBeDefined();
		});
	}

	it('terrain.heightRemap declares world_radius_meters output space', () => {
		const primitive = getPrimitive('terrain.heightRemap')!;
		expect(primitive.outputs[0]?.space).toBe('world_radius_meters');
	});

	it('terrain.domainWarp unit_dir input is body_dir', () => {
		const input = getPrimitive('terrain.domainWarp')!.inputs.find((p) => p.name === 'unit_dir');
		expect(input?.space).toBe('body_dir');
	});

	it('heightRemap evalCPU matches documented erosion remap', () => {
		const evalCPU = getPrimitive('terrain.heightRemap')!.evalCPU!;
		const params = {
			voronoi_amplitude: 0.1,
			detail_amplitude: 0.05,
			water_level: 0.5,
			erosion: 1,
			radius: 100
		};
		const direct = evalHeightRemap([1, 0.5, 0.5], 0.6, params);
		const viaPrimitive = evalCPU({
			inputs: { vor: [1, 0.5, 0.5], detail: 0.6 },
			params
		}).world_radius_meters as number;
		expect(viaPrimitive).toBeCloseTo(direct);
		expect(viaPrimitive).toBeGreaterThan(params.radius);
	});

	it('surface.cubeFaceDir evalCPU matches normalized cube-face mapping', () => {
		const evalCPU = getPrimitive('surface.cubeFaceDir')!.evalCPU!;
		const out = evalCPU({ inputs: { uv: [0.5, 0.5] }, params: { face: 0 } }).unit_dir as number[];
		const len = Math.hypot(out[0], out[1], out[2]);
		expect(len).toBeCloseTo(1, 5);
		expect(out[0]).toBeGreaterThan(0.99);
	});
});
