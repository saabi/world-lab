// @virtual-planet/runtime-cpu — CPU runtime: camera frustum, pointer/picking, resource sampling, CPU primitive evaluation.
//
// M0 scaffold (see _docs/architecture/procedural-graph/implementation-plan.md).
// Generic CPU services + evalCPU host; shared by editor, headless tests, and the planet app.

/** Package identity marker. */
export const RUNTIME_CPU_PACKAGE = '@virtual-planet/runtime-cpu' as const;

export * from './camera.js';
export * from './frustumCull.js';
export * from './resources.js';
export * from './evalGraph.js';
