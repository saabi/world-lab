import { describe, expect, it } from 'vitest';
import { createToySolarSystemScene } from './solarSystem.js';
import { findOwnerBody, listBodies, setNodeEnabled } from './sceneTree.js';
import { collectLightsForBody, collectSceneLights } from './collectLights.js';
import type { BodyNode } from './types.js';

describe('toy solar system preset', () => {
	const scene = createToySolarSystemScene();
	const bodies = listBodies(scene);
	const byId = (id: string) => scene.nodes.get(id) as BodyNode;

	it('has a star, rocky planets, a gas-giant stand-in, and moons', () => {
		const count = (t: BodyNode['bodyType']) => bodies.filter((b) => b.bodyType === t).length;
		expect(count('star')).toBe(1);
		expect(count('planet')).toBe(3);
		expect(count('gas_giant')).toBe(1);
		expect(count('moon')).toBe(4);
	});

	it('sizes rocky planets at 400-600 km and flags only stand-ins', () => {
		for (const b of bodies.filter((b) => b.bodyType === 'planet')) {
			expect(b.radiusMeters).toBeGreaterThanOrEqual(400_000);
			expect(b.radiusMeters).toBeLessThanOrEqual(600_000);
			expect(b.standIn).toBe(false);
		}
		expect(byId('ss-sol').standIn).toBe(true); // no star designer yet
		expect(byId('ss-tempest').standIn).toBe(true); // no gas-giant designer yet
	});

	it('encodes orbit ownership in the hierarchy (nearest ancestor body)', () => {
		expect(findOwnerBody(scene, 'ss-luna-f')?.id).toBe('ss-ferro'); // moon → its planet
		expect(findOwnerBody(scene, 'ss-ferro')?.id).toBe('ss-sol'); // planet → its star
		expect(findOwnerBody(scene, 'ss-gale')?.id).toBe('ss-tempest');
		expect(findOwnerBody(scene, 'ss-sol')).toBeNull(); // star has no ancestor body
	});
});

describe('selective illumination (collectLightsForBody)', () => {
	it('gives every body the global starlight + ambient, and no disabled reflections', () => {
		const scene = createToySolarSystemScene();
		for (const id of ['ss-ferro', 'ss-cerule', 'ss-ochre']) {
			const lit = collectLightsForBody(scene, id);
			expect(lit.lights.length).toBe(1); // global starlight only (reflections disabled)
			expect(lit.lights[0].kind).toBe('directional');
			expect(lit.ambient[0]).toBeGreaterThan(0);
		}
	});

	it('scopes a moon reflection to its owning planet only', () => {
		// Enable Ferro's moon reflection.
		const scene = setNodeEnabled(createToySolarSystemScene(), 'ss-luna-f-reflect', true);

		// Ferro (the owner) sees starlight + the reflection.
		expect(collectLightsForBody(scene, 'ss-ferro').lights.length).toBe(2);
		// Cerule, which does not own Luna-F's orbit, never pays for it.
		expect(collectLightsForBody(scene, 'ss-cerule').lights.length).toBe(1);
		expect(collectLightsForBody(scene, 'ss-ochre').lights.length).toBe(1);
	});

	it('flat collectSceneLights ignores scoping (global lights behave identically)', () => {
		const scene = createToySolarSystemScene();
		// Only the global starlight is enabled; the flat collector yields exactly it.
		expect(collectSceneLights(scene).lights.length).toBe(1);
	});
});
