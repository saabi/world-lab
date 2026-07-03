// @world-lab/compiler — Graph compiler: dependency slicing, WGSL codegen, module resolution, shader linking.
//
// M0 scaffold (see _docs/architecture/procedural-graph/implementation-plan.md).
// Consumes @world-lab/graph; emits per-consumer WGSL.

/** Package identity marker. */
export const COMPILER_PACKAGE = '@world-lab/compiler' as const;

export * from './slice.js';
export * from './codegen.js';
export * from './linker.js';
export * from './primitiveLoader.js';
export * from './compileGraph.js';
export * from './stageEntry.js';
export * from './groupCodegen.js';
export * from './coercion.js';
