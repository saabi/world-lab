import type { Vec3 } from '../math/vec.js';
import type { BodyNode, PlanetScene, SceneNode } from './types.js';
import {
	composeWorldTransform,
	IDENTITY_QUAT,
	mulVec3,
	quatMultiply,
	rotateVec3,
	UNIT_SCALE,
	type WorldTransform
} from './transform.js';
import { PARENT_PATH, resolvePath } from './scenePath.js';

const ORIGIN: Vec3 = [0, 0, 0];
const WORLD_IDENTITY: WorldTransform = {
	position: ORIGIN,
	rotation: IDENTITY_QUAT,
	scale: UNIT_SCALE
};

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
	return resolveWorld(scene, nodeId, new Map(), new Set());
}

/**
 * World transform with per-channel path inheritance. `memo` caches per call; `visiting`
 * is the active recursion stack — re-entering a node on it is a cycle, broken by
 * returning the world frame for that edge (so a bad path can't hang the renderer).
 */
function resolveWorld(
	scene: PlanetScene,
	nodeId: string,
	memo: Map<string, WorldTransform>,
	visiting: Set<string>
): WorldTransform {
	const cached = memo.get(nodeId);
	if (cached) return cached;
	if (visiting.has(nodeId)) return WORLD_IDENTITY; // cycle — break the edge at world
	const node = scene.nodes.get(nodeId);
	if (!node) return WORLD_IDENTITY;
	visiting.add(nodeId);

	const posPath = node.inheritance?.position ?? PARENT_PATH;
	const rotPath = node.inheritance?.rotation ?? PARENT_PATH;
	const scalePath = node.inheritance?.scale ?? PARENT_PATH;

	let world: WorldTransform;
	if (posPath === PARENT_PATH && rotPath === PARENT_PATH && scalePath === PARENT_PATH) {
		// Fast path: standard single-parent composition (bit-identical to before).
		const parentWorld =
			node.parentId != null ? resolveWorld(scene, node.parentId, memo, visiting) : WORLD_IDENTITY;
		world = composeWorldTransform(parentWorld, node.transform);
	} else {
		// Decoupled: translate by the position target (its scale scales the offset),
		// orient by the rotation target, scale by the scale target — each from its path.
		const posId = resolvePath(scene, nodeId, posPath);
		const rotId = resolvePath(scene, nodeId, rotPath);
		const scaleId = resolvePath(scene, nodeId, scalePath);
		const posWorld = posId != null ? resolveWorld(scene, posId, memo, visiting) : WORLD_IDENTITY;
		const rotWorld = rotId != null ? resolveWorld(scene, rotId, memo, visiting) : WORLD_IDENTITY;
		const scaleWorld = scaleId != null ? resolveWorld(scene, scaleId, memo, visiting) : WORLD_IDENTITY;
		const offset = rotateVec3(rotWorld.rotation, mulVec3(posWorld.scale, node.transform.position));
		world = {
			position: [
				posWorld.position[0] + offset[0],
				posWorld.position[1] + offset[1],
				posWorld.position[2] + offset[2]
			],
			rotation: quatMultiply(rotWorld.rotation, node.transform.rotation),
			scale: mulVec3(scaleWorld.scale, node.transform.scale ?? UNIT_SCALE)
		};
	}

	visiting.delete(nodeId);
	memo.set(nodeId, world);
	return world;
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
 * The body that owns a node's orbit. In the phase→radius→body structure the orbit's
 * central body is a *sibling* at the system center (a moon's planet), or an *ancestor*
 * (a planet's star). Walking up, the owner is the first body sibling (a body child of
 * an ancestor, off our path) or ancestor body encountered. null if none.
 */
export function findOwnerBody(scene: PlanetScene, nodeId: string): BodyNode | null {
	let childId = nodeId;
	let parentId = scene.nodes.get(nodeId)?.parentId ?? null;
	while (parentId != null) {
		const parent = scene.nodes.get(parentId);
		if (!parent) return null;
		// A primary body at this center: a body child other than the one we came from.
		for (const child of getChildren(scene, parentId)) {
			if (child.id !== childId && child.kind === 'body') return child;
		}
		// Or this ancestor itself is a body (e.g. the star a planet orbits).
		if (parent.kind === 'body') return parent;
		childId = parentId;
		parentId = parent.parentId;
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
