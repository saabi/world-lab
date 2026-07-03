/** Pipeline nodes with no standalone WGSL — honest structural markers (no empty fn stubs). */

export const GEOMETRY_FULLSCREEN_PLANE_SOURCE = `/*---
id: geometry.fullscreenPlane
entry: fullscreenPlane
category: Pipeline
---*/
// Alias of geometry.plane at resU/resV = 2 — see geometry.plane for WGSL.
// (no WGSL — structural node)`;

export const BUFFER_PERSIST_SOURCE = `/*---
id: buffer.persist
entry: persistGeometry
category: Pipeline
---*/
// (no WGSL — structural node)`;

export const STAGE_FRAGMENT_SOURCE = `/*---
id: stage.fragment
entry: fragmentStage
category: Pipeline
---*/
// Fragment stage is assembled from the wired field subgraph at link time.
// (no WGSL — structural node)`;

export const TARGET_DISPLAY_SOURCE = `/*---
id: target.display
entry: displayTarget
category: Pipeline
---*/
// (no WGSL — structural node)`;

export const TARGET_MESH_SOURCE = `/*---
id: target.mesh
entry: meshTarget
category: Pipeline
---*/
// (no WGSL — structural node)`;

export const GEOMETRY_FULLSCREEN_PLANE_MODULE = {
	id: 'geometry.fullscreenPlane',
	source: GEOMETRY_FULLSCREEN_PLANE_SOURCE
} as const;

export const BUFFER_PERSIST_MODULE = {
	id: 'buffer.persist',
	source: BUFFER_PERSIST_SOURCE
} as const;

export const STAGE_FRAGMENT_MODULE = {
	id: 'stage.fragment',
	source: STAGE_FRAGMENT_SOURCE
} as const;

export const TARGET_DISPLAY_MODULE = {
	id: 'target.display',
	source: TARGET_DISPLAY_SOURCE
} as const;

export const TARGET_MESH_MODULE = {
	id: 'target.mesh',
	source: TARGET_MESH_SOURCE
} as const;
