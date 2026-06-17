import { DEFAULT_AMBIENT } from './defaults.js';
import { visitScene } from './sceneTree.js';
import { worldPositiveX } from './transform.js';
import type { CollectedLighting, PlanetScene, SceneLight } from './types.js';

/** Walk the scene tree and collect world-space lights for GPU upload. */
export function collectSceneLights(scene: PlanetScene): CollectedLighting {
	const lights: SceneLight[] = [];

	visitScene(scene, (node, world) => {
		if (node.kind === 'directional_light') {
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

	return { ambient: DEFAULT_AMBIENT, lights };
}
