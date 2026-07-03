// @world-lab/runtime-cpu — CPU runtime: camera frustum, pointer/picking, resource sampling, CPU primitive evaluation.
//
// M0 scaffold (see _docs/architecture/procedural-graph/implementation-plan.md).
// Generic CPU services + evalCPU host; shared by editor, headless tests, and the planet app.

/** Package identity marker. */
export const RUNTIME_CPU_PACKAGE = '@world-lab/runtime-cpu' as const;

export * from './camera.js';
export * from './frustumCull.js';
export * from './resources.js';
export * from './vegetation.js';
export * from './evalGraph.js';
export * from './coercion.js';
