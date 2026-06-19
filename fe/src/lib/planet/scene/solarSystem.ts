import type { Vec3 } from '../math/vec.js';
import type { BodyType, PlanetScene, SceneNode } from './types.js';
import { IDENTITY_QUAT } from './transform.js';
import { DEFAULT_AMBIENT } from './defaults.js';

// Toy solar system preset. Small bodies: rocky planets 400-600 km radius (~1/12
// Earth), everything else sized to match. Orbit ownership is the hierarchy (moons
// are children of their planet, planets children of the star). Positions are a
// static toy layout for now — orbital elements + animation come later. The moon
// reflection lights are disabled placeholders scoped to their parent planet,
// proving the selective-illumination model without simulating reflection yet.
// See _docs/specs/solar-system-scene.md.

const KM = 1000; // meters per kilometer

export const TOY_SOLAR_SYSTEM_ROOT_ID = 'solar-system';

export function createToySolarSystemScene(): PlanetScene {
	const nodes = new Map<string, SceneNode>();

	const add = (node: SceneNode) => nodes.set(node.id, node);
	const at = (xKm: number): Vec3 => [xKm * KM, 0, 0];

	const body = (
		id: string,
		name: string,
		parentId: string,
		bodyType: BodyType,
		radiusKm: number,
		positionKm: number,
		standIn = false
	) =>
		add({
			id,
			name,
			parentId,
			kind: 'body',
			enabled: true,
			transform: { position: at(positionKm), rotation: IDENTITY_QUAT },
			bodyType,
			radiusMeters: radiusKm * KM,
			standIn
		});

	/** Disabled placeholder for a moon's future reflected light, scoped to its planet. */
	const reflection = (id: string, name: string, moonId: string, planetId: string) =>
		add({
			id,
			name,
			parentId: moonId,
			kind: 'directional_light',
			enabled: false,
			transform: { position: [0, 0, 0], rotation: IDENTITY_QUAT },
			color: [0.7, 0.72, 0.8],
			intensity: 0.1,
			affects: planetId
		});

	add({
		id: TOY_SOLAR_SYSTEM_ROOT_ID,
		name: 'Solar System',
		parentId: null,
		kind: 'group',
		enabled: true,
		transform: { position: [0, 0, 0], rotation: IDENTITY_QUAT }
	});

	add({
		id: 'ss-ambient',
		name: 'Ambient',
		parentId: TOY_SOLAR_SYSTEM_ROOT_ID,
		kind: 'ambient_light',
		enabled: true,
		transform: { position: [0, 0, 0], rotation: IDENTITY_QUAT },
		color: [...DEFAULT_AMBIENT],
		intensity: 1
	});

	// Global starlight (directional for now; a point source at the star is a later
	// refinement once multi-body rendering needs per-body light directions).
	add({
		id: 'ss-starlight',
		name: 'Starlight',
		parentId: TOY_SOLAR_SYSTEM_ROOT_ID,
		kind: 'directional_light',
		enabled: true,
		transform: { position: [0, 0, 0], rotation: IDENTITY_QUAT },
		color: [1.0, 0.95, 0.85],
		intensity: 3.5,
		affects: null
	});

	// Star (stand-in — no star designer facilities yet).
	body('ss-sol', 'Sol', TOY_SOLAR_SYSTEM_ROOT_ID, 'star', 50_000, 0, true);

	// Rocky planets orbit the star (owns their orbit).
	body('ss-ferro', 'Ferro', 'ss-sol', 'planet', 500, 10_000);
	body('ss-luna-f', 'Luna-F', 'ss-ferro', 'moon', 120, 600);
	reflection('ss-luna-f-reflect', 'Luna-F reflection', 'ss-luna-f', 'ss-ferro');

	body('ss-cerule', 'Cerule', 'ss-sol', 'planet', 450, 20_000);

	body('ss-ochre', 'Ochre', 'ss-sol', 'planet', 600, 35_000);
	body('ss-pebble', 'Pebble', 'ss-ochre', 'moon', 90, 700);
	reflection('ss-pebble-reflect', 'Pebble reflection', 'ss-pebble', 'ss-ochre');
	body('ss-cobble', 'Cobble', 'ss-ochre', 'moon', 70, 1_100);

	// Gas giant (stand-in) with a moon.
	body('ss-tempest', 'Tempest', 'ss-sol', 'gas_giant', 7_000, 60_000, true);
	body('ss-gale', 'Gale', 'ss-tempest', 'moon', 200, 9_000);
	reflection('ss-gale-reflect', 'Gale reflection', 'ss-gale', 'ss-tempest');

	return { rootId: TOY_SOLAR_SYSTEM_ROOT_ID, nodes };
}
