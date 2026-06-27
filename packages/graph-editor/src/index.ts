// @virtual-planet/graph-editor — Reusable Svelte graph-editor components over the Typed Graph IR (no renderer logic).
//
// M0 scaffold (see _docs/architecture/procedural-graph/implementation-plan.md).
// Edits the Graph IR; canonical save is IR JSON, Svelte is an export/optional-import projection.

/** Package identity marker. */
export const GRAPH_EDITOR_PACKAGE = '@virtual-planet/graph-editor' as const;

export * from './types.js';
export * from './irAdapter.js';
export * from './portBindings.js';
export * from './defaultGraph.js';
