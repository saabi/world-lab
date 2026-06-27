// @virtual-planet/runtime-webgpu — WebGPU runtime: buffers, pipelines, bind groups, consumers, tessellation scheduling.
//
// M0 scaffold (see _docs/architecture/procedural-graph/implementation-plan.md).
// Executes compiled graphs on the GPU; scheduling consumes runtime-cpu frustum.

/** Package identity marker. */
export const RUNTIME_WEBGPU_PACKAGE = '@virtual-planet/runtime-webgpu' as const;

export * from './types.js';
export * from './buffers.js';
export * from './device.js';
export * from './moduleResolver.js';
export * from './emitGraphEval.js';
export { emitGraphVec3Eval } from './emitGraphVec3Eval.js';
export * from './consumers/planeScalarPreview.js';
export * from './consumers/surfaceMeshPreview.js';
export * from './surfaceMesh.js';
