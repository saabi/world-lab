import { describe, expect, it } from 'vitest';
import { len3, sub3 } from '../math/vec.js';
import { orbitLocalPosition } from './orbit.js';
import { getSystem } from '../sundog/catalog.js';
import { createSceneFromCatalogSystem } from '../sundog/createSceneFromCatalogSystem.js';
import { evaluateScene } from './driver.js';
import {
	buildOrbitPath3D,
	collectOrbitPathSpecs,
	collectOrbitPaths,
	orbitPathBoundsForNearFar,
	orbitPathSegmentCount,
	sampleOrbitPath
} from './orbitPaths.js';
import { makeOrbitingBody, makeGroup, addChild } from './sceneEdit.js';
import { createToySolarSystemScene } from './solarSystem.js';
import type { OrbitElements, PlanetScene } from './types.js';

function sceneWithRoot(): PlanetScene {
	const root = makeGroup('root', 'root');
	root.parentId = null;
	return { rootId: 'root', nodes: new Map([[root.id, root]]) };
}

const TEST_ORBIT: OrbitElements = {
	semiMajorAxis: 1e8,
	eccentricity: 0.2,
	periodSeconds: 100,
	phaseAtEpoch: 0.5,
	periapsisAngle: 0.3
};

describe('collectOrbitPathSpecs', () => {
	it('dedupes multiple bodies on the same kepler container', () => {
		let scene = sceneWithRoot();
		scene = addChild(scene, makeGroup('root', 'star'));
		const a = makeOrbitingBody('star', { name: 'A' });
		const b = makeOrbitingBody('star', { name: 'B' });
		for (const n of a) scene = addChild(scene, n);
		for (const n of b) scene = addChild(scene, n);
		const paths = collectOrbitPathSpecs(scene);
		const keplerIds = new Set(paths.map((p) => p.keplerNodeId));
		expect(paths.length).toBe(keplerIds.size);
		expect(paths.length).toBe(2);
	});

	it('includes kepler containers without body children', () => {
		let scene = sceneWithRoot();
		scene = addChild(scene, makeGroup('root', 'star'));
		const nodes = makeOrbitingBody('star');
		const orbitOnly = nodes[0]!;
		scene = addChild(scene, orbitOnly);
		const paths = collectOrbitPathSpecs(scene);
		expect(paths.some((p) => p.keplerNodeId === orbitOnly.id)).toBe(true);
	});
});

describe('collectOrbitPaths', () => {
	it('places the moving body on the sampled ellipse (kepler)', () => {
		const scene = createToySolarSystemScene();
		const paths = collectOrbitPaths(scene, 64);
		expect(paths.length).toBeGreaterThan(0);
		const path = paths[0]!;
		expect(path.bodyId).toBeTruthy();
		expect(path.points.length).toBe(64);
		expect(len3(path.center)).toBeGreaterThanOrEqual(0);
	});
});

describe('orbitPathSegmentCount', () => {
	it('increases segment count when the view distance decreases', () => {
		const far = orbitPathSegmentCount(TEST_ORBIT, 1e9, 800, { max: 4096 });
		const near = orbitPathSegmentCount(TEST_ORBIT, 1e7, 800, { max: 4096 });
		expect(near).toBeGreaterThan(far);
	});

	it('clamps to max', () => {
		const segments = orbitPathSegmentCount(TEST_ORBIT, 1, 800, { max: 64 });
		expect(segments).toBe(64);
	});
});

describe('orbitPathBoundsForNearFar', () => {
	it('uses semiMajorAxis * (1 + e) as the bounding radius', () => {
		const spec = {
			keplerNodeId: 'k',
			bodyId: null,
			center: [1, 2, 3] as [number, number, number],
			elements: TEST_ORBIT
		};
		const b = orbitPathBoundsForNearFar(spec);
		expect(b.center).toEqual([1, 2, 3]);
		expect(b.radius).toBeCloseTo(TEST_ORBIT.semiMajorAxis * 1.2, 0);
	});
});

describe('sampleOrbitPath', () => {
	it('injects the body position at scene time onto the polyline', () => {
		const scene = createToySolarSystemScene();
		const spec = collectOrbitPathSpecs(scene).find((p) => p.bodyId)!;
		const t = 12.5;
		const points = sampleOrbitPath(spec, 32, { sceneTime: t });
		const bodyLocal = orbitLocalPosition(spec.elements, t);
		const bodyWorld: [number, number, number] = [
			spec.center[0] + bodyLocal[0],
			spec.center[1] + bodyLocal[1],
			spec.center[2] + bodyLocal[2]
		];
		const nearest = Math.min(...points.map((p) => len3(sub3(p, bodyWorld))));
		expect(nearest).toBeLessThan(1);
	});

	it('buildOrbitPath3D wraps spec + sampled points', () => {
		const scene = createToySolarSystemScene();
		const spec = collectOrbitPathSpecs(scene)[0]!;
		const path = buildOrbitPath3D(spec, 48, 0);
		expect(path.keplerNodeId).toBe(spec.keplerNodeId);
		expect(path.points.length).toBe(48);
		expect(path.localPoints.length).toBe(48);
	});
});

describe('collectOrbitPathSpecs (catalog)', () => {
	it('collects one path per planet in the Glory system', () => {
		const glory = getSystem('glory');
		expect(glory).toBeTruthy();
		const scene = createSceneFromCatalogSystem(glory!);
		const specs = collectOrbitPathSpecs(evaluateScene(scene, 0));
		expect(specs).toHaveLength(3);
		const ids = specs.map((s) => s.keplerNodeId).sort();
		expect(ids).toEqual(['glory-i-orbit', 'glory-ii-orbit', 'glory-iii-orbit']);
	});
});
