import { create } from '@virtual-planet/schema';
import type { BodyNode, BodyType, PlanetScene, SceneNode } from './types.js';
import { IDENTITY_QUAT } from './transform.js';
import { bodySchema } from './nodeSchemas.js';

// Pure scene-editing verbs (add / remove-subtree / reparent), each returning a new
// scene (or the same reference when the edit is a no-op / invalid). Structural
// integrity is enforced here: the root can't be removed/reparented, and reparenting
// is cycle-safe. New nodes are spawned from schema defaults (create), tying the
// "add" verb to the schema layer. See _docs/specs/scene-routing.md.

function newId(prefix: string): string {
	const rand =
		typeof crypto !== 'undefined' && crypto.randomUUID
			? crypto.randomUUID().slice(0, 8)
			: Math.random().toString(36).slice(2, 10);
	return `${prefix}-${rand}`;
}

const identityTransform = () => ({ position: [0, 0, 0] as [number, number, number], rotation: IDENTITY_QUAT });

/** A new empty group node parented under `parentId`. */
export function makeGroup(parentId: string, name = 'Group'): SceneNode {
	return { id: newId('group'), name, parentId, kind: 'group', enabled: true, transform: identityTransform() };
}

/** A new body node (defaults from bodySchema) parented under `parentId`. */
export function makeBody(parentId: string, name = 'Body'): BodyNode {
	return {
		id: newId('body'),
		name,
		parentId,
		kind: 'body',
		enabled: true,
		transform: identityTransform(),
		...create(bodySchema)
	} as BodyNode;
}

export interface OrbitingBodyOptions {
	name?: string;
	bodyType?: BodyType;
	orbitRadiusMeters?: number;
	periodSeconds?: number;
	phaseAtEpoch?: number;
	spinPeriodSeconds?: number;
	eccentricity?: number;
	periapsisAngle?: number;
}

/**
 * The composable primitives of an orbiting body — orbit container (kepler driver +
 * inertial frame) → rotate (phase) → translate (radius) → body (spins) — orbiting
 * `centerId`. The driver's outputs feed the two primitives by path. The body keeps
 * the same id as the returned last element.
 */
export function makeOrbitingBody(centerId: string, options: OrbitingBodyOptions = {}): SceneNode[] {
	const {
		name = 'Body',
		bodyType = 'planet',
		orbitRadiusMeters = 8_000_000,
		periodSeconds = 80,
		phaseAtEpoch = 0,
		spinPeriodSeconds = 20,
		eccentricity = 0,
		periapsisAngle = 0
	} = options;
	const baseId = newId('body');
	const orbit: SceneNode = {
		id: `${baseId}-orbit`,
		name: `${name} orbit`,
		parentId: centerId,
		kind: 'group',
		enabled: true,
		transform: identityTransform(),
		driver: { type: 'kepler', semiMajorAxis: orbitRadiusMeters, eccentricity, periodSeconds, phaseAtEpoch, periapsisAngle },
		inheritance: { position: '../', rotation: '/', scale: '../' }
	};
	const phase: SceneNode = {
		id: `${baseId}-phase`,
		name: `${name} phase`,
		parentId: `${baseId}-orbit`,
		kind: 'group',
		enabled: true,
		transform: identityTransform(),
		bindings: [{ field: 'rotationY', source: { ref: '..', output: 'phase' } }]
	};
	const radius: SceneNode = {
		id: `${baseId}-radius`,
		name: `${name} radius`,
		parentId: `${baseId}-phase`,
		kind: 'group',
		enabled: true,
		transform: identityTransform(),
		bindings: [{ field: 'positionX', source: { ref: '../..', output: 'radius' } }]
	};
	const body = {
		id: baseId,
		name,
		parentId: `${baseId}-radius`,
		kind: 'body',
		enabled: true,
		transform: identityTransform(),
		...create(bodySchema),
		bodyType,
		spinPeriodSeconds
	} as BodyNode;
	return [orbit, phase, radius, body];
}

/** Add an orbiting body (container→rotate→translate→body) under `centerId`. Returns the new body id. */
export function addOrbitingBody(
	scene: PlanetScene,
	centerId: string,
	options: OrbitingBodyOptions = {}
): { scene: PlanetScene; bodyId: string } {
	const [orbit, phase, radius, body] = makeOrbitingBody(centerId, options);
	let s = addChild(scene, orbit);
	s = addChild(s, phase);
	s = addChild(s, radius);
	s = addChild(s, body);
	return { scene: s, bodyId: body.id };
}

/** All descendant ids of `nodeId` (exclusive). */
export function descendantIds(scene: PlanetScene, nodeId: string): Set<string> {
	const out = new Set<string>();
	const stack = [nodeId];
	while (stack.length) {
		const id = stack.pop()!;
		for (const n of scene.nodes.values()) {
			if (n.parentId === id && !out.has(n.id)) {
				out.add(n.id);
				stack.push(n.id);
			}
		}
	}
	return out;
}

/** Add a node (its `parentId` must be set). No-op on an id collision. */
export function addChild(scene: PlanetScene, node: SceneNode): PlanetScene {
	if (scene.nodes.has(node.id)) return scene;
	const nodes = new Map(scene.nodes);
	nodes.set(node.id, node);
	return { rootId: scene.rootId, nodes };
}

/** Remove a node and its whole subtree. The root can't be removed. */
export function removeSubtree(scene: PlanetScene, nodeId: string): PlanetScene {
	if (nodeId === scene.rootId || !scene.nodes.has(nodeId)) return scene;
	const remove = descendantIds(scene, nodeId);
	remove.add(nodeId);
	const nodes = new Map<string, SceneNode>();
	for (const [id, n] of scene.nodes) if (!remove.has(id)) nodes.set(id, n);
	return { rootId: scene.rootId, nodes };
}

/** Move `nodeId` under `newParentId`. Cycle-safe (can't reparent under itself or a descendant). */
export function reparent(scene: PlanetScene, nodeId: string, newParentId: string): PlanetScene {
	if (nodeId === scene.rootId || nodeId === newParentId) return scene;
	const node = scene.nodes.get(nodeId);
	if (!node || !scene.nodes.has(newParentId)) return scene;
	if (node.parentId === newParentId) return scene;
	if (descendantIds(scene, nodeId).has(newParentId)) return scene; // would form a cycle
	const nodes = new Map(scene.nodes);
	nodes.set(nodeId, { ...node, parentId: newParentId });
	return { rootId: scene.rootId, nodes };
}
