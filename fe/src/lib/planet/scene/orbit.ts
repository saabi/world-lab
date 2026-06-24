import type { Vec3 } from '../math/vec.js';
import type { OrbitElements, PlanetScene, SceneNode } from './types.js';
import { quatFromAxisAngle } from './transform.js';

// Kinematic orbit + spin animation. Orbits are parametric (position from time),
// not a physical simulation — "just animated". advanceScene drives node transforms
// from their orbit/spin components; the top-down view reads the resulting
// positions, and pausing just stops advancing t. See
// _docs/specs/solar-system-scene.md.

const TWO_PI = Math.PI * 2;

function normalizeAngle(a: number): number {
	let x = a % TWO_PI;
	if (x < 0) x += TWO_PI;
	return x;
}

/** Solve Kepler's equation E − e·sinE = M (Newton–Raphson). */
function eccentricAnomaly(meanAnomaly: number, e: number): number {
	let E = e < 0.8 ? meanAnomaly : Math.PI;
	for (let i = 0; i < 8; i++) {
		E -= (E - e * Math.sin(E) - meanAnomaly) / (1 - e * Math.cos(E));
	}
	return E;
}

/** Angular distance in [0, π]. */
function angularDist(a: number, b: number): number {
	const d = Math.abs(a - b);
	return Math.min(d, TWO_PI - d);
}

/** Eccentric anomaly at scene time `t` (seconds). For e≈0, equals mean anomaly. */
export function eccentricAnomalyAtTime(o: OrbitElements, t: number): number {
	const n = o.periodSeconds !== 0 ? TWO_PI / o.periodSeconds : 0;
	const meanAnomaly = o.phaseAtEpoch + n * t;
	if (o.eccentricity <= 1e-9) return normalizeAngle(meanAnomaly);
	return eccentricAnomaly(normalizeAngle(meanAnomaly), o.eccentricity);
}

/** Ramanujan approximation to ellipse perimeter (meters). */
export function orbitPerimeter(o: OrbitElements): number {
	const a = o.semiMajorAxis;
	const e = o.eccentricity;
	const b = a * Math.sqrt(1 - e * e);
	const h = ((a - b) / (a + b)) ** 2;
	return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
}

/**
 * Orbit position in the parent's local frame at time t (seconds). Coplanar in the
 * XZ plane (top-down looks down +Y); the ellipse is oriented by `periapsisAngle`.
 */
export function orbitLocalPosition(o: OrbitElements, t: number): Vec3 {
	const n = o.periodSeconds !== 0 ? TWO_PI / o.periodSeconds : 0;
	const meanAnomaly = o.phaseAtEpoch + n * t;

	// Perifocal coordinates, periapsis along +x.
	let xp: number;
	let yp: number;
	if (o.eccentricity <= 1e-9) {
		xp = o.semiMajorAxis * Math.cos(meanAnomaly);
		yp = o.semiMajorAxis * Math.sin(meanAnomaly);
	} else {
		const E = eccentricAnomaly(normalizeAngle(meanAnomaly), o.eccentricity);
		xp = o.semiMajorAxis * (Math.cos(E) - o.eccentricity);
		yp = o.semiMajorAxis * Math.sqrt(1 - o.eccentricity * o.eccentricity) * Math.sin(E);
	}

	// Orient the ellipse in the plane and map to XZ (y up).
	const c = Math.cos(o.periapsisAngle);
	const s = Math.sin(o.periapsisAngle);
	return [xp * c - yp * s, 0, xp * s + yp * c];
}

/**
 * Sample the orbit's geometric path (one full ellipse) in the parent's local frame,
 * for drawing the orbit line in the top-down view. `segments` points, evenly spaced
 * in eccentric anomaly (smooth outline). The time-position from orbitLocalPosition
 * always lies on this path. When `injectE` is set, the nearest sample is moved to that
 * eccentric anomaly so the polyline passes through the body's current orbital position.
 * Samples are emitted in ascending E so the line strip never chords across the interior.
 */
export function orbitPathLocal(o: OrbitElements, segments: number, injectE?: number): Vec3[] {
	const c = Math.cos(o.periapsisAngle);
	const s = Math.sin(o.periapsisAngle);
	const b = o.semiMajorAxis * Math.sqrt(1 - o.eccentricity * o.eccentricity);

	const Es: number[] = [];
	for (let i = 0; i < segments; i++) Es.push((TWO_PI * i) / segments);
	if (injectE !== undefined) {
		let e = injectE % TWO_PI;
		if (e < 0) e += TWO_PI;
		let best = 0;
		let bestDist = Infinity;
		for (let i = 0; i < Es.length; i++) {
			const d = angularDist(Es[i]!, e);
			if (d < bestDist) {
				bestDist = d;
				best = i;
			}
		}
		Es[best] = e;
		Es.sort((a, b) => a - b);
	}

	const pts: Vec3[] = [];
	for (const E of Es) {
		const xp = o.semiMajorAxis * (Math.cos(E) - o.eccentricity);
		const yp = b * Math.sin(E);
		pts.push([xp * c - yp * s, 0, xp * s + yp * c]);
	}
	return pts;
}

/**
 * Advance every orbiting / spinning node to time t (seconds), returning a new scene
 * with their transforms updated. Nodes without an orbit/spin component are left
 * untouched. Returns the same scene reference when nothing animates.
 */
export function advanceScene(scene: PlanetScene, t: number): PlanetScene {
	let changed = false;
	const nodes = new Map<string, SceneNode>();
	for (const [id, node] of scene.nodes) {
		let next = node;
		if (node.orbit) {
			next = {
				...next,
				transform: { ...next.transform, position: orbitLocalPosition(node.orbit, t) }
			};
			changed = true;
		}
		// Orbit-phase and spin both drive rotation about +Y; a node carries at most one.
		if (node.orbitPhase) {
			const { periodSeconds, phaseAtEpoch } = node.orbitPhase;
			const angle = phaseAtEpoch + (periodSeconds !== 0 ? (TWO_PI * t) / periodSeconds : 0);
			next = {
				...next,
				transform: { ...next.transform, rotation: quatFromAxisAngle([0, 1, 0], angle) }
			};
			changed = true;
		} else if (node.spinPeriodSeconds && node.spinPeriodSeconds !== 0) {
			const angle = (TWO_PI * t) / node.spinPeriodSeconds;
			next = {
				...next,
				transform: { ...next.transform, rotation: quatFromAxisAngle([0, 1, 0], angle) }
			};
			changed = true;
		}
		nodes.set(id, next);
	}
	return changed ? { rootId: scene.rootId, nodes } : scene;
}
