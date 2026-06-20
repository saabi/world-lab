import { describe, expect, it } from 'vitest';
import { resolveBodyParams, selectLod } from './bodyParams.js';
import { DEFAULT_PRESET, PLANET_PRESETS, type PlanetPresetName } from '../params/presets.js';
import type { BodyNode } from './types.js';

function body(extra: Partial<BodyNode> = {}): BodyNode {
	return {
		id: 'b',
		name: 'b',
		parentId: null,
		kind: 'body',
		enabled: true,
		transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
		bodyType: 'planet',
		radiusMeters: 5e5,
		standIn: false,
		...extra
	} as BodyNode;
}

describe('resolveBodyParams', () => {
	it('defaults to the default preset with no appearance', () => {
		expect(resolveBodyParams(body())).toEqual(PLANET_PRESETS[DEFAULT_PRESET]);
	});

	it('merges sparse overrides over the chosen preset', () => {
		const p = resolveBodyParams(
			body({ appearance: { preset: 'desert', overrides: { water_level: 0.123 } } })
		);
		expect(p.water_level).toBe(0.123); // overridden
		expect(p.voronoi_scale).toBe(PLANET_PRESETS.desert.voronoi_scale); // from the preset
	});

	it('falls back to the default preset for an unknown name', () => {
		const p = resolveBodyParams(body({ appearance: { preset: 'nope' as PlanetPresetName } }));
		expect(p).toEqual(PLANET_PRESETS[DEFAULT_PRESET]);
	});
});

describe('selectLod', () => {
	it('picks dot / sphere / procedural by projected size (defaults)', () => {
		const b = body();
		expect(selectLod(b, 0.5)).toBe('dot');
		expect(selectLod(b, 50)).toBe('sphere');
		expect(selectLod(b, 500)).toBe('procedural');
	});

	it('honours per-body thresholds', () => {
		const b = body({ lod: { sphereAbovePx: 10, proceduralAbovePx: 100 } });
		expect(selectLod(b, 5)).toBe('dot');
		expect(selectLod(b, 50)).toBe('sphere');
		expect(selectLod(b, 150)).toBe('procedural');
	});
});
