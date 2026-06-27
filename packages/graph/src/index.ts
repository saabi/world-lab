// @virtual-planet/graph — Typed Graph IR: nodes, ports (data + coordinate-space), validation, serialization.
//
// M0 scaffold (see _docs/architecture/procedural-graph/implementation-plan.md).
// Foundation for the procedural graph; built on @virtual-planet/schema (TypeBox).

/** Package identity marker. */
export const GRAPH_PACKAGE = '@virtual-planet/graph' as const;

export * from './types.js';
export * from './validate.js';
export * from './serialize.js';
export * from './primitive.js';
export * from './registry.js';

import './primitives/index.js';
