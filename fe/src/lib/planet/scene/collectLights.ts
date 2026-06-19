import type { Vec3 } from '../math/vec.js';
import { visitScene, isNodeEnabled } from './sceneTree.js';
import { worldPositiveX } from './transform.js';
import type { CollectedLighting, PlanetScene, SceneLight } from './types.js';

const ZERO_AMBIENT: Vec3 = [0, 0, 0];

/** Walk the scene tree and collect world-space lights + ambient for GPU upload. */
export function collectSceneLights(scene: PlanetScene): CollectedLighting {
	const lights: SceneLight[] = [];
	const ambient: Vec3 = [0, 0, 0];

	visitScene(scene, (node, world) => {
		if (!isNodeEnabled(scene, node.id)) return;
		if (node.kind === 'ambient_light') {
			ambient[0] += node.color[0] * node.intensity;
			ambient[1] += node.color[1] * node.intensity;
			ambient[2] += node.color[2] * node.intensity;
		} else if (node.kind === 'directional_light') {
			lights.push({
				kind: 'directional',
				directionOrPosition: worldPositiveX(world),
				color: node.color,
				intensity: node.intensity,
				range: 0
			});
		} else if (node.kind === 'point_light') {
			lights.push({
				kind: 'point',
				directionOrPosition: world.position,
				color: node.color,
				intensity: node.intensity,
				range: node.range
			});
		}
	});

	const hasAmbient = ambient[0] > 0 || ambient[1] > 0 || ambient[2] > 0;
	return { ambient: hasAmbient ? ambient : ZERO_AMBIENT, lights };
}

/** Collected lighting for GPU upload; skips scene when editor illumination is off. */
export function collectSceneLighting(
	scene: PlanetScene,
	illuminationOn: boolean
): CollectedLighting {
	if (!illuminationOn) {
		return { ambient: [0, 0, 0], lights: [] };
	}
	return collectSceneLights(scene);
}

/**
 * Selective illumination: collect the lights that illuminate one body. Includes
 * ambient (environmental) and every enabled light that is global (`affects` null)
 * or scoped to `bodyId`. A scoped light — e.g. a moon's reflected light bound to
 * its parent planet — never contributes to any other body. See
 * _docs/specs/solar-system-scene.md.
 */
export function collectLightsForBody(scene: PlanetScene, bodyId: string): CollectedLighting {
	const lights: SceneLight[] = [];
	const ambient: Vec3 = [0, 0, 0];

	visitScene(scene, (node, world) => {
		if (!isNodeEnabled(scene, node.id)) return;
		if (node.kind === 'ambient_light') {
			ambient[0] += node.color[0] * node.intensity;
			ambient[1] += node.color[1] * node.intensity;
			ambient[2] += node.color[2] * node.intensity;
		} else if (node.kind === 'directional_light') {
			if (node.affects != null && node.affects !== bodyId) return;
			lights.push({
				kind: 'directional',
				directionOrPosition: worldPositiveX(world),
				color: node.color,
				intensity: node.intensity,
				range: 0
			});
		} else if (node.kind === 'point_light') {
			if (node.affects != null && node.affects !== bodyId) return;
			lights.push({
				kind: 'point',
				directionOrPosition: world.position,
				color: node.color,
				intensity: node.intensity,
				range: node.range
			});
		}
	});

	const hasAmbient = ambient[0] > 0 || ambient[1] > 0 || ambient[2] > 0;
	return { ambient: hasAmbient ? ambient : ZERO_AMBIENT, lights };
}
