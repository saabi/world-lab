import { describe, expect, it } from 'vitest';
import {
	addChild,
	addOrbitingBody,
	descendantIds,
	makeBody,
	makeGroup,
	removeSubtree,
	reparent
} from './sceneEdit.js';
import { evaluateScene } from './driver.js';
import { getChildren, getWorldTransform, listBodies } from './sceneTree.js';
import { createToySolarSystemScene } from './solarSystem.js';
import type { PlanetScene, SceneNode } from './types.js';

function tiny(): PlanetScene {
	const g = (id: string, parentId: string | null): SceneNode => ({
		id,
		name: id,
		parentId,
		kind: 'group',
		enabled: true,
		transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1] }
	});
	return {
		rootId: 'root',
		nodes: new Map([g('root', null), g('a', 'root'), g('b', 'a'), g('c', 'b')].map((n) => [n.id, n]))
	};
}

describe('addChild', () => {
	it('adds a node; no-op on id collision', () => {
		const s = tiny();
		const node = makeGroup('a', 'New');
		const s2 = addChild(s, node);
		expect(s2.nodes.has(node.id)).toBe(true);
		expect(getChildren(s2, 'a').some((n) => n.id === node.id)).toBe(true);
		expect(addChild(s2, node)).toBe(s2); // collision → same ref
	});

	it('makeBody spawns body defaults from the schema', () => {
		const body = makeBody('a');
		expect(body.kind).toBe('body');
		expect(body.bodyType).toBe('planet');
		expect(body.radiusMeters).toBe(500_000);
	});
});

describe('addOrbitingBody', () => {
	it('builds an orbit node → body that actually orbits its center', () => {
		const { scene, bodyId } = addOrbitingBody(tiny(), 'a', {
			orbitRadiusMeters: 1000,
			periodSeconds: 4
		});
		const orbit = scene.nodes.get(`${bodyId}-orbit`)!;
		expect(orbit.parentId).toBe('a'); // orbit centered on 'a'
		expect(orbit.driver?.type).toBe('kepler');
		expect(orbit.driver?.periodSeconds).toBe(4);
		expect(scene.nodes.get(bodyId)!.kind).toBe('body');

		// 'a' is at the origin → body orbits a circle of the orbit radius about it.
		const p0 = getWorldTransform(evaluateScene(scene, 0), bodyId).position;
		expect(Math.hypot(p0[0], p0[2])).toBeCloseTo(1000, 6);
		const p1 = getWorldTransform(evaluateScene(scene, 1), bodyId).position; // quarter period
		expect(p1[0]).toBeCloseTo(0, 6);
		expect(p1[2]).toBeCloseTo(1000, 6);
	});
});

describe('removeSubtree', () => {
	it('removes a node and its descendants; never the root', () => {
		const s = removeSubtree(tiny(), 'b'); // removes b and c
		expect(s.nodes.has('b')).toBe(false);
		expect(s.nodes.has('c')).toBe(false);
		expect(s.nodes.has('a')).toBe(true);
		expect(removeSubtree(tiny(), 'root')).toEqual(tiny()); // root protected
	});

	it('prunes a planet system from the toy scene', () => {
		const scene = createToySolarSystemScene();
		const before = listBodies(scene).length;
		// Remove Ferro's system (orbit node → ferro + its moon).
		const pruned = removeSubtree(scene, 'ss-ferro-orbit');
		expect(pruned.nodes.has('ss-ferro')).toBe(false);
		expect(pruned.nodes.has('ss-luna-f')).toBe(false); // moon went with it
		expect(listBodies(pruned).length).toBe(before - 2);
	});
});

describe('reparent', () => {
	it('moves a node under a new parent', () => {
		const s = reparent(tiny(), 'c', 'root');
		expect(s.nodes.get('c')!.parentId).toBe('root');
	});

	it('is cycle-safe and protects the root', () => {
		const s = tiny();
		expect(reparent(s, 'a', 'c')).toBe(s); // c is a's descendant → cycle, no-op
		expect(reparent(s, 'a', 'a')).toBe(s); // self → no-op
		expect(reparent(s, 'root', 'a')).toBe(s); // root → no-op
		expect(descendantIds(s, 'a')).toEqual(new Set(['b', 'c']));
	});
});
