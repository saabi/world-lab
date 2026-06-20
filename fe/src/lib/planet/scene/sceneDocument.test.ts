import { describe, expect, it } from 'vitest';
import { deserializeScene, serializeScene } from './sceneDocument.js';
import { createToySolarSystemScene } from './solarSystem.js';
import { getWorldTransform, listBodies } from './sceneTree.js';

describe('scene (de)serialization', () => {
	it('round-trips the toy solar system', () => {
		const scene = createToySolarSystemScene();
		const restored = deserializeScene(serializeScene(scene));
		expect(restored).not.toBeNull();

		// Same nodes, and a body's world position is preserved (drivers + transforms survived).
		expect(restored!.nodes.size).toBe(scene.nodes.size);
		expect(listBodies(restored!).length).toBe(listBodies(scene).length);
		const a = getWorldTransform(scene, 'ss-ferro').position;
		const b = getWorldTransform(restored!, 'ss-ferro').position;
		expect(b).toEqual(a);
	});

	it('preserves an edit through the round-trip', () => {
		const scene = createToySolarSystemScene();
		const light = scene.nodes.get('ss-starlight')!;
		const edited = {
			rootId: scene.rootId,
			nodes: new Map(scene.nodes).set('ss-starlight', { ...light, intensity: 9 } as typeof light)
		};
		const restored = deserializeScene(serializeScene(edited))!;
		expect((restored.nodes.get('ss-starlight') as { intensity: number }).intensity).toBe(9);
	});

	it('rejects a stale (older-version) document so the caller reloads the preset', () => {
		const doc = JSON.parse(serializeScene(createToySolarSystemScene()));
		doc.version = 1; // predates driver-based orbits
		expect(deserializeScene(JSON.stringify(doc))).toBeNull();
	});

	it('returns null for malformed input', () => {
		expect(deserializeScene('{not json')).toBeNull();
		expect(deserializeScene('{}')).toBeNull(); // no rootId/nodes
		expect(deserializeScene(JSON.stringify({ rootId: 'x', nodes: [] }))).toBeNull(); // root missing
		expect(
			deserializeScene(JSON.stringify({ rootId: 'a', nodes: [{ id: 'a' }] }))
		).toBeNull(); // node missing fields
	});
});
