import { describe, expect, it } from 'vitest';
import { BIOME, BIOME_PROPS } from './biomes.js';
import { MATERIAL_DEBUG_MODE } from './biomes.js';

describe('biome material table', () => {
	it('water is smoothest dielectric with IOR', () => {
		const water = BIOME_PROPS[BIOME.water];
		const rock = BIOME_PROPS[BIOME.rock];
		expect(water.roughness).toBeLessThan(rock.roughness);
		expect(water.ior).toBeGreaterThan(1);
		expect(water.metallic).toBe(0);
	});

	it('all biomes are non-metallic in v1', () => {
		for (const props of Object.values(BIOME_PROPS)) {
			expect(props.metallic).toBe(0);
		}
	});
});

describe('material debug modes', () => {
	it('maps modes to stable gpu enums', () => {
		expect(MATERIAL_DEBUG_MODE.off).toBe(0);
		expect(MATERIAL_DEBUG_MODE.specular).toBe(4);
		expect(MATERIAL_DEBUG_MODE.ibl).toBe(5);
	});
});
