import type { BodyType, PlanetScene, SceneNode } from './types.js';
import { IDENTITY_QUAT } from './transform.js';
import { DEFAULT_AMBIENT } from './defaults.js';

// Toy solar system preset. Small bodies: rocky planets 400-600 km radius (~1/12
// Earth). Each orbit is composable primitives wired by a driver (no baked primitive):
//
//   <body>-orbit   group, kepler driver (a/e/period/phase) → outputs phase + radius;
//                  inheritance rotation:'/' establishes an inertial frame at the center
//     <body>-phase    group (rotate primitive), rotationY ← driver.phase
//       <body>-radius   group (translate primitive), positionX ← driver.radius
//         <body>          the body — spins only, sits at the orbital position
//
// The driver's two outputs feed two different dumb primitives by path (the rotate
// node and the translate node) — proven in driver.test.ts. The rotate+translate of
// the polar (phase, radius) reconstructs the Kepler ellipse with the focus at the
// center, so the central body at that origin sits at the focus. The translate node is
// the "system center": the body sits there and its moons' orbits attach to it, so
// moon-orbit and planet-spin are independent (siblings). Inserting a focus offset or
// an inclination is just another primitive in the chain. See _docs/specs/scene-routing.md.

const KM = 1000; // meters per kilometer

// The orbit container is an inertial frame at the center: position carried from the
// parent, but rotation resolves in world so a spinning/orbiting parent doesn't drag
// the orbit plane. The rotate/translate primitives below it inherit normally.
const ORBIT_INHERITANCE = { position: '../', rotation: '/', scale: '../' } as const;

export const TOY_SOLAR_SYSTEM_ROOT_ID = 'solar-system';

export function createToySolarSystemScene(): PlanetScene {
	const nodes = new Map<string, SceneNode>();
	const add = (node: SceneNode) => nodes.set(node.id, node);
	const id = (rotation = IDENTITY_QUAT) => ({ position: [0, 0, 0] as [number, number, number], rotation });

	/**
	 * Build an orbiting body from composable primitives: orbit container (kepler
	 * driver + inertial frame) → rotate (phase) → translate (radius) → body (spin),
	 * orbiting `centerId`. Returns the translate node id — the body's system center,
	 * where its moons attach. The body node keeps `id` (so ids stay stable).
	 */
	const orbiting = (
		bodyId: string,
		name: string,
		centerId: string,
		bodyType: BodyType,
		radiusKm: number,
		orbitRadiusKm: number,
		periodSeconds: number,
		phaseAtEpoch: number,
		spinPeriodSeconds: number,
		standIn = false,
		eccentricity = 0,
		periapsisAngle = 0
	): string => {
		// Orbit container: the driver + an inertial frame at the center.
		add({
			id: `${bodyId}-orbit`,
			name: `${name} orbit`,
			parentId: centerId,
			kind: 'group',
			enabled: true,
			transform: id(),
			driver: {
				type: 'kepler',
				semiMajorAxis: orbitRadiusKm * KM,
				eccentricity,
				periodSeconds,
				phaseAtEpoch,
				periapsisAngle
			},
			inheritance: { ...ORBIT_INHERITANCE }
		});
		// Rotate primitive: rotation about +Y = the orbital phase (driver is the parent).
		add({
			id: `${bodyId}-phase`,
			name: `${name} phase`,
			parentId: `${bodyId}-orbit`,
			kind: 'group',
			enabled: true,
			transform: id(),
			bindings: [{ field: 'rotationY', ref: '..', output: 'phase' }]
		});
		// Translate primitive: offset along +X = the orbital radius; the phase sweeps it.
		add({
			id: `${bodyId}-radius`,
			name: `${name} radius`,
			parentId: `${bodyId}-phase`,
			kind: 'group',
			enabled: true,
			transform: id(),
			bindings: [{ field: 'positionX', ref: '../..', output: 'radius' }]
		});
		add({
			id: bodyId,
			name,
			parentId: `${bodyId}-radius`,
			kind: 'body',
			enabled: true,
			transform: id(),
			bodyType,
			radiusMeters: radiusKm * KM,
			standIn,
			spinPeriodSeconds
		});
		return `${bodyId}-radius`;
	};

	/** Disabled placeholder for a moon's future reflected light, scoped to its planet. */
	const reflection = (id_: string, name: string, moonId: string, planetId: string) =>
		add({
			id: id_,
			name,
			parentId: moonId,
			kind: 'directional_light',
			enabled: false,
			transform: id(),
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
		transform: id()
	});
	add({
		id: 'ss-ambient',
		name: 'Ambient',
		parentId: TOY_SOLAR_SYSTEM_ROOT_ID,
		kind: 'ambient_light',
		enabled: true,
		transform: id(),
		color: [...DEFAULT_AMBIENT],
		intensity: 1
	});
	add({
		id: 'ss-starlight',
		name: 'Starlight',
		parentId: TOY_SOLAR_SYSTEM_ROOT_ID,
		kind: 'directional_light',
		enabled: true,
		transform: id(),
		color: [1.0, 0.95, 0.85],
		intensity: 3.5,
		affects: null
	});

	// Star at the system center (stand-in — no star designer facilities yet).
	add({
		id: 'ss-sol',
		name: 'Sol',
		parentId: TOY_SOLAR_SYSTEM_ROOT_ID,
		kind: 'body',
		enabled: true,
		transform: id(),
		bodyType: 'star',
		radiusMeters: 50_000 * KM,
		standIn: true
	});

	// Planets orbit Sol; moons orbit their planet's translate node (the system center).
	// A few orbits are eccentric (e, periapsisAngle) to exercise the kepler driver.
	orbiting('ss-ferro', 'Ferro', 'ss-sol', 'planet', 500, 10_000, 60, 0, 12);
	orbiting('ss-luna-f', 'Luna-F', 'ss-ferro-radius', 'moon', 120, 600, 9, 0.5, 9, false, 0.25);
	reflection('ss-luna-f-reflect', 'Luna-F reflection', 'ss-luna-f', 'ss-ferro');

	orbiting('ss-cerule', 'Cerule', 'ss-sol', 'planet', 450, 20_000, 170, 2.1, 18, false, 0.35, 0.5);

	orbiting('ss-ochre', 'Ochre', 'ss-sol', 'planet', 600, 35_000, 393, 4.2, 24, false, 0.2, 2.0);
	orbiting('ss-pebble', 'Pebble', 'ss-ochre-radius', 'moon', 90, 700, 11, 0, 11);
	reflection('ss-pebble-reflect', 'Pebble reflection', 'ss-pebble', 'ss-ochre');
	orbiting('ss-cobble', 'Cobble', 'ss-ochre-radius', 'moon', 70, 1_100, 20, 3.1, 20);

	orbiting('ss-tempest', 'Tempest', 'ss-sol', 'gas_giant', 7_000, 60_000, 882, 1.0, 30, true, 0.12);
	orbiting('ss-gale', 'Gale', 'ss-tempest-radius', 'moon', 200, 9_000, 40, 0, 40);
	reflection('ss-gale-reflect', 'Gale reflection', 'ss-gale', 'ss-tempest');

	return { rootId: TOY_SOLAR_SYSTEM_ROOT_ID, nodes };
}
