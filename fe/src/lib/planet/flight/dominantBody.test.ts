import { describe, expect, it } from 'vitest';
import { createToySolarSystemScene } from '../scene/solarSystem.js';
import { evaluateScene } from '../scene/driver.js';
import { pickDominantBody, nearestBody } from './dominantBody.js';

describe('dominantBody', () => {
	it('picks nearest body when no target', () => {
		const scene = evaluateScene(createToySolarSystemScene(), 0);
		const body = nearestBody(scene, [1.5e11, 0, 0]);
		expect(body).not.toBeNull();
		expect(body!.bodyId).toBeTruthy();
	});

	it('uses target body when set', () => {
		const scene = evaluateScene(createToySolarSystemScene(), 0);
		const nearest = nearestBody(scene, [1.5e11, 0, 0]);
		expect(nearest).not.toBeNull();
		const picked = pickDominantBody(scene, [1.5e11, 0, 0], nearest!.bodyId);
		expect(picked?.bodyId).toBe(nearest!.bodyId);
	});
});
