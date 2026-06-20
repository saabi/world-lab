import type { PlanetScene } from './types.js';

// Shared scene-path resolver: the URL-is-the-tree addressing language used by
// transform inheritance, references (ref), and (later) routing. Absolute paths
// ('/a/b') resolve from the root's children; relative paths ('../', '../sibling',
// 'child') from the source node. Unrestricted in direction — callers that need
// acyclicity (transform inheritance) rely on the world-transform resolver's cycle
// guard, not on a structural restriction here. See _docs/specs/scene-routing.md.

/** Path that means "the immediate parent" — the default inheritance for a channel. */
export const PARENT_PATH = '../';

/** Case/space-normalized segment for matching against node names. */
function normalizeSegment(s: string): string {
	return s.trim().toLowerCase().replace(/\s+/g, '-');
}

function childByName(scene: PlanetScene, parentId: string | null, name: string): string | null {
	const target = normalizeSegment(name);
	for (const node of scene.nodes.values()) {
		if (node.parentId === parentId && normalizeSegment(node.name) === target) return node.id;
	}
	return null;
}

/**
 * Resolve a scene path to a node id, or `null` for the world frame (a path above
 * the root, or a missing segment). Absolute paths are rooted at the root node
 * (which is unnamed in the path: `/` = root, `/sol` = root's child "sol"); relative
 * paths resolve from `fromNodeId` (`..` = parent, `.` = self, a name = a child).
 * Segments match node names, normalized (lowercase, spaces → `-`).
 */
export function resolvePath(scene: PlanetScene, fromNodeId: string, path: string): string | null {
	let current: string | null;
	let segments: string[];
	if (path.startsWith('/')) {
		current = scene.rootId;
		segments = path.slice(1).split('/');
	} else {
		current = fromNodeId;
		segments = path.split('/');
	}
	for (const seg of segments) {
		if (seg === '' || seg === '.') continue;
		if (current == null) return null;
		if (seg === '..') {
			current = scene.nodes.get(current)?.parentId ?? null;
		} else {
			current = childByName(scene, current, seg);
			if (current == null) return null;
		}
	}
	return current;
}
