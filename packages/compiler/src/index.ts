// @virtual-planet/compiler — Graph compiler: dependency slicing, WGSL codegen, module resolution, shader linking.
//
// M0 scaffold (see _docs/architecture/procedural-graph/implementation-plan.md).
// Consumes @virtual-planet/graph; emits per-consumer WGSL.

/** Package identity marker. */
export const COMPILER_PACKAGE = '@virtual-planet/compiler' as const;

export * from './slice.js';
