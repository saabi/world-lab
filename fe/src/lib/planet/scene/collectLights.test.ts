import { describe, expect, it } from 'vitest';
import { collectSceneLights } from './collectLights.js';
import { createDefaultPlanetScene } from './defaults.js';
import { packSceneLighting } from './packLighting.js';
import { getWorldTransform } from './sceneTree.js';
import { worldPositiveX } from './transform.js';
import { writeLightingUniforms, type LightingUniforms } from '../render/uniformLayouts.js';

describe('collectSceneLights', () => {
	it('default scene has a single sun directional light', () => {
		const scene = createDefaultPlanetScene();
		const collected = collectSceneLights(scene);
		expect(collected.lights).toHaveLength(1);
		expect(collected.lights[0].kind).toBe('directional');
		expect(collected.ambient[0]).toBeGreaterThan(0);
	});

	it('sun points toward +X in world space', () => {
		const scene = createDefaultPlanetScene();
		const sunWorld = getWorldTransform(scene, 'sun');
		const axis = worldPositiveX(sunWorld);
		expect(axis[0]).toBeCloseTo(1, 4);
		expect(axis[1]).toBeCloseTo(0, 4);
		expect(axis[2]).toBeCloseTo(0, 4);
	});
});

describe('packSceneLighting', () => {
	it('round-trips into lighting uniform buffer', () => {
		const scene = createDefaultPlanetScene();
		const packed = packSceneLighting(collectSceneLights(scene));
		expect(packed.lightCount).toBe(1);

		const buf = new ArrayBuffer(256);
		writeLightingUniforms(buf, packed);
		const view = new DataView(buf);
		expect(view.getUint32(16, true)).toBe(1);
		expect(view.getFloat32(32 + 0, true)).toBeCloseTo(1, 3);
	});

	it('packs directional w component as zero', () => {
		const uniforms: LightingUniforms = packSceneLighting(collectSceneLights(createDefaultPlanetScene()));
		expect(uniforms.lights[0].positionOrDir[3]).toBe(0);
	});
});
