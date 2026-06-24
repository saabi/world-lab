import type { BodyNode, PlanetScene, SceneNode } from '../scene/types.js';
import { IDENTITY_QUAT } from '../scene/transform.js';
import { DEFAULT_AMBIENT } from '../scene/defaults.js';
import type { SunDogSystem } from './catalogTypes.js';
import type { GalaxyLayout } from './galaxyLayout.js';

// The galaxy map is itself a PlanetScene: each SunDog system is a `star` body at
// its layout position. This reuses the existing WebGPU scene-tree renderer
// (SceneViewport3D / scene3d.SpherePass draws stars as emissive spheres, distant
// ones as dots, with orbit camera + picking) — no separate 3D dependency. The
// star node id encodes the system id so selection maps back to the catalog.
// See _docs/specs/sundog-legacy-solar-system-spec.md.

export const GALAXY_ROOT_ID = 'galaxy';
const STAR_NODE_PREFIX = 'sys-';

/** Base visible marker radius for a system star on the map (scene metres). */
const STAR_MARKER_BASE_M = 1.2e9;

/** Scene node id for a system's star marker. */
export function starNodeId(systemId: string): string {
	return `${STAR_NODE_PREFIX}${systemId}`;
}

/** Inverse of {@link starNodeId}: a star node id → its system id (else null). */
export function systemIdFromNode(nodeId: string | null | undefined): string | null {
	if (!nodeId || !nodeId.startsWith(STAR_NODE_PREFIX)) return null;
	return nodeId.slice(STAR_NODE_PREFIX.length);
}

function identityTransform() {
	return { position: [0, 0, 0] as [number, number, number], rotation: IDENTITY_QUAT };
}

/** Slightly scale the marker by the star's real size, clamped for legibility. */
function markerRadius(system: SunDogSystem): number {
	const rel = system.star.radiusSolar ?? 1;
	const clamped = Math.min(2.5, Math.max(0.6, rel));
	return STAR_MARKER_BASE_M * clamped;
}

/** Build the galaxy-map scene (a star per system) for the given layout. */
export function createGalaxyScene(systems: SunDogSystem[], layout: GalaxyLayout): PlanetScene {
	const nodes = new Map<string, SceneNode>();
	const add = (n: SceneNode) => nodes.set(n.id, n);

	add({
		id: GALAXY_ROOT_ID,
		name: 'Galaxy',
		parentId: null,
		kind: 'group',
		enabled: true,
		transform: identityTransform()
	});
	add({
		id: 'galaxy-ambient',
		name: 'Ambient',
		parentId: GALAXY_ROOT_ID,
		kind: 'ambient_light',
		enabled: true,
		transform: identityTransform(),
		color: [...DEFAULT_AMBIENT],
		intensity: 1
	});

	for (const system of systems) {
		const pos = layout.get(system.id) ?? [0, 0, 0];
		add({
			id: starNodeId(system.id),
			name: system.name,
			parentId: GALAXY_ROOT_ID,
			kind: 'body',
			enabled: true,
			transform: { position: [pos[0], pos[1], pos[2]], rotation: IDENTITY_QUAT },
			bodyType: 'star',
			radiusMeters: markerRadius(system),
			standIn: true
		} as BodyNode);
	}

	return { rootId: GALAXY_ROOT_ID, nodes };
}
