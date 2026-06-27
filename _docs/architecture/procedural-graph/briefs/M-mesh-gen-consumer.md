# Brief — Graph-driven mesh-generation consumer

**Type:** core capability (audit corollary gap — see
[design-vs-implementation-audit.md](../design-vs-implementation-audit.md)) ·
**Packages:** `@virtual-planet/runtime-webgpu` (mesh-gen consumer),
`@virtual-planet/graph-editor` (previews migrate) · **Depends on:** M11.1 ✅
(surface-mapping nodes), **M-multi-output-compile** (consumer-stage model), and
**M-stage-entrypoints** (compute entry + bind-group layout) · **Design authority:**
[runtime-and-tessellation.md](../runtime-and-tessellation.md),
[inputs-cpu-and-resources.md](../inputs-cpu-and-resources.md) · **Contract author:**
Opus · **Recommended executor:** Cursor (⚠ has a visual gate).

## Objective

Make tessellation **graph-driven**, not hardcoded. A mesh is generated from *any*
surface-mapping node or composition (`uv (+faceId) → position, normal`) via a
**mesh-generation consumer** (compute stage emitting vertex/index buffers). This is the
canonical compute-output consumer the architecture was designed around. The plane and
cube-sphere previews become **thin clients** of it; adding a new surface (cylinder, ring,
warped patch…) needs **no new TypeScript** — just a graph.

Replaces the hardcoded `runtime-webgpu/surfaceMesh.ts::buildSurfaceMesh`
(`SurfacePrimitiveId = 'surface.plane' | 'surface.cubeSphere'` + CPU uv-grid loop).

## Public surface (`runtime-webgpu`)

```ts
// packages/runtime-webgpu/src/consumers/meshGen.ts  (new)
import type { GraphDocument, PortRef } from '@virtual-planet/graph';

export interface MeshGenRequest {
	graph: GraphDocument;
	/** Outputs of the surface-mapping subgraph (must be vec3f). */
	position: PortRef;
	normal?: PortRef;
	/** Tessellation grid resolution per face. */
	gridSize: number;
	/** Number of faces to sweep (1 = plane/single patch, 6 = cube). The faceId input
	    is fed 0..faceCount-1; surfaces that ignore it (plane) use faceCount 1. */
	faceCount: number;
}

export interface GeneratedMesh {
	positions: Float32Array; // xyz per vertex
	normals: Float32Array;
	indices: Uint32Array;
	vertexCount: number;
	indexCount: number;
}

/** GPU compute path: bounded by navigator.gpu; the contract is the same shape as the
    CPU reference so previews/tests can compare. */
export function executeMeshGen(device: GPUDevice, req: MeshGenRequest): Promise<GeneratedMesh>;

/** CPU reference (parity + headless preview), driven by the graph's evalCPU — NOT
    hardcoded to specific surface ids. */
export function evaluateMeshGenCpu(req: MeshGenRequest): GeneratedMesh;
```

`evaluateMeshGenCpu` evaluates the **graph** (via the runtime's existing
graph-eval over `position`/`normal` outputs, the same machinery the scalar/vec3 previews
use) at each `(uv, faceId)` — so it works for any surface-mapping subgraph, not a baked
id list. `executeMeshGen` does the same on GPU via a compute pass that runs the
`compileGraph`-produced **mesh-gen consumer** shader (from M-multi-output-compile +
stage-entrypoints) writing into vertex/index storage buffers.

## Migration

- `surfaceMesh.ts::buildSurfaceMesh` → reimplement as a thin wrapper that builds a
  minimal graph from a `surface.*` node and calls `evaluateMeshGenCpu` (keep its current
  callers working), **or** update callers directly. Remove the hardcoded
  `SurfacePrimitiveId` union and face-count map.
- `graph-editor` cube-sphere/plane mesh preview → consume `executeMeshGen`
  (GPU) / `evaluateMeshGenCpu` (fallback) over the graph's current surface node, not
  `buildSurfaceMesh`. Keep `graph-editor` scene-free.

## Gate

1. **CPU parity / generality:** `evaluateMeshGenCpu` over a graph whose surface node is
   `surface.cubeSphere` reproduces the old `buildSurfaceMesh('surface.cubeSphere')`
   vertex positions (within 1e-6); and over a **composition** (e.g. a surface mapping fed
   through a displacement node) produces a correspondingly displaced mesh — proving it is
   graph-driven, not id-switched.
2. **GPU:** `executeMeshGen` returns buffers matching the CPU reference when a device is
   present; **skips cleanly** headless (existing pattern).
3. `npm run check`/`test -w @virtual-planet/runtime-webgpu` + `-w @virtual-planet/graph-editor`
   (sceneFree green) + `npm run check -w fe`.
4. **Manual ⚠:** in the editor, plane and cube-sphere still render; switching the surface
   node changes the mesh — now via the graph path.

## Out of scope

LOD/patch subdivision + frustum-scheduled streaming (M11.2 cull exists; the scheduler
that picks patch levels is later). Terrain displacement primitives (separate). Removing
the previews (they stay, just re-pointed). **No AST; no new public exports beyond above.**

## Handoff

→ Tessellation is now a graph capability. Next surface types (cylinder, ring, asteroid
patch) are added as `surface.*` primitives with **zero** runtime/preview changes — the
generic test of the design. Then patch-LOD scheduling (consumes M11.2 cull) is the
remaining tessellation piece.
