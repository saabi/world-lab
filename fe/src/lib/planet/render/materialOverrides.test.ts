import { describe, expect, it } from 'vitest';
import { DEFAULT_MATERIAL_OVERRIDES } from '../material/biomes.js';
import { writeMaterialOverrides } from './materialOverrides.js';

describe('writeMaterialOverrides', () => {
	it('packs exposure and debug mode into uniform buffer', () => {
		const buf = new ArrayBuffer(16);
		writeMaterialOverrides(buf, {
			...DEFAULT_MATERIAL_OVERRIDES,
			exposure: 1.5,
			materialDebug: 'specular'
		});
		const view = new DataView(buf);
		expect(view.getFloat32(0, true)).toBeCloseTo(1.5);
		expect(view.getFloat32(12, true)).toBe(4);
	});
});
