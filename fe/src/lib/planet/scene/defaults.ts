import type { PlanetScene, SceneNode } from './types.js';
import { IDENTITY_QUAT, quatFromAxisAngle } from './transform.js';

const ROOT_ID = 'root';
const AMBIENT_ID = 'ambient';
const SUN_ID = 'sun';
const FILL_ID = 'fill';

/** Default starlight / sky-bounce ambient radiance (RGB). */
export const DEFAULT_AMBIENT: [number, number, number] = [0.02, 0.022, 0.028];

/** Default planet scene: root at origin, sun on +X, optional fill for testing. */
export function createDefaultPlanetScene(): PlanetScene {
	const nodes = new Map<string, SceneNode>();

	nodes.set(ROOT_ID, {
		id: ROOT_ID,
		name: 'Planet',
		parentId: null,
		kind: 'group',
		enabled: true,
		transform: { position: [0, 0, 0], rotation: IDENTITY_QUAT }
	});

	nodes.set(AMBIENT_ID, {
		id: AMBIENT_ID,
		name: 'Ambient',
		parentId: ROOT_ID,
		kind: 'ambient_light',
		enabled: true,
		transform: { position: [0, 0, 0], rotation: IDENTITY_QUAT },
		color: [...DEFAULT_AMBIENT],
		intensity: 1
	});

	nodes.set(SUN_ID, {
		id: SUN_ID,
		name: 'Sun',
		parentId: ROOT_ID,
		kind: 'directional_light',
		enabled: true,
		transform: { position: [0, 0, 0], rotation: IDENTITY_QUAT },
		color: [1.0, 0.95, 0.85],
		intensity: 3.5
	});

	nodes.set(FILL_ID, {
		id: FILL_ID,
		name: 'Fill',
		parentId: ROOT_ID,
		kind: 'directional_light',
		enabled: false,
		transform: {
			position: [0, 0, 0],
			rotation: quatFromAxisAngle([0, 1, 0], (2 * Math.PI) / 3)
		},
		color: [0.55, 0.65, 0.9],
		intensity: 0.35
	});

	return { rootId: ROOT_ID, nodes };
}
