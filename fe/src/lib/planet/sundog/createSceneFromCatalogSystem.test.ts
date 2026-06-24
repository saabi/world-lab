import { describe, expect, it } from 'vitest';
import { getSystem } from './catalog.js';
import {
	createSceneFromCatalogSystem,
	SYSTEM_ROOT_ID,
	terrainToPreset
} from './createSceneFromCatalogSystem.js';
import { findOwnerBody, getWorldTransform, listBodies } from '../scene/sceneTree.js';
import { advanceScene } from '../scene/orbit.js';
import { evaluateScene } from '../scene/driver.js';
import { serializeScene, deserializeScene } from '../scene/sceneDocument.js';

const jondd = () => {
	const s = getSystem('jondd');
	if (!s) throw new Error('jondd missing from catalog');
	return s;
};

describe('terrainToPreset', () => {
	it('maps known SunDog terrains and falls back to normie', () => {
		expect(terrainToPreset('Desert')).toBe('desert');
		expect(terrainToPreset('Ice')).toBe('frozen');
		expect(terrainToPreset('Regolith')).toBe('craters');
		expect(terrainToPreset('Terran')).toBe('normie');
		expect(terrainToPreset(null)).toBe('normie');
		expect(terrainToPreset('Unknown')).toBe('normie');
	});
});

describe('createSceneFromCatalogSystem', () => {
	it('builds a scene with a central star and one body per catalog planet', () => {
		const system = jondd();
		const scene = createSceneFromCatalogSystem(system);
		expect(scene.rootId).toBe(SYSTEM_ROOT_ID);

		const bodies = listBodies(scene);
		const stars = bodies.filter((b) => b.bodyType === 'star');
		const planets = bodies.filter((b) => b.bodyType === 'planet');
		expect(stars).toHaveLength(1);
		expect(planets).toHaveLength(system.bodies.length);
		expect(stars[0]!.name).toBe(system.name);
		expect(stars[0]!.standIn).toBe(true);
	});

	it('parents each planet orbit on the star (ownership = the star)', () => {
		const system = jondd();
		const scene = createSceneFromCatalogSystem(system);
		const starId = `${system.id}-star`;
		for (const body of system.bodies) {
			const owner = findOwnerBody(scene, body.id);
			expect(owner?.id, body.id).toBe(starId);
		}
	});

	it('maps terrain to an appearance preset', () => {
		const scene = createSceneFromCatalogSystem(jondd());
		const homeworld = scene.nodes.get('jondd');
		expect(homeworld?.kind).toBe('body');
		if (homeworld?.kind === 'body') {
			expect(homeworld.appearance?.preset).toBe('normie'); // Jondd is Terran
		}
	});

	it('animates deterministically: same time → same world positions', () => {
		const scene = createSceneFromCatalogSystem(jondd());
		// Orbital motion lives in the world transform (the body's local transform
		// stays at origin; the phase→radius chain carries the offset).
		const worldPos = (t: number) => getWorldTransform(evaluateScene(scene, t), 'jondd').position;
		expect(worldPos(12.5)).toEqual(worldPos(12.5));
		// Motion actually occurs between distinct times.
		expect(worldPos(12.5)).not.toEqual(worldPos(40));
	});

	it('round-trips through scene serialization', () => {
		const scene = createSceneFromCatalogSystem(jondd());
		const restored = deserializeScene(serializeScene(scene));
		expect(restored).not.toBeNull();
		expect(restored!.rootId).toBe(SYSTEM_ROOT_ID);
		expect(restored!.nodes.size).toBe(scene.nodes.size);
	});

	it('advanceScene does not throw on the built scene', () => {
		const scene = createSceneFromCatalogSystem(jondd());
		expect(() => advanceScene(scene, 1)).not.toThrow();
	});
});
