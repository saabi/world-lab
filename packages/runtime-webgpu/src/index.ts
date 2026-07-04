// @world-lab/runtime-webgpu — WebGPU runtime: buffers, pipelines, bind groups, consumers, tessellation scheduling.
//
// M0 scaffold (see _docs/architecture/procedural-graph/implementation-plan.md).
// Executes compiled graphs on the GPU; scheduling consumes runtime-cpu frustum.

/** Package identity marker. */
export const RUNTIME_WEBGPU_PACKAGE = '@world-lab/runtime-webgpu' as const;

export * from './types.js';
export * from './buffers.js';
export * from './device.js';
export * from './moduleResolver.js';
export * from './emitGraphEval.js';
export { emitGraphVec3Eval } from './emitGraphVec3Eval.js';
export * from './consumers/meshGen.js';
export * from './consumers/planeScalarPreview.js';
export * from './consumers/surfaceMeshPreview.js';
export * from './consumers/instancedMeshDraw.js';
export * from './consumers/vegetationCandidates.js';
export * from './consumers/vegetationPreview.js';
export * from './consumers/fullscreenFragment.js';
export * from './consumers/shadertoyUniforms.js';
export * from './pipelineGraph.js';
export * from './graphFramePlan.js';
export * from './graphFrameExecutor.js';
export * from './vegetationTypes.js';
export * from './vegetationBuffer.js';
export * from './surfaceMesh.js';
export * from './frameGraph/types.js';
export * from './frameGraph/order.js';
export * from './frameGraph/realize.js';
export * from './sinkHandlers.js';
