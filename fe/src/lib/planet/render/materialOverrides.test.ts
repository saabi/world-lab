import { describe, expect, it } from 'vitest';
import { DEFAULT_MATERIAL_OVERRIDES } from '../material/biomes.js';
import { writeMaterialOverrides } from './materialOverrides.js';

describe('writeMaterialOverrides', () => {
	it('packs exposure, debug mode, and fog density into uniform buffer', () => {
		const buf = new ArrayBuffer(32);
		writeMaterialOverrides(buf, {
			...DEFAULT_MATERIAL_OVERRIDES,
			exposure: 1.5,
			materialDebug: 'specular',
			fogDensity: 0.4
		});
		const view = new DataView(buf);
		expect(view.getFloat32(0, true)).toBeCloseTo(1.5);
		expect(view.getFloat32(12, true)).toBe(4);
		expect(view.getFloat32(16, true)).toBeCloseTo(0.4);
	});
});
