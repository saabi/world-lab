import type { Vec3 } from '../math/vec.js';
import type { BodyNode, PlanetScene, SceneNode } from './types.js';
import {
	composeWorldTransform,
	IDENTITY_QUAT,
	quatMultiply,
	rotateVec3,
	type WorldTransform
} from './transform.js';

const ORIGIN: Vec3 = [0, 0, 0];
const WORLD_IDENTITY: WorldTransform = { position: ORIGIN, rotation: IDENTITY_QUAT };

/**
 * The node `degree` steps up the ancestor chain (1 = immediate parent). Returns
 * null when the walk clamps past the root — i.e. the world/inertial frame.
 */
function ancestorAtDegree(scene: PlanetScene, nodeId: string, degree: number): string | null {
	let id: string | null = nodeId;
	for (let i = 0; i < degree && id != null; i++) {
		id = scene.nodes.get(id)?.parentId ?? null;
	}
	return id;
}

export function getNode(scene: PlanetScene, id: string): SceneNode | undefined {
	return scene.nodes.get(id);
}

export function getChildren(scene: PlanetScene, parentId: string): SceneNode[] {
	const out: SceneNode[] = [];
	for (const node of scene.nodes.values()) {
		if (node.parentId === parentId) out.push(node);
	}
	return out;
}

export function getWorldTransform(scene: PlanetScene, nodeId: string): WorldTransform {
	const node = scene.nodes.get(nodeId);
	if (!node) return WORLD_IDENTITY;

	const posDeg = node.inheritance?.position ?? 1;
	const rotDeg = node.inheritance?.rotation ?? 1;

	// Fast path: standard single-parent composition (both channels from the parent).
	if (posDeg === 1 && rotDeg === 1) {
		const parentWorld =
			node.parentId != null ? getWorldTransform(scene, node.parentId) : WORLD_IDENTITY;
		return composeWorldTransform(parentWorld, node.transform);
	}

	// Decoupled per-channel inheritance: translate by the position ancestor, orient
	// the local offset + rotation by the rotation ancestor.
	const posId = ancestorAtDegree(scene, nodeId, posDeg);
	const rotId = ancestorAtDegree(scene, nodeId, rotDeg);
	const posWorld = posId != null ? getWorldTransform(scene, posId) : WORLD_IDENTITY;
	const rotWorld = rotId != null ? getWorldTransform(scene, rotId) : WORLD_IDENTITY;
	const offset = rotateVec3(rotWorld.rotation, node.transform.position);
	return {
		position: [
			posWorld.position[0] + offset[0],
			posWorld.position[1] + offset[1],
			posWorld.position[2] + offset[2]
		],
		rotation: quatMultiply(rotWorld.rotation, node.transform.rotation)
	};
}

export function visitScene(scene: PlanetScene, visitor: (node: SceneNode, world: WorldTransform) => void): void {
	function walk(nodeId: string): void {
		const node = scene.nodes.get(nodeId);
		if (!node) return;
		const world = getWorldTransform(scene, nodeId);
		visitor(node, world);
		for (const child of getChildren(scene, nodeId)) {
			walk(child.id);
		}
	}
	walk(scene.rootId);
}

export function findByKind<K extends SceneNode['kind']>(
	scene: PlanetScene,
	kind: K
): Extract<SceneNode, { kind: K }>[] {
	const out: Extract<SceneNode, { kind: K }>[] = [];
	for (const node of scene.nodes.values()) {
		if (node.kind === kind) out.push(node as Extract<SceneNode, { kind: K }>);
	}
	return out;
}

export function listSceneNodes(scene: PlanetScene): SceneNode[] {
	return [...scene.nodes.values()];
}

export function isNodeEnabled(scene: PlanetScene, nodeId: string): boolean {
	let id: string | null = nodeId;
	while (id != null) {
		const node = scene.nodes.get(id);
		if (!node || !node.enabled) return false;
		id = node.parentId;
	}
	return true;
}

export interface SceneTreeRow {
	node: SceneNode;
	depth: number;
}

/** Depth-first rows for tree UI (root first). */
export function listSceneTreeRows(scene: PlanetScene): SceneTreeRow[] {
	const rows: SceneTreeRow[] = [];
	function walk(nodeId: string, depth: number): void {
		const node = scene.nodes.get(nodeId);
		if (!node) return;
		rows.push({ node, depth });
		const children = getChildren(scene, nodeId);
		children.sort((a, b) => a.name.localeCompare(b.name));
		for (const child of children) {
			walk(child.id, depth + 1);
		}
	}
	walk(scene.rootId, 0);
	return rows;
}

export function setNodeEnabled(scene: PlanetScene, nodeId: string, enabled: boolean): PlanetScene {
	const node = scene.nodes.get(nodeId);
	if (!node || node.enabled === enabled) return scene;
	const nodes = new Map(scene.nodes);
	nodes.set(nodeId, { ...node, enabled });
	return { rootId: scene.rootId, nodes };
}

/** All body nodes in the scene. */
export function listBodies(scene: PlanetScene): BodyNode[] {
	return findByKind(scene, 'body');
}

/**
 * The body that owns a node's orbit: its nearest ancestor of kind 'body'. For a
 * moon → its planet; for a planet → its star. null if there is no ancestor body.
 * (Starts at the node's parent, so a body's owner is its parent body, not itself.)
 */
export function findOwnerBody(scene: PlanetScene, nodeId: string): BodyNode | null {
	const start = scene.nodes.get(nodeId);
	let id: string | null = start ? start.parentId : null;
	while (id != null) {
		const node = scene.nodes.get(id);
		if (!node) return null;
		if (node.kind === 'body') return node;
		id = node.parentId;
	}
	return null;
}

export function nodeKindLabel(kind: SceneNode['kind']): string {
	switch (kind) {
		case 'group':
			return 'group';
		case 'body':
			return 'body';
		case 'directional_light':
			return 'directional light';
		case 'point_light':
			return 'point light';
		case 'ambient_light':
			return 'ambient';
	}
}
