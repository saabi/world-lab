import type { Vec3 } from '../math/vec.js';
import type { DriverSpec, PlanetScene, SceneNode, TermOp, TermSource } from './types.js';
import { advanceScene, orbitLocalPosition } from './orbit.js';
import { eulerToQuat, quatToEuler } from './transform.js';
import { resolvePath } from './scenePath.js';
import { applyConstraints } from './constraints.js';

// Driver/binding dataflow (Phase 1). A node may carry a *driver* that computes
// named outputs from time, and *bindings* that wire those outputs (referenced by
// path) into its transform fields. This decouples computation (drivers) from
// structure (composable transform nodes), wired by paths — so an orbit is a kepler
// driver wired into a rotate node (phase) + a translate node (radius), not a baked
// primitive. See _docs/specs/scene-routing.md.

/** Evaluate a driver's named outputs at time t. */
export function evaluateDriver(spec: DriverSpec, t: number): Record<string, number> {
	if (spec.type === 'kepler') {
		// Kepler ellipse, focus at the origin. Output the polar (phase, radius) so a
		// rotate(phase)→translate(radius) chain reconstructs the position — and the
		// central body at the origin sits at the focus. phase = atan2(−z, x) matches
		// the +Y rotation convention so the chain round-trips orbitLocalPosition.
		const p = orbitLocalPosition(
			{
				semiMajorAxis: spec.semiMajorAxis,
				eccentricity: spec.eccentricity,
				periodSeconds: spec.periodSeconds,
				phaseAtEpoch: spec.phaseAtEpoch,
				periapsisAngle: spec.periapsisAngle
			},
			t
		);
		// Both forms: x/z for a single position-bound orbit node, phase/radius for a
		// rotate→translate decomposition.
		return {
			x: p[0],
			z: p[2],
			phase: Math.atan2(-p[2], p[0]),
			radius: Math.hypot(p[0], p[2])
		};
	}
	return {};
}

/** Resolve a term's source to a number (a driver output, or a constant). */
function sourceValue(
	scene: PlanetScene,
	nodeId: string,
	source: TermSource,
	outputs: Map<string, Record<string, number>>
): number | undefined {
	if ('const' in source) return source.const;
	const driverId = resolvePath(scene, nodeId, source.ref);
	return driverId != null ? outputs.get(driverId)?.[source.output] : undefined;
}

function fold(acc: number, op: TermOp | undefined, val: number): number {
	switch (op ?? 'set') {
		case 'add': return acc + val;
		case 'mul': return acc * val;
		case 'set':
		default: return val;
	}
}

function applyBindings(
	scene: PlanetScene,
	node: SceneNode,
	outputs: Map<string, Record<string, number>>
): SceneNode {
	// Seed each channel with the stored literal; fold its terms left-to-right.
	const pos = [...node.transform.position] as Vec3;
	const euler = quatToEuler(node.transform.rotation);
	const scl = [...(node.transform.scale ?? [1, 1, 1])] as Vec3;
	for (const term of node.bindings ?? []) {
		const val = sourceValue(scene, node.id, term.source, outputs);
		if (val == null) continue;
		switch (term.field) {
			case 'positionX': pos[0] = fold(pos[0], term.op, val); break;
			case 'positionY': pos[1] = fold(pos[1], term.op, val); break;
			case 'positionZ': pos[2] = fold(pos[2], term.op, val); break;
			case 'rotationX': euler[0] = fold(euler[0], term.op, val); break;
			case 'rotationY': euler[1] = fold(euler[1], term.op, val); break;
			case 'rotationZ': euler[2] = fold(euler[2], term.op, val); break;
			case 'scaleX': scl[0] = fold(scl[0], term.op, val); break;
			case 'scaleY': scl[1] = fold(scl[1], term.op, val); break;
			case 'scaleZ': scl[2] = fold(scl[2], term.op, val); break;
		}
	}
	return {
		...node,
		transform: { position: pos, rotation: eulerToQuat(euler[0], euler[1], euler[2]), scale: scl }
	};
}

/**
 * Advance the scene to time t: the existing transform drivers (orbit/orbitPhase/spin
 * via advanceScene) plus the driver/binding dataflow — evaluate every driver node's
 * outputs, then resolve each node's field bindings from them. Phase-1 drivers depend
 * only on t, so no ordering is needed; driver→driver/node refs (sum/reflex) will add
 * topological evaluation later.
 */
export function evaluateScene(scene: PlanetScene, t: number): PlanetScene {
	const s = advanceScene(scene, t);

	const outputs = new Map<string, Record<string, number>>();
	for (const node of s.nodes.values()) {
		if (node.driver) outputs.set(node.id, evaluateDriver(node.driver, t));
	}

	let changed = false;
	const nodes = new Map(s.nodes);
	for (const [id, node] of s.nodes) {
		let next = node;
		// Driven fields first, then constraints clamp/modify the result.
		if (node.bindings && node.bindings.length > 0) next = applyBindings(s, next, outputs);
		if (node.constraints && node.constraints.length > 0) next = applyConstraints(next);
		if (next !== node) {
			nodes.set(id, next);
			changed = true;
		}
	}
	return changed ? { rootId: s.rootId, nodes } : s;
}
