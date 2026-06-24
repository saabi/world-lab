import type { Vec3 } from '../math/vec.js';
import { add3 } from '../math/vec.js';
import { FOVY } from '../scene3d/orbitCamera.js';
import type { KeplerDriver, OrbitElements, PlanetScene } from './types.js';
import { eccentricAnomalyAtTime, orbitPathLocal, orbitPerimeter } from './orbit.js';
import { getWorldTransform, listBodies } from './sceneTree.js';

const DEFAULT_SEGMENTS = 96;

export interface OrbitPathSpec {
	keplerNodeId: string;
	/** A body that orbits on this path (for selection filtering). */
	bodyId: string | null;
	/** World position of the orbit center (kepler parent's origin; inertial plane). */
	center: Vec3;
	elements: OrbitElements;
}

/** Sampled orbit path ready for rendering. */
export interface OrbitPath3D extends OrbitPathSpec {
	/** Parent-local ellipse samples (metres). Used by the 3D line pass for precision. */
	localPoints: Vec3[];
	/** World-space loop for 2D map projection. */
	points: Vec3[];
}

export interface OrbitPathSegmentOpts {
	maxChordPx?: number;
	min?: number;
	max?: number;
	fovy?: number;
}

function keplerToOrbitElements(driver: KeplerDriver): OrbitElements {
	return {
		semiMajorAxis: driver.semiMajorAxis,
		eccentricity: driver.eccentricity,
		periodSeconds: driver.periodSeconds,
		phaseAtEpoch: driver.phaseAtEpoch,
		periapsisAngle: driver.periapsisAngle
	};
}

/**
 * Screen-space adaptive segment count for an orbit ellipse. Matches the scene draw-list
 * projection scale so chord length stays near `maxChordPx` pixels.
 */
export function orbitPathSegmentCount(
	elements: OrbitElements,
	viewDistance: number,
	viewportHeight: number,
	opts: OrbitPathSegmentOpts = {}
): number {
	const { maxChordPx = 4, min = 32, max = 256, fovy = FOVY } = opts;
	const perimeter = orbitPerimeter(elements);
	const screenScale = (1 / Math.tan(fovy / 2)) * (viewportHeight / 2);
	const pxPerMeter = screenScale / Math.max(viewDistance, 1);
	const perimeterPx = perimeter * pxPerMeter;
	return Math.max(min, Math.min(max, Math.ceil(perimeterPx / maxChordPx)));
}

/** Conservative bounding sphere for far-plane fitting (independent of tessellation). */
export function orbitPathBoundsForNearFar(spec: OrbitPathSpec): { center: Vec3; radius: number } {
	return {
		center: spec.center,
		radius: spec.elements.semiMajorAxis * (1 + spec.elements.eccentricity)
	};
}

/** Sample parent-local orbit points. Optionally inject the body's eccentric anomaly. */
export function sampleOrbitPathLocal(
	spec: OrbitPathSpec,
	segments: number,
	opts?: { injectBodyE?: number; sceneTime?: number }
): Vec3[] {
	const injectE =
		opts?.injectBodyE ??
		(opts?.sceneTime !== undefined && spec.bodyId
			? eccentricAnomalyAtTime(spec.elements, opts.sceneTime)
			: undefined);
	return orbitPathLocal(spec.elements, segments, injectE);
}

/** Sample world-space orbit points. Optionally inject the body's eccentric anomaly. */
export function sampleOrbitPath(
	spec: OrbitPathSpec,
	segments: number,
	opts?: { injectBodyE?: number; sceneTime?: number }
): Vec3[] {
	const local = sampleOrbitPathLocal(spec, segments, opts);
	return local.map((p) => add3(spec.center, p));
}

/**
 * Collect unique orbit ellipse specs for the scene. Each kepler-driver container
 * yields one path (deduped). Legacy `node.orbit` on any node also yields a path.
 */
export function collectOrbitPathSpecs(scene: PlanetScene): OrbitPathSpec[] {
	const byKepler = new Map<string, OrbitPathSpec>();

	for (const body of listBodies(scene)) {
		let cur = body.parentId ? scene.nodes.get(body.parentId) : undefined;
		while (cur && cur.driver?.type !== 'kepler' && cur.kind !== 'body') {
			cur = cur.parentId ? scene.nodes.get(cur.parentId) : undefined;
		}
		if (!cur || cur.driver?.type !== 'kepler' || cur.parentId == null) continue;

		if (!byKepler.has(cur.id)) {
			const center = getWorldTransform(scene, cur.parentId).position;
			byKepler.set(cur.id, {
				keplerNodeId: cur.id,
				bodyId: body.id,
				center,
				elements: keplerToOrbitElements(cur.driver)
			});
		}
	}

	// Legacy position-model orbits on any node (skip if already collected via kepler).
	for (const node of scene.nodes.values()) {
		if (!node.orbit || node.parentId == null || byKepler.has(node.id)) continue;
		const center = getWorldTransform(scene, node.parentId).position;
		byKepler.set(node.id, {
			keplerNodeId: node.id,
			bodyId: node.kind === 'body' ? node.id : null,
			center,
			elements: node.orbit
		});
	}

	// Kepler containers with no body children yet (authoring).
	for (const node of scene.nodes.values()) {
		if (node.driver?.type !== 'kepler' || node.parentId == null) continue;
		if (byKepler.has(node.id)) continue;
		const center = getWorldTransform(scene, node.parentId).position;
		byKepler.set(node.id, {
			keplerNodeId: node.id,
			bodyId: null,
			center,
			elements: keplerToOrbitElements(node.driver)
		});
	}

	return [...byKepler.values()];
}

/**
 * Collect unique orbit ellipse paths for the scene with a fixed segment count.
 * Prefer {@link collectOrbitPathSpecs} + {@link sampleOrbitPath} for adaptive LOD.
 */
export function collectOrbitPaths(
	scene: PlanetScene,
	segments = DEFAULT_SEGMENTS,
	sceneTime?: number
): OrbitPath3D[] {
	return collectOrbitPathSpecs(scene).map((spec) => ({
		...spec,
		...buildOrbitPathSamples(spec, segments, sceneTime)
	}));
}

function buildOrbitPathSamples(
	spec: OrbitPathSpec,
	segments: number,
	sceneTime?: number
): Pick<OrbitPath3D, 'localPoints' | 'points'> {
	const opts = sceneTime !== undefined ? { sceneTime } : undefined;
	const localPoints = sampleOrbitPathLocal(spec, segments, opts);
	return {
		localPoints,
		points: localPoints.map((p) => add3(spec.center, p))
	};
}

/** Build a rendered path from a spec with adaptive segment count. */
export function buildOrbitPath3D(
	spec: OrbitPathSpec,
	segments: number,
	sceneTime?: number
): OrbitPath3D {
	return {
		...spec,
		...buildOrbitPathSamples(spec, segments, sceneTime)
	};
}
