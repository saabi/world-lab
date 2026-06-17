import type { PlanetScene, SceneNode } from './types.js';
import { IDENTITY_QUAT } from './transform.js';

const ROOT_ID = 'root';
const SUN_ID = 'sun';

/** Default planet scene: root at origin, warm sun on +X, cool fill ~120° away. */
export function createDefaultPlanetScene(): PlanetScene {
	const nodes = new Map<string, SceneNode>();

	nodes.set(ROOT_ID, {
		id: ROOT_ID,
		name: 'Planet',
		parentId: null,
		kind: 'group',
		transform: { position: [0, 0, 0], rotation: IDENTITY_QUAT }
	});

	// Sun only — no opposing fill; space has a dark night side.
	nodes.set(SUN_ID, {
		id: SUN_ID,
		name: 'Sun',
		parentId: ROOT_ID,
		kind: 'directional_light',
		transform: { position: [0, 0, 0], rotation: IDENTITY_QUAT },
		color: [1.0, 0.95, 0.85],
		intensity: 3.5
	});

	return { rootId: ROOT_ID, nodes };
}

export const DEFAULT_AMBIENT: [number, number, number] = [0.02, 0.022, 0.028];
