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

const ROT_FROM_WORLD: TransformInheritance = { position: '../', rotation: '/', scale: '../' };

describe('per-channel path inheritance', () => {
	it('default (no inheritance) composes through the parent, unchanged', () => {
		// root → spinner(90° about Y) → child(offset +x)
		const s = scene([
			group('root', null),
			group('spinner', 'root', { transform: { position: [0, 0, 0], rotation: Y90 } }),
			group('child', 'spinner', { transform: { position: [10, 0, 0], rotation: IDENTITY_QUAT } })
		]);
		const w = getWorldTransform(s, 'child');
		expect(w.position[0]).toBeCloseTo(0, 6);
		expect(w.position[2]).toBeCloseTo(-10, 6);
		expect(w.rotation[1]).toBeCloseTo(Y90[1], 6); // inherits the spin
	});

	it('rotation from world (/) decouples a node from a spinning ancestor', () => {
		const s = scene([
			group('root', null),
			group('spinner', 'root', { transform: { position: [0, 0, 0], rotation: Y90 } }),
			group('child', 'spinner', {
				transform: { position: [10, 0, 0], rotation: IDENTITY_QUAT },
				inheritance: ROT_FROM_WORLD
			})
		]);
		const w = getWorldTransform(s, 'child');
		expect(w.position[0]).toBeCloseTo(10, 6); // un-spun
		expect(w.position[2]).toBeCloseTo(0, 6);
		expect(w.rotation).toEqual(IDENTITY_QUAT); // inertial
	});

	it('position from a relative multi-level path (../../) skips intermediate ancestors', () => {
		const s = scene([
			group('root', null),
			group('a', 'root', { transform: { position: [100, 0, 0], rotation: IDENTITY_QUAT } }),
			group('b', 'a', {
				transform: { position: [1, 0, 0], rotation: IDENTITY_QUAT },
				inheritance: { position: '../../', rotation: '../', scale: '../' }
			})
		]);
		// ../../ from b = root: skips a's +100 translation → 1, not 101.
		expect(getWorldTransform(s, 'b').position[0]).toBeCloseTo(1, 6);
	});

	it('parent scale scales child offsets and propagates to world scale', () => {
		const s = scene([
			group('root', null),
			group('p', 'root', {
				transform: { position: [0, 0, 0], rotation: IDENTITY_QUAT, scale: [2, 2, 2] }
			}),
			group('c', 'p', { transform: { position: [5, 0, 0], rotation: IDENTITY_QUAT } })
		]);
		const w = getWorldTransform(s, 'c');
		expect(w.position[0]).toBeCloseTo(10, 6); // 5 scaled by the parent's ×2
		expect(w.scale).toEqual([2, 2, 2]);
	});

	it('breaks a reference cycle instead of hanging', () => {
		// a's position inherits from sibling b; b's from sibling a → a cycle.
		const s = scene([
			group('root', null),
			group('a', 'root', {
				transform: { position: [1, 0, 0], rotation: IDENTITY_QUAT },
				inheritance: { position: '../b', rotation: '../', scale: '../' }
			}),
			group('b', 'root', {
				transform: { position: [2, 0, 0], rotation: IDENTITY_QUAT },
				inheritance: { position: '../a', rotation: '../', scale: '../' }
			})
		]);
		const w = getWorldTransform(s, 'a'); // must terminate
		expect(Number.isFinite(w.position[0])).toBe(true);
	});
});
