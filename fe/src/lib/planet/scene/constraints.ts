import { eulerToQuat, quatToEuler } from './transform.js';
import type { SceneNode } from './types.js';

// Constraint stack — transform modifiers applied to a node's local transform after
// its base transform + driven fields, before world composition (Blender-style). The
// stack is composable; new constraint types slot into the switch. Phase 2 ships
// `limit_rotation`. See _docs/specs/scene-routing.md.

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** Apply a node's constraint stack to its (already driven) transform. */
export function applyConstraints(node: SceneNode): SceneNode {
	if (!node.constraints || node.constraints.length === 0) return node;
	let transform = node.transform;
	for (const c of node.constraints) {
		if (c.type === 'limit_rotation') {
			const e = quatToEuler(transform.rotation);
			if (c.x?.enabled) e[0] = clamp(e[0], c.x.min, c.x.max);
			if (c.y?.enabled) e[1] = clamp(e[1], c.y.min, c.y.max);
			if (c.z?.enabled) e[2] = clamp(e[2], c.z.min, c.z.max);
			transform = { ...transform, rotation: eulerToQuat(e[0], e[1], e[2]) };
		}
	}
	return transform === node.transform ? node : { ...node, transform };
}
