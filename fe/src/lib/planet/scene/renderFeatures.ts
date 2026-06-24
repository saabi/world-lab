import { resolveBodyAtmosphere } from './bodyAtmosphere.js';
import type { BodyNode, PlanetScene, SceneNode } from './types.js';
import type { SceneViewportPrefs } from './viewportPrefs.js';

export interface RenderFeatureDescriptor {
	id: string;
	label: string;
	globalKey: string;
	matches: (node: SceneNode) => boolean;
}

/** Registry of derived render overlays not covered by schema bulk metadata alone. */
export const RENDER_FEATURES: RenderFeatureDescriptor[] = [
	{
		id: 'orbitPath',
		label: 'Orbit paths',
		globalKey: 'orbitPaths',
		matches: (node) => node.driver?.type === 'kepler' || node.orbit != null
	}
];

/** Walk parent chain: is `ancestorId` on the path from `nodeId` to the root (inclusive)? */
export function isAncestorOrSelf(
	scene: PlanetScene,
	ancestorId: string,
	nodeId: string
): boolean {
	let cur: string | null = nodeId;
	while (cur) {
		if (cur === ancestorId) return true;
		cur = scene.nodes.get(cur)?.parentId ?? null;
	}
	return false;
}

export function resolveAtmosphereVisible(
	body: BodyNode,
	prefs: SceneViewportPrefs | undefined
): boolean {
	if (prefs && !prefs.overlays.showAtmospheres) return false;
	return resolveBodyAtmosphere(body).enabled;
}

export function resolveOrbitPathVisible(
	keplerNode: SceneNode,
	prefs: SceneViewportPrefs | undefined,
	selectedId: string | null,
	scene: PlanetScene,
	/** When true (camera framed on the whole system), show every orbit even in "selected" mode. */
	systemView = false
): boolean {
	const mode = prefs?.overlays.orbitPaths ?? 'all';
	if (mode === 'off') return false;
	if (keplerNode.display?.orbitPath === false) return false;

	if (mode === 'all') return true;

	if (systemView) return true;

	// selected + zoomed in: draw if kepler node is selected, or is an ancestor of the selection.
	if (!selectedId) return false;
	if (keplerNode.id === selectedId) return true;
	return isAncestorOrSelf(scene, keplerNode.id, selectedId);
}

/** True when the camera is far enough to see the full system (not zoomed on one body). */
export function orbitPathSystemView(cameraDistance: number, systemSpan: number): boolean {
	return cameraDistance > systemSpan * 1.15;
}
