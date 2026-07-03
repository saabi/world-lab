// @world-lab/graph-editor — Reusable Svelte graph-editor components over the Typed Graph IR (no renderer logic).
//
// M0 scaffold (see _docs/architecture/procedural-graph/implementation-plan.md).
// Edits the Graph IR; canonical save is IR JSON, Svelte is an export/optional-import projection.

/** Package identity marker. */
export const GRAPH_EDITOR_PACKAGE = '@world-lab/graph-editor' as const;

export * from './types.js';
export * from './irAdapter.js';
export * from './portBindings.js';
export * from './defaultGraph.js';
export * from './documentStorage.js';
export * from './markup/printGraph.js';
export * from './markup/parseGraphMarkup.js';
export * from './primitiveEditor.js';
export * from './primitiveSources.js';
export * from './groupResolver.js';
