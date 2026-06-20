import { describe, expect, it } from 'vitest';
import { evaluateDriver, evaluateScene } from './driver.js';
import { orbitLocalPosition } from './orbit.js';
import { getWorldTransform } from './sceneTree.js';
import type { OrbitElements, PlanetScene, SceneNode } from './types.js';

const elements: OrbitElements = {
	semiMajorAxis: 1000,
	eccentricity: 0.4,
	periodSeconds: 100,
	phaseAtEpoch: 0,
	periapsisAngle: 0
};

function node(id: string, parentId: string | null, extra: Partial<SceneNode> = {}): SceneNode {
	return {
		id,
		name: id,
		parentId,
		kind: 'group',
		enabled: true,
		transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
		...extra
	} as SceneNode;
}

// An orbit wired from composable nodes: a kepler driver + a rotate node (rotationY ←
// phase) + a translate node (positionX ← radius) + the body. No baked orbit primitive.
function wiredOrbit(): PlanetScene {
	return {
		rootId: 'root',
		nodes: new Map(
			[
				node('root', null),
				node('driver', 'root', { driver: { type: 'kepler', ...elements } }),
				node('rotate', 'root', {
					bindings: [{ field: 'rotationY', source: { ref: '/driver', output: 'phase' } }]
				}),
				node('translate', 'rotate', {
					bindings: [{ field: 'positionX', source: { ref: '/driver', output: 'radius' } }]
				}),
				node('body', 'translate')
			].map((n) => [n.id, n])
		)
	};
}

describe('kepler driver', () => {
	it('outputs phase + radius; at t=0 the body is at periapsis', () => {
		const out = evaluateDriver({ type: 'kepler', ...elements }, 0);
		expect(out.radius).toBeCloseTo(600, 6); // a(1−e) = 1000·0.6
		expect(out.phase).toBeCloseTo(0, 6); // periapsis along +x
	});
});

describe('driven orbit via wiring', () => {
	it('reconstructs the Kepler ellipse from composable nodes + a driver', () => {
		const scene = wiredOrbit();
		for (const t of [0, 25, 50, 73]) {
			const got = getWorldTransform(evaluateScene(scene, t), 'body').position;
			const want = orbitLocalPosition(elements, t);
			expect(got[0]).toBeCloseTo(want[0], 6);
			expect(got[1]).toBeCloseTo(want[1], 6);
			expect(got[2]).toBeCloseTo(want[2], 6);
		}
	});

	it('places the focus at the center (periapsis distance a(1−e))', () => {
		const p0 = getWorldTransform(evaluateScene(wiredOrbit(), 0), 'body').position;
		expect(Math.hypot(p0[0], p0[2])).toBeCloseTo(600, 4);
	});
});

describe('composable field terms (fold)', () => {
	it('folds set/mul/add over driver outputs + constants', () => {
		// positionX = radius·2 + 100; at t=0 radius = a(1−e) = 600 → 1300.
		const scene: PlanetScene = {
			rootId: 'root',
			nodes: new Map(
				[
					node('root', null),
					node('driver', 'root', { driver: { type: 'kepler', ...elements } }),
					node('n', 'root', {
						bindings: [
							{ field: 'positionX', op: 'set', source: { ref: '/driver', output: 'radius' } },
							{ field: 'positionX', op: 'mul', source: { const: 2 } },
							{ field: 'positionX', op: 'add', source: { const: 100 } }
						]
					})
				].map((n) => [n.id, n])
			)
		};
		const x = evaluateScene(scene, 0).nodes.get('n')!.transform.position[0];
		expect(x).toBeCloseTo(1300, 6);
	});

	it('add terms seed from the stored literal (no set term)', () => {
		// positionY literal 5, + add const 3 → 8.
		const scene: PlanetScene = {
			rootId: 'root',
			nodes: new Map(
				[
					node('root', null),
					node('n', 'root', {
						transform: { position: [0, 5, 0], rotation: [0, 0, 0, 1] },
						bindings: [{ field: 'positionY', op: 'add', source: { const: 3 } }]
					})
				].map((n) => [n.id, n])
			)
		};
		expect(evaluateScene(scene, 0).nodes.get('n')!.transform.position[1]).toBeCloseTo(8, 6);
	});
});
