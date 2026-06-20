import { describe, expect, it } from 'vitest';
import { getWorldTransform } from './sceneTree.js';
import { IDENTITY_QUAT, quatFromAxisAngle } from './transform.js';
import type { PlanetScene, SceneNode, TransformInheritance } from './types.js';

const Y90 = quatFromAxisAngle([0, 1, 0], Math.PI / 2);

function group(id: string, parentId: string | null, extra: Partial<SceneNode> = {}): SceneNode {
	return {
		id,
		name: id,
		parentId,
		kind: 'group',
		enabled: true,
		transform: { position: [0, 0, 0], rotation: IDENTITY_QUAT },
		...extra
	} as SceneNode;
}

function scene(nodes: SceneNode[]): PlanetScene {
	return { rootId: nodes[0].id, nodes: new Map(nodes.map((n) => [n.id, n])) };
}

const INHERIT_ROT_WORLD: TransformInheritance = { position: 1, rotation: 99, scale: 1 };

describe('per-channel transform inheritance', () => {
	it('default (no inheritance) composes through the parent, unchanged', () => {
		// root → spinner(90° about Y) → child(offset +x)
		const s = scene([
			group('root', null),
			group('spinner', 'root', { transform: { position: [0, 0, 0], rotation: Y90 } }),
			group('child', 'spinner', { transform: { position: [10, 0, 0], rotation: IDENTITY_QUAT } })
		]);
		const w = getWorldTransform(s, 'child');
		// +x offset rotated 90° about Y → −z; rotation carries the parent's 90°.
		expect(w.position[0]).toBeCloseTo(0, 6);
		expect(w.position[2]).toBeCloseTo(-10, 6);
		expect(w.rotation[1]).toBeCloseTo(Y90[1], 6); // non-identity (inherits the spin)
	});

	it('rotation from world decouples a node from a spinning ancestor', () => {
		// Same tree, but child inherits rotation from world (degree clamps to root):
		// its offset is no longer spun, and its world rotation is inertial.
		const s = scene([
			group('root', null),
			group('spinner', 'root', { transform: { position: [0, 0, 0], rotation: Y90 } }),
			group('child', 'spinner', {
				transform: { position: [10, 0, 0], rotation: IDENTITY_QUAT },
				inheritance: INHERIT_ROT_WORLD
			})
		]);
		const w = getWorldTransform(s, 'child');
		expect(w.position[0]).toBeCloseTo(10, 6); // un-spun
		expect(w.position[2]).toBeCloseTo(0, 6);
		expect(w.rotation).toEqual(IDENTITY_QUAT); // inertial
	});

	it('position from a higher degree skips intermediate ancestors', () => {
		// root → a(+100x) → b(+1x). b takes its position from degree 2 (root), skipping a.
		const s = scene([
			group('root', null),
			group('a', 'root', { transform: { position: [100, 0, 0], rotation: IDENTITY_QUAT } }),
			group('b', 'a', {
				transform: { position: [1, 0, 0], rotation: IDENTITY_QUAT },
				inheritance: { position: 2, rotation: 1, scale: 1 }
			})
		]);
		// Skips a's +100 translation: 0 (root) + 1 = 1, not 101.
		expect(getWorldTransform(s, 'b').position[0]).toBeCloseTo(1, 6);
	});
});
