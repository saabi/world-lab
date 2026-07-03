# Brief — Graph-driven mesh-generation consumer

**Type:** core capability (audit corollary gap — see
[design-vs-implementation-audit.md](../design-vs-implementation-audit.md)) ·
**Packages:** `@world-lab/runtime-webgpu` (mesh-gen consumer), `@world-lab/graph` (new
`surface.cubeFace` primitive), `@world-lab/graph-editor` (previews migrate) ·
**Depends on:** M11.1 ✅ (surface-mapping nodes), **M-multi-output-compile** ✅ landed
(`302667f`, consumer-stage model), **M-stage-entrypoints** ✅ landed (`52334eb`, compute entry
+ bind-group layout) — **all three prerequisites now satisfied, this brief is unblocked** ·
**Design authority:** [runtime-and-tessellation.md](../runtime-and-tessellation.md),
[inputs-cpu-and-resources.md](../inputs-cpu-and-resources.md),
[node-model-design-notes.md §B](../node-model-design-notes.md#b-elemental-geometry--composable-transforms-decompose-cube-sphere)
· **Contract author:** Opus · **Recommended executor:** Cursor (⚠ has a visual gate) ·
**Status:** ready to route (package scope + prerequisite status updated 2026-07-03; this
brief predates the OS1 `@world-lab/*` rename and originally listed its two dependency briefs
as pending — both have since landed)

> **Scope note (unchanged from original):** this brief is **Mode B** (compute
> mesh-generation → stored vertex/index buffers), for the editor cube-sphere/plane *preview*
> and for collision/export. The **planet render path is Mode A** (vertex-shader procedural
> tessellation of an instanced patch grid — no stored mesh), covered by
> [planet-pipeline-poc-feasibility.md](../planet-pipeline-poc-feasibility.md). Do **not**
> route this brief for the planet PoC; both modes share the same surface-mapping nodes but
> are different consumers.

## Objective

Make tessellation **graph-driven**, not hardcoded. A mesh is generated from *any*
surface-mapping node or composition (`uv (+faceId) → position, normal`) via a
**mesh-generation consumer** (compute stage emitting vertex/index buffers). The plane and
cube-sphere previews become **thin clients** of it; adding a new surface (cylinder, ring,
warped patch…) needs **no new TypeScript** — just a graph.

Replaces the hardcoded `runtime-webgpu/surfaceMesh.ts::buildSurfaceMesh` — confirmed by
reading the current file: `SurfacePrimitiveId = 'surface.plane' | 'surface.cubeSphere'` is a
closed union, and the per-face param is decided by a literal string switch
(`surfaceId === 'surface.cubeSphere' ? { face } : {}`, line 43) inside a hardcoded triple-
nested CPU loop (face × y × x). Nothing here reads graph structure at all today.

## Concrete proof this brief must land: decompose `surface.cubeSphere`

This is the acceptance case that makes "graph-driven, not id-switched" verifiable, not just
asserted — and directly answers the owner's original question ("test spherification by
instancing a plane into a cube"): the current mesh-gen model sweeps `(uv, faceId)` through
one surface-mapping subgraph rather than literally concatenating discrete instanced vertex
lists, so the graph-native way to prove `transform.spherify` end-to-end is this
decomposition, not a plane-instancing node.

- **`packages/graph/src/primitives/surfaces/cubeSphere.ts`** currently has
  `cubeFaceUvToPosition(face, u, v)` returning a **raw, un-normalized** cube-face point, then
  `evalCPU` normalizes it inline (`normalize3(...)`) and returns the same vector as both
  `position` and `normal` (correct for a unit sphere centered at the origin — the outward
  normal *is* the normalized position).
- **Add `surface.cubeFace`**: a new primitive with the same `(uv: vec2f, face: param 0-5) ->
  rawPosition: vec3f` contract, containing exactly `cubeFaceUvToPosition`'s existing switch
  (moved, not reimplemented — byte-identical math).
- **Wire `surface.cubeFace → transform.spherify`** (landed `ec84b01`) as the composition graph
  fed into the mesh-gen consumer. Since `transform.spherify` = `normalize(position)`, and a
  unit-sphere normal at a point equals its own normalized position, this composition's
  `position` output alone reproduces both `cubeSphere`'s `position` *and* `normal` outputs —
  no separate normal computation needed.
- **Do not modify `surface.cubeSphere` itself** in this brief (leave the existing monolithic
  primitive alone as a fallback/reference) — this is a new, additive decomposition proving the
  consumer generalizes, not a replacement of the existing node.

## Public surface (`runtime-webgpu`)

```ts
// packages/runtime-webgpu/src/consumers/meshGen.ts  (new)
import type { GraphDocument, PortRef } from '@world-lab/graph';

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
   vertex positions (within 1e-6); **and** over the `surface.cubeFace → transform.spherify`
   composition described above, reproduces `surface.cubeSphere`'s own vertex positions
   (within 1e-6, same tolerance) — proving the decomposition is a faithful, graph-driven
   reproduction, not an approximation.
2. **GPU:** `executeMeshGen` returns buffers matching the CPU reference when a device is
   present; **skips cleanly** headless (existing pattern).
3. `npm run check`/`test -w @world-lab/runtime-webgpu` + `-w @world-lab/graph-editor`
   (sceneFree green) + full workspace `check`/`test`.
4. **Manual ⚠:** in the editor, plane and cube-sphere still render; switching the surface
   node changes the mesh — now via the graph path; loading the `surface.cubeFace →
   transform.spherify` composition graph renders a visually identical sphere to
   `surface.cubeSphere`'s own preview.

## Out of scope

LOD/patch subdivision + frustum-scheduled streaming (M11.2 cull exists; the scheduler
that picks patch levels is later). Terrain displacement primitives (separate). Removing
the previews (they stay, just re-pointed). Modifying `surface.cubeSphere` itself (stays as
a reference/fallback). A general N-way "instance any geometry" node — `pending_issues.md`
already tracks arbitrary per-element subgraph container nodes (`flow.forEach`/etc.) as
separate, larger, not-yet-built work; this brief's `faceCount` sweep is a fixed-shape (1 or
6) special case, not that general mechanism. **No AST; no new public exports beyond above.**

## Handoff

→ Tessellation is now a graph capability, and `transform.spherify` has a real, visually
verified end-to-end proof (not just its own unit-tested math) via the
`surface.cubeFace → transform.spherify` composition. Next surface types (cylinder, ring,
asteroid patch) are added as `surface.*` primitives with **zero** runtime/preview changes —
the generic test of the design. Then patch-LOD scheduling (consumes M11.2 cull) is the
remaining tessellation piece; decomposing `geometry.cubeSphere`'s remaining monolithic form
away entirely (replacing it, not just adding an alternative) is a later, separate decision.
