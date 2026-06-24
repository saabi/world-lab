import { len3, sub3, type Vec3 } from '../math/vec.js';
import { getWorldTransform, listBodies } from '../scene/sceneTree.js';
import type { PlanetScene } from '../scene/types.js';
import type { BodyGravitySource } from './types.js';

const DEFAULT_GRAVITY_G = 9.8;

export function bodyGravitySource(
	scene: PlanetScene,
	bodyId: string,
	gravityG = DEFAULT_GRAVITY_G
): BodyGravitySource | null {
	const node = scene.nodes.get(bodyId);
	if (!node || node.kind !== 'body') return null;
	const center = getWorldTransform(scene, bodyId).position;
	return {
		bodyId,
		center: [...center] as Vec3,
		radiusMeters: node.radiusMeters,
		gravityG
	};
}

/** Nearest body center to the ship (stars/planets/moons). */
export function nearestBody(
	scene: PlanetScene,
	shipPosition: Vec3,
	gravityG = DEFAULT_GRAVITY_G
): BodyGravitySource | null {
	let best: BodyGravitySource | null = null;
	let bestDist = Infinity;
	for (const body of listBodies(scene)) {
		const center = getWorldTransform(scene, body.id).position;
		const rel = sub3(shipPosition, center);
		const d = len3(rel);
		if (d < bestDist) {
			bestDist = d;
			best = {
				bodyId: body.id,
				center: [...center] as Vec3,
				radiusMeters: body.radiusMeters,
				gravityG
			};
		}
	}
	return best;
}

export function pickDominantBody(
	scene: PlanetScene,
	shipPosition: Vec3,
	targetBodyId: string | null,
	gravityG = DEFAULT_GRAVITY_G
): BodyGravitySource | null {
	if (targetBodyId) {
		return bodyGravitySource(scene, targetBodyId, gravityG);
	}
	return nearestBody(scene, shipPosition, gravityG);
}
