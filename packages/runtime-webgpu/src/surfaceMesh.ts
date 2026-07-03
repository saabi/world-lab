import '@world-lab/graph';

export type { GeneratedMesh, LegacySurfaceId, MeshGenRequest } from './consumers/meshGen.js';
export {
	buildCubeSphereMeshGenGraph,
	buildDecomposedCubeSphereMeshGenGraph,
	buildMeshIndices,
	buildPlaneMeshGenGraph,
	evaluateMeshGenCpu,
	executeMeshGen,
	meshGenRequestForLegacySurface,
	assembleMeshGenShader
} from './consumers/meshGen.js';

import { evaluateMeshGenCpu, meshGenRequestForLegacySurface, type GeneratedMesh, type LegacySurfaceId } from './consumers/meshGen.js';

/** @deprecated Use `GeneratedMesh`. */
export type SurfaceMesh = GeneratedMesh;

/** @deprecated Use `LegacySurfaceId`. */
export type SurfacePrimitiveId = LegacySurfaceId;

/** Build a triangle mesh via the graph-driven mesh-gen CPU path. */
export function buildSurfaceMesh(surfaceId: LegacySurfaceId, gridSize = 16): GeneratedMesh {
	return evaluateMeshGenCpu(meshGenRequestForLegacySurface(surfaceId, gridSize));
}
