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
export * from './ports.js';
export * from './paramInputs.js';
export * from './contract.js';
export {
	HASH12_PARITY,
	HASH22_PARITY,
	HASH32_PARITY,
	NOISE2D_CPU_PARITY
} from './primitives/noise/parityFixtures.js';
export { COLORLAB_CPU_PARITY } from './primitives/color/parityFixtures.js';

import './primitives/index.js';
