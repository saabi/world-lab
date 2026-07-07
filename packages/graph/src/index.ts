// @world-lab/graph — Typed Graph IR: nodes, ports (data + coordinate-space), validation, serialization.
//
// M0 scaffold (see _docs/architecture/procedural-graph/implementation-plan.md).
// Foundation for the procedural graph; built on @world-lab/schema (TypeBox).

/** Package identity marker. */
export const GRAPH_PACKAGE = '@world-lab/graph' as const;

export * from './types.js';
export * from './validate.js';
export * from './serialize.js';
export * from './primitive.js';
export * from './registry.js';
export * from './ports.js';
export * from './dataType.js';
export * from './semantics.js';
export * from './coercion.js';
export * from './implementation.js';
export * from './resources.js';
export * from './kernelBinding.js';
export * from './graphIds.js';
export * from './pipelineGeometry.js';
export * from './executionRoots.js';
export * from './migrate.js';
export {
	FIELD_PREVIEW_SINK_DEFINITION,
	LEGACY_CONSUMER_SINK_DEFINITION,
	type FieldPreviewSinkPayload,
	type LegacyConsumerSinkPayload
} from './primitives/pipeline/compatibilitySinks.js';
export * from './portDefaults.js';
export * from './paramInputs.js';
export * from './contract.js';
export * from './portMatch.js';
export {
	PIPELINE_IMAGE_OUTPUT_NAME,
	derivePipelineConsumers,
	derivePipelinePresentations,
	effectiveConsumers,
	effectiveGraphDocument,
	effectiveOutputs,
	isPipelineTarget,
	outputSinkNodeIds,
	pipelineFieldOutput,
	tryPipelinePresentation,
	type PipelinePresentation
} from './pipeline.js';
export { deriveMeshTargets, isMeshTarget, type MeshTargetDescriptor } from './meshTarget.js';
export {
	deriveBufferFeedbackTarget,
	isBufferFeedbackTarget,
	type BufferFeedbackTargetDescriptor
} from './bufferFeedbackTarget.js';
export {
	HASH12_PARITY,
	HASH22_PARITY,
	HASH32_PARITY,
	NOISE2D_CPU_PARITY
} from './primitives/noise/parityFixtures.js';
export { COLORLAB_CPU_PARITY } from './primitives/color/parityFixtures.js';
export { PLANET_SPACES } from './primitives/terrain/spaces.js';
export {
	DEFAULT_PLANE_GRID_TRANSFORM,
	planeGridEulerRotate,
	planeGridMeshPositions,
	planeGridPosition,
	planeGridVertexCount,
	type PlaneGridTransform
} from './primitives/pipeline/planeGrid.js';

import './primitives/index.js';
