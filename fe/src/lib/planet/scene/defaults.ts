import type { PlanetScene, SceneNode } from './types.js';
import { IDENTITY_QUAT, quatFromAxisAngle } from './transform.js';

const ROOT_ID = 'root';
const SUN_ID = 'sun';
const FILL_ID = 'fill';

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

	// Legacy SUN_POS ≈ (10000, 0, 0): light direction toward surface is +X.
	nodes.set(SUN_ID, {
		id: SUN_ID,
		name: 'Sun',
		parentId: ROOT_ID,
		kind: 'directional_light',
		transform: { position: [0, 0, 0], rotation: IDENTITY_QUAT },
		color: [1.0, 0.95, 0.85],
		intensity: 3.5
	});

	// Fill light opposite-ish on the ecliptic (~120° around Y).
	nodes.set(FILL_ID, {
		id: FILL_ID,
		name: 'Fill',
		parentId: ROOT_ID,
		kind: 'directional_light',
		transform: {
			position: [0, 0, 0],
			rotation: quatFromAxisAngle([0, 1, 0], (2 * Math.PI) / 3)
		},
		color: [0.55, 0.65, 0.9],
		intensity: 0.35
	});

	return { rootId: ROOT_ID, nodes };
}

export const DEFAULT_AMBIENT: [number, number, number] = [0.04, 0.045, 0.055];
