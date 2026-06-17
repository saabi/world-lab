import { describe, expect, it } from 'vitest';
import { collectSceneLights } from './collectLights.js';
import { createDefaultPlanetScene } from './defaults.js';
import { packSceneLighting } from './packLighting.js';
import { getWorldTransform } from './sceneTree.js';
import { worldPositiveX } from './transform.js';
import { writeLightingUniforms, type LightingUniforms } from '../render/uniformLayouts.js';

describe('collectSceneLights', () => {
	it('default scene has two directional lights', () => {
		const scene = createDefaultPlanetScene();
		const collected = collectSceneLights(scene);
		expect(collected.lights).toHaveLength(2);
		expect(collected.lights.every((l) => l.kind === 'directional')).toBe(true);
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

	it('fill light is rotated away from sun', () => {
		const scene = createDefaultPlanetScene();
		const collected = collectSceneLights(scene);
		const sun = collected.lights.find((l) => l.directionOrPosition[0] > 0.9);
		const fill = collected.lights.find((l) => l.directionOrPosition[0] < 0);
		expect(sun).toBeDefined();
		expect(fill).toBeDefined();
	});
});

describe('packSceneLighting', () => {
	it('round-trips into lighting uniform buffer', () => {
		const scene = createDefaultPlanetScene();
		const packed = packSceneLighting(collectSceneLights(scene));
		expect(packed.lightCount).toBe(2);

		const buf = new ArrayBuffer(256);
		writeLightingUniforms(buf, packed);
		const view = new DataView(buf);
		expect(view.getUint32(16, true)).toBe(2);
		expect(view.getFloat32(32 + 0, true)).toBeCloseTo(1, 3);
	});

	it('packs directional w component as zero', () => {
		const uniforms: LightingUniforms = packSceneLighting(collectSceneLights(createDefaultPlanetScene()));
		expect(uniforms.lights[0].positionOrDir[3]).toBe(0);
	});
});
