import { describe, expect, it } from 'vitest';
import { buildDrawList } from './drawList.js';
import { viewProjection } from './orbitCamera.js';
import { DEFAULT_LOD_THRESHOLDS, type LodLevel } from '../scene/bodyParams.js';
import type { PlanetScene, SceneNode } from '../scene/types.js';

function sceneOneBody(radiusMeters: number): PlanetScene {
	const node = (extra: Partial<SceneNode>): SceneNode =>
		({
			id: 'x',
			name: 'x',
			parentId: null,
			kind: 'group',
			enabled: true,
			transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
			...extra
		}) as SceneNode;
	return {
		rootId: 'root',
		nodes: new Map([
			['root', node({ id: 'root', name: 'root' })],
			[
				'b',
				node({ id: 'b', name: 'b', parentId: 'root', kind: 'body', bodyType: 'planet', radiusMeters, standIn: false })
			]
		])
	};
}

const cam = (distance: number) => ({ azimuth: 0, elevation: 0, distance, target: [0, 0, 0] as [number, number, number] });

describe('buildDrawList', () => {
	it('projects a body and picks procedural LOD when it fills the screen', () => {
		const scene = sceneOneBody(1e6);
		const items = buildDrawList(scene, viewProjection(cam(3e6), 1.5), 1200, 800, new Map<string, LodLevel>(), DEFAULT_LOD_THRESHOLDS);
		expect(items).toHaveLength(1);
		expect(items[0].id).toBe('b');
		expect(items[0].screen).not.toBeNull();
		expect(items[0].screenRadiusPx).toBeGreaterThan(120);
		expect(items[0].lod).toBe('procedural');
		expect(items[0].blend).toBe(1);
	});

	it('falls to a dot when far away', () => {
		const scene = sceneOneBody(1e6);
		const items = buildDrawList(scene, viewProjection(cam(2e9), 1.5), 1200, 800, new Map<string, LodLevel>(), DEFAULT_LOD_THRESHOLDS);
		expect(items[0].screenRadiusPx).toBeLessThan(1);
		expect(items[0].lod).toBe('dot');
		expect(items[0].blend).toBe(0);
	});
});
