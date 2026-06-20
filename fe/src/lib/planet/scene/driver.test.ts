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
					bindings: [{ field: 'rotationY', ref: '/driver', output: 'phase' }]
				}),
				node('translate', 'rotate', {
					bindings: [{ field: 'positionX', ref: '/driver', output: 'radius' }]
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
