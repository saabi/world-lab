import type { PlanetScene, SceneNode } from './types.js';

// Scene (de)serialization for persistence. The scene is plain data — nodes with
// transforms, drivers (kepler / orbit / spin), bindings, constraints, inheritance
// paths, and kind-specific fields — so it round-trips through JSON. The version field
// guards structure changes: an older doc is rejected (returns null) so the caller
// falls back to the current preset rather than loading a stale structure (e.g. a v1
// save predates driver-based orbits — its bodies would render but draw no orbits).
// Deep links / routing need a loadable scene; see _docs/specs/scene-routing.md.
//
// v2: driver/binding orbits (kepler driver replaces the phase→radius / orbitPhase nodes).
// v3: composable orbit primitives (driver container → rotate(phase) → translate(radius)).

const SCENE_DOC_VERSION = 3;

export interface SceneDocument {
	version: number;
	rootId: string;
	nodes: SceneNode[];
}

export function serializeScene(scene: PlanetScene): string {
	const doc: SceneDocument = {
		version: SCENE_DOC_VERSION,
		rootId: scene.rootId,
		nodes: [...scene.nodes.values()]
	};
	return JSON.stringify(doc);
}

function isValidNode(n: unknown): n is SceneNode {
	if (!n || typeof n !== 'object') return false;
	const o = n as Record<string, unknown>;
	const t = o.transform as { position?: unknown; rotation?: unknown } | undefined;
	return (
		typeof o.id === 'string' &&
		typeof o.name === 'string' &&
		(o.parentId === null || typeof o.parentId === 'string') &&
		typeof o.kind === 'string' &&
		typeof o.enabled === 'boolean' &&
		!!t &&
		Array.isArray(t.position) &&
		Array.isArray(t.rotation)
	);
}

/** Parse a serialized scene; null if malformed (caller falls back to a default). */
export function deserializeScene(json: string): PlanetScene | null {
	let doc: unknown;
	try {
		doc = JSON.parse(json);
	} catch {
		return null;
	}
	if (!doc || typeof doc !== 'object') return null;
	const d = doc as Record<string, unknown>;
	if (d.version !== SCENE_DOC_VERSION) return null; // stale/incompatible → caller reloads the preset
	if (typeof d.rootId !== 'string' || !Array.isArray(d.nodes)) return null;

	const nodes = new Map<string, SceneNode>();
	for (const n of d.nodes) {
		if (!isValidNode(n)) return null;
		nodes.set(n.id, n);
	}
	if (!nodes.has(d.rootId)) return null;
	return { rootId: d.rootId, nodes };
}
