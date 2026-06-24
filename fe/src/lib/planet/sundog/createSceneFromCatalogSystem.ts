import type { BodyNode, PlanetScene, SceneNode } from '../scene/types.js';
import { IDENTITY_QUAT } from '../scene/transform.js';
import { DEFAULT_AMBIENT } from '../scene/defaults.js';
import type { PlanetPresetName } from '../params/presets.js';
import type { SunDogBody, SunDogSystem } from './catalogTypes.js';

// Build a renderable PlanetScene from a SunDog catalog system, reusing the exact
// composable-orbit primitives the toy preset uses (orbit container with a kepler
// driver + inertial frame → phase rotate → radius translate → body). The star
// sits at the system centre; each planet orbits it. Render params map to the
// body (radius, appearance preset); game params stay in the catalog.
// See _docs/specs/sundog-legacy-solar-system-spec.md and scene/solarSystem.ts.

/** Scene root id (single active system, matching the /scene route's convention). */
export const SYSTEM_ROOT_ID = 'solar-system';

// Physical constants → scene units (metres). Real magnitudes; the 3D viewport's
// dot-LOD keeps distant bodies visible and frameAll() fits the system.
const AU = 1.495978707e11;
const SUN_RADIUS_M = 6.957e8;
const EARTH_RADIUS_M = 6.371e6;
// Scene-time compression so orbits/spins animate at a watchable rate: one
// scene-second per game-day (period) / game-hour (spin). Real values stay in the
// catalog; these only drive the kinematic animation.
const SECONDS_PER_GAME_DAY = 1;
const SECONDS_PER_GAME_HOUR = 1;

const FALLBACK_ORBIT_AU = 1;
const FALLBACK_PERIOD_DAYS = 365;
const FALLBACK_SIZE_REL = 1;
const FALLBACK_STAR_RADIUS_SOLAR = 1;

const TERRAIN_PRESET: Record<string, PlanetPresetName> = {
	Terran: 'normie',
	Jungle: 'archipelago',
	Desert: 'desert',
	Ice: 'frozen',
	Regolith: 'craters'
};

/** Map a SunDog terrain class to the closest procedural preset. */
export function terrainToPreset(terrain: string | null): PlanetPresetName {
	if (!terrain) return 'normie';
	return TERRAIN_PRESET[terrain] ?? 'normie';
}

function identityTransform() {
	return { position: [0, 0, 0] as [number, number, number], rotation: IDENTITY_QUAT };
}

/**
 * Append an orbiting planet (orbit container → phase → radius → body) under
 * `centerId`, with deterministic ids derived from `bodyId`. Mirrors the
 * `orbiting()` helper in scene/solarSystem.ts.
 */
function addOrbitingBody(
	nodes: Map<string, SceneNode>,
	bodyId: string,
	body: SunDogBody,
	centerId: string,
	phaseAtEpoch: number
): void {
	const add = (n: SceneNode) => nodes.set(n.id, n);
	const orbitRadius = (body.render.orbit.distanceToStarAu ?? FALLBACK_ORBIT_AU) * AU;
	const periodSeconds =
		(body.render.orbit.orbitPeriodDays ?? FALLBACK_PERIOD_DAYS) * SECONDS_PER_GAME_DAY;
	const spinSeconds = (body.render.orbit.dayRotationHours ?? 24) * SECONDS_PER_GAME_HOUR;
	const radiusMeters = (body.render.planetSizeRel ?? FALLBACK_SIZE_REL) * EARTH_RADIUS_M;

	add({
		id: `${bodyId}-orbit`,
		name: `${body.name} orbit`,
		parentId: centerId,
		kind: 'group',
		enabled: true,
		transform: identityTransform(),
		driver: {
			type: 'kepler',
			semiMajorAxis: orbitRadius,
			eccentricity: 0,
			periodSeconds,
			phaseAtEpoch,
			periapsisAngle: 0
		},
		inheritance: { position: '../', rotation: '/', scale: '../' }
	});
	add({
		id: `${bodyId}-phase`,
		name: `${body.name} phase`,
		parentId: `${bodyId}-orbit`,
		kind: 'group',
		enabled: true,
		transform: identityTransform(),
		bindings: [{ field: 'rotationY', source: { ref: '..', output: 'phase' } }]
	});
	add({
		id: `${bodyId}-radius`,
		name: `${body.name} radius`,
		parentId: `${bodyId}-phase`,
		kind: 'group',
		enabled: true,
		transform: identityTransform(),
		bindings: [{ field: 'positionX', source: { ref: '../..', output: 'radius' } }]
	});
	add({
		id: bodyId,
		name: body.name,
		parentId: `${bodyId}-radius`,
		kind: 'body',
		enabled: true,
		transform: identityTransform(),
		bodyType: 'planet',
		radiusMeters,
		standIn: false,
		spinPeriodSeconds: spinSeconds,
		appearance: { preset: terrainToPreset(body.render.terrain) }
	} as BodyNode);
}

/** Build a single-system PlanetScene from a SunDog catalog system. */
export function createSceneFromCatalogSystem(system: SunDogSystem): PlanetScene {
	const nodes = new Map<string, SceneNode>();
	const add = (n: SceneNode) => nodes.set(n.id, n);
	const starId = `${system.id}-star`;

	add({
		id: SYSTEM_ROOT_ID,
		name: `${system.name} System`,
		parentId: null,
		kind: 'group',
		enabled: true,
		transform: identityTransform()
	});
	add({
		id: 'ss-ambient',
		name: 'Ambient',
		parentId: SYSTEM_ROOT_ID,
		kind: 'ambient_light',
		enabled: true,
		transform: identityTransform(),
		color: [...DEFAULT_AMBIENT],
		intensity: 1
	});

	// The star at the system centre (stand-in — no star designer facilities yet).
	add({
		id: starId,
		name: system.name,
		parentId: SYSTEM_ROOT_ID,
		kind: 'body',
		enabled: true,
		transform: identityTransform(),
		bodyType: 'star',
		radiusMeters: (system.star.radiusSolar ?? FALLBACK_STAR_RADIUS_SOLAR) * SUN_RADIUS_M,
		standIn: true
	} as BodyNode);
	// Starlight: a point light at the star so every planet is lit radially.
	add({
		id: 'ss-starlight',
		name: 'Starlight',
		parentId: starId,
		kind: 'point_light',
		enabled: true,
		transform: identityTransform(),
		color: [1.0, 0.95, 0.85],
		intensity: 3.5,
		range: 1e13,
		affects: null
	});

	const n = system.bodies.length;
	system.bodies.forEach((body, i) => {
		const phase = n > 0 ? (i / n) * Math.PI * 2 : 0;
		addOrbitingBody(nodes, body.id, body, starId, phase);
	});

	return { rootId: SYSTEM_ROOT_ID, nodes };
}
