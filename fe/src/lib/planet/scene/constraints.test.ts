import { describe, expect, it } from 'vitest';
import { applyConstraints } from './constraints.js';
import { evaluateScene } from './driver.js';
import { eulerToQuat, quatToEuler } from './transform.js';
import type { PlanetScene, SceneNode } from './types.js';

const DEG = Math.PI / 180;

function node(extra: Partial<SceneNode> = {}): SceneNode {
	return {
		id: 'n',
		name: 'n',
		parentId: null,
		kind: 'group',
		enabled: true,
		transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
		...extra
	} as SceneNode;
}

describe('limit_rotation constraint', () => {
	it('clamps an enabled axis and leaves disabled axes free', () => {
		// Away from the y=±90° euler singularity (ZYX gimbal lock).
		const n = node({
			transform: { position: [0, 0, 0], rotation: eulerToQuat(0, 60 * DEG, 30 * DEG) },
			constraints: [
				{
					type: 'limit_rotation',
					y: { enabled: true, min: 0, max: 45 * DEG },
					z: { enabled: false, min: 0, max: 0 }
				}
			]
		});
		const e = quatToEuler(applyConstraints(n).transform.rotation);
		expect(e[1]).toBeCloseTo(45 * DEG, 6); // clamped to the 45° max
		expect(e[2]).toBeCloseTo(30 * DEG, 6); // z disabled → untouched
	});

	it('no-ops a node without constraints', () => {
		const n = node();
		expect(applyConstraints(n)).toBe(n);
	});

	it('runs in evaluateScene after driven fields', () => {
		const scene: PlanetScene = {
			rootId: 'root',
			nodes: new Map([
				['root', node({ id: 'root', name: 'root' })],
				[
					'spin',
					node({
						id: 'spin',
						name: 'spin',
						parentId: 'root',
						transform: { position: [0, 0, 0], rotation: eulerToQuat(0, 80 * DEG, 0) },
						constraints: [{ type: 'limit_rotation', y: { enabled: true, min: 0, max: 20 * DEG } }]
					})
				]
			])
		};
		const out = evaluateScene(scene, 0).nodes.get('spin')!;
		expect(quatToEuler(out.transform.rotation)[1]).toBeCloseTo(20 * DEG, 6);
	});
});
