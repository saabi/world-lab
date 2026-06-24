import { describe, expect, it } from 'vitest';
import { makeOrbitingBody, makeGroup, addChild } from './sceneEdit.js';
import { createToySolarSystemScene } from './solarSystem.js';
import {
	isAncestorOrSelf,
	orbitPathSystemView,
	resolveAtmosphereVisible,
	resolveOrbitPathVisible
} from './renderFeatures.js';
import { createDefaultViewportPrefs } from './viewportPrefs.js';
import type { BodyNode, PlanetScene, SceneNode } from './types.js';

function sceneWithRoot(): PlanetScene {
	const root = makeGroup('root', 'root');
	root.parentId = null;
	return { rootId: 'root', nodes: new Map([[root.id, root]]) };
}

describe('resolveAtmosphereVisible', () => {
	const prefs = createDefaultViewportPrefs();

	it('requires global showAtmospheres and body enabled', () => {
		const body = { kind: 'body', atmosphere: { enabled: true } } as BodyNode;
		expect(resolveAtmosphereVisible(body, prefs)).toBe(true);
		expect(
			resolveAtmosphereVisible(body, {
				...prefs,
				overlays: { ...prefs.overlays, showAtmospheres: false }
			})
		).toBe(false);
		expect(
			resolveAtmosphereVisible({ ...body, atmosphere: { enabled: false } } as BodyNode, prefs)
		).toBe(false);
	});
});

describe('resolveOrbitPathVisible', () => {
	const prefs = createDefaultViewportPrefs();

	it('respects off / all / selected modes', () => {
		let scene = sceneWithRoot();
		scene = addChild(scene, makeGroup('root', 'star'));
		const nodes = makeOrbitingBody('star', { name: 'P' });
		for (const n of nodes) scene = addChild(scene, n);
		const orbitNode = nodes[0]!;
		const bodyId = nodes.at(-1)!.id;

		expect(resolveOrbitPathVisible(orbitNode, prefs, null, scene)).toBe(true);

		const offPrefs = {
			...prefs,
			overlays: { ...prefs.overlays, orbitPaths: 'off' as const }
		};
		expect(resolveOrbitPathVisible(orbitNode, offPrefs, null, scene)).toBe(false);

		const selPrefs = {
			...prefs,
			overlays: { ...prefs.overlays, orbitPaths: 'selected' as const }
		};
		expect(resolveOrbitPathVisible(orbitNode, selPrefs, null, scene)).toBe(false);
		expect(resolveOrbitPathVisible(orbitNode, selPrefs, orbitNode.id, scene)).toBe(true);
		expect(resolveOrbitPathVisible(orbitNode, selPrefs, bodyId, scene)).toBe(true);
	});

	it('shows every orbit in selected mode when the camera is in system view', () => {
		let scene = sceneWithRoot();
		scene = addChild(scene, makeGroup('root', 'star'));
		const nodes = makeOrbitingBody('star', { name: 'P' });
		for (const n of nodes) scene = addChild(scene, n);
		const orbitNode = nodes[0]!;
		const bodyId = nodes.at(-1)!.id;
		const selPrefs = {
			...prefs,
			overlays: { ...prefs.overlays, orbitPaths: 'selected' as const }
		};
		expect(resolveOrbitPathVisible(orbitNode, selPrefs, bodyId, scene, true)).toBe(true);
		expect(orbitPathSystemView(2e11, 1e11)).toBe(true);
		expect(orbitPathSystemView(5e10, 1e11)).toBe(false);
	});

	it('honours per-node display.orbitPath === false', () => {
		let scene = sceneWithRoot();
		scene = addChild(scene, makeGroup('root', 'star'));
		const nodes = makeOrbitingBody('star');
		for (const n of nodes) scene = addChild(scene, n);
		const orbitNode = { ...nodes[0]!, display: { orbitPath: false } };
		expect(resolveOrbitPathVisible(orbitNode, createDefaultViewportPrefs(), null, scene)).toBe(
			false
		);
	});
});

describe('isAncestorOrSelf', () => {
	it('walks the parent chain', () => {
		const g = (id: string, parentId: string | null): SceneNode => ({
			id,
			name: id,
			parentId,
			kind: 'group',
			enabled: true,
			transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1] }
		});
		const scene: PlanetScene = {
			rootId: 'root',
			nodes: new Map([g('root', null), g('a', 'root'), g('b', 'a')].map((n) => [n.id, n]))
		};
		expect(isAncestorOrSelf(scene, 'root', 'b')).toBe(true);
		expect(isAncestorOrSelf(scene, 'a', 'b')).toBe(true);
		expect(isAncestorOrSelf(scene, 'b', 'b')).toBe(true);
		expect(isAncestorOrSelf(scene, 'root', 'missing')).toBe(false);
	});
});

describe('toy solar system orbit paths', () => {
	it('has kepler nodes visible under all mode', () => {
		const scene = createToySolarSystemScene();
		const prefs = createDefaultViewportPrefs();
		let keplerCount = 0;
		for (const node of scene.nodes.values()) {
			if (node.driver?.type === 'kepler') {
				keplerCount++;
				expect(resolveOrbitPathVisible(node, prefs, null, scene)).toBe(true);
			}
		}
		expect(keplerCount).toBeGreaterThan(0);
	});
});
