import type { Vec3 } from '../math/vec.js';
import type { PlanetScene, SceneNode } from './types.js';
import { composeWorldTransform, IDENTITY_QUAT, type WorldTransform } from './transform.js';

const ORIGIN: Vec3 = [0, 0, 0];

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
	if (!node) {
		return { position: [0, 0, 0], rotation: IDENTITY_QUAT };
	}
	const parentWorld: WorldTransform =
		node.parentId != null ? getWorldTransform(scene, node.parentId) : { position: ORIGIN, rotation: IDENTITY_QUAT };
	return composeWorldTransform(parentWorld, node.transform);
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
