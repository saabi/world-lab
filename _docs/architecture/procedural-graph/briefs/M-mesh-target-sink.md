# Brief — `target.mesh` sink + live graph-driven mesh preview

**Type:** core capability, follow-on to the mesh-gen consumer · **Packages:**
`@world-lab/graph` (new `target.mesh` primitive + derivation), `@world-lab/graph-editor`
(`previewBuffers.ts`, `MeshPreviewPanel.svelte`, `PreviewZone.svelte`) · **Depends on:**
`M-mesh-gen-consumer.md` ✅ landed (`82f5a8b`) · **Design authority:** the landed mesh-gen
consumer's own `MeshGenRequest` shape (`packages/runtime-webgpu/src/consumers/meshGen.ts`);
`target.display`'s existing pattern as the sink-node precedent (`packages/graph/src/
primitives/pipeline/index.ts`) · **Contract author:** Opus · **Recommended executor:** Cursor
(⚠ has a visual gate) · **Status:** ready to route

## Problem

The mesh-gen consumer landed a genuinely graph-driven engine
(`evaluateMeshGenCpu`/`executeMeshGen` + `MeshGenRequest`, accepting an arbitrary
`GraphDocument` and arbitrary `position`/`normal` `PortRef`s) — confirmed by reading it
directly, this part is real and general. But nothing in the editor connects it to what a user
actually builds:

- **`MeshPreviewPanel.svelte` doesn't take a `graph` prop at all.** It's a fixed,
  self-contained demo: `surfaceId = $state<SurfacePrimitiveId>('surface.cubeSphere')`, a local
  toggle between exactly two hardcoded built-ins (`meshGenRequestForLegacySurface`). Wiring a
  displacement graph today (`surface.cubeFace → noise.perlin3d → transform.normalDisplace`,
  all of which already exist and are individually tested) would evaluate correctly, but
  there's nowhere in the editor to see it rendered.
- **The generic preview-buffer system doesn't recognize a mesh candidate either.**
  `previewBuffers.ts::enumeratePreviewBuffers` only builds an "image"-family buffer from
  `target.display`-style sinks (nodes with `metadata.role === 'pipelineTarget'`, found via
  `isPipelineTarget`/`derivePipelinePresentations`). A raw `vec3f` position output maps to
  the "data" family (`previewFamily`'s own switch), not "geometry" — there's no declared,
  graph-native way to say "this position/normal pair is a mesh to render."
- `rendererForPreviewFamily('geometry')` already returns `'mesh'`, and `PreviewZone.svelte`
  already dispatches `previewRenderer === 'mesh'` to `<MeshPreviewPanel>` — the *renderer
  selection* plumbing exists; only the *declaration and wiring* of what feeds it is missing.

## Fix

### 1. New primitive: `target.mesh` (`packages/graph/src/primitives/pipeline/`, alongside
   `target.display`)

- `category: 'target/sink'`, `inputs: [{ name: 'position', dataType: 'vec3f' }, { name:
  'normal', dataType: 'vec3f' }]` (both required — an unwired `normal` would otherwise force
  every consumer to fall back to `position` as the normal, per `evaluateMeshGenCpu`'s existing
  `normal ? ... : pos` fallback, which looks visibly wrong on displaced/non-spherical
  geometry; require it explicitly here rather than silently defaulting), `outputs: []`.
- `params: Type.Object({ gridSize: Type.Integer({ minimum: 2, default: 24 }), faceCount:
  Type.Integer({ minimum: 1, maximum: 6, default: 1 }) })` — matches `MeshGenRequest`'s own
  `gridSize`/`faceCount` fields exactly; these are the user-declared tessellation settings for
  this mesh sink, not inferred from graph structure (inferring "how many faces" from wiring
  shape would be fragile — an explicit param is simpler and matches how `target.display`
  itself is a plain declarative sink).
- `metadata: { role: 'meshTarget', pure: false, deterministic: false, description: '...' }` —
  a distinct role from `target.display`'s `'pipelineTarget'` (a mesh sink has different
  semantics — vertex/index buffers, not a presentable color texture — so it must not be
  picked up by `isPipelineTarget`/`derivePipelinePresentations`, which are image-pipeline-
  specific and check for a `stage.fragment` intermediary a mesh sink doesn't have).

### 2. Mesh-target derivation (`packages/graph`, new file or alongside `pipeline.ts`)

- `isMeshTarget(node): boolean` — `metadata.role === 'meshTarget'` (parallel to
  `isPipelineTarget`).
- `deriveMeshTargets(doc): MeshTargetDescriptor[]` where `MeshTargetDescriptor = { meshNodeId:
  string; position: PortRef; normal: PortRef; gridSize: number; faceCount: number }` — for
  each `target.mesh` node, find its wired `position`/`normal` incoming edges (`doc.edges.find
  ((e) => e.to.node === meshNode.id && e.to.port === 'position'/'normal')`) and read its own
  `gridSize`/`faceCount` params. Skip (don't return) a mesh-target node missing either wired
  input — an incomplete sink isn't previewable yet, same spirit as how an incomplete
  `target.display` sink is handled upstream of preview enumeration.
- No special handling needed for the underlying surface source's own `face` param sweep —
  `evaluateMeshGenCpu`'s `findFaceParamNodes` already generically sweeps *any* node in the
  graph whose primitive has a `face` param (confirmed by reading it: it scans all nodes,
  not a hardcoded id list), so `surface.cubeFace`/`surface.cubeSphere` wired anywhere upstream
  of a `target.mesh` node work automatically.

### 3. `previewBuffers.ts::enumeratePreviewBuffers` — new loop

- Parallel to the existing `target.display` loop (the `seenSinkIds`/`isPipelineTarget` loop):
  iterate `deriveMeshTargets(doc)`, build a `PreviewBuffer` per descriptor with `family:
  'geometry'`, `source: { sinkNode: descriptor.meshNodeId }`, `dataType: 'mesh'`, `inferred:
  false` (a mesh sink is never ambiguous the way a `vec4f` value output can be).
- **`resolvePreviewBufferPort` doesn't fit this case** — it resolves a buffer's source to a
  single `PortRef`, but a mesh buffer needs `position` + `normal` + `gridSize` + `faceCount`
  together. Add a parallel resolver, e.g. `resolveMeshPreviewRequest(doc, buffer):
  MeshTargetDescriptor | null`, called instead of `resolvePreviewBufferPort` whenever
  `buffer.family === 'geometry'` — don't try to force the single-port abstraction to cover
  this.

### 4. `MeshPreviewPanel.svelte` — accept the real graph instead of a hardcoded demo

- Replace the `surfaceId = $state<SurfacePrimitiveId>(...)` toggle with props: `graph:
  GraphDocument`, `meshRequest: MeshTargetDescriptor | null`.
- If `meshRequest` is `null` (no `target.mesh` node wired/found), show an informative empty
  state — match the existing convention elsewhere in this file's sibling panels (e.g.
  `EffectPreviewPanel.svelte`'s "Preview loop unavailable — wire a pipeline display target.")
  rather than silently falling back to the old demo.
- Otherwise build a real `MeshGenRequest` (`{ graph, position: meshRequest.position, normal:
  meshRequest.normal, gridSize: meshRequest.gridSize, faceCount: meshRequest.faceCount }`) and
  call `evaluateMeshGenCpu`/`executeMeshGen` exactly as today, just with a request derived
  from the user's own graph instead of `meshGenRequestForLegacySurface`.
- Keep `meshGenRequestForLegacySurface`/`buildPlaneMeshGenGraph`/`buildCubeSphereMeshGenGraph`/
  `buildDecomposedCubeSphereMeshGenGraph` in `runtime-webgpu` untouched — they're still used by
  existing tests and remain valid reference fixtures; this brief adds a new consumption path,
  it doesn't remove the old one.

### 5. `PreviewZone.svelte` wiring

- Pass `graph` and the resolved `meshRequest` (via `resolveMeshPreviewRequest` for the
  selected buffer) into `<MeshPreviewPanel>` — currently called with only `refreshEpoch`/
  `compileSignature`, no graph at all.

## Gate

1. `packages/graph`: `target.mesh` registers; `isMeshTarget`/`deriveMeshTargets` unit tests —
   a complete mesh-target node (both inputs wired) is found with correct
   `position`/`normal`/`gridSize`/`faceCount`; an incomplete one (missing `normal`) is
   skipped, not returned with a null/partial descriptor.
2. `packages/graph-editor`: `enumeratePreviewBuffers` on a graph with a wired `target.mesh`
   node includes a `family: 'geometry'` buffer; `resolveMeshPreviewRequest` resolves it back
   to the right descriptor. `MeshPreviewPanel` component test: renders the empty state with
   no `meshRequest`; calls the mesh-gen path with a mock request otherwise (mock
   `evaluateMeshGenCpu`/`executeMeshGen` rather than requiring a real GPU device for this
   assertion).
3. `check` **and** `test` green for `graph`, `graph-editor`, and the full workspace.
4. **Visual ⚠:** build a graph `surface.cubeFace → transform.spherify → transform.
   normalDisplace → target.mesh` (`spherify`'s output feeds *both* `normalDisplace.position`
   and `normalDisplace.normal` — `surface.cubeFace` itself has no `normal` output, so the
   spherified position doubles as the approximate normal, per the "Out of scope" note below;
   `noise.perlin3d` — fed from `spherify`'s output — drives `normalDisplace.height`;
   `normalDisplace`'s result feeds `target.mesh.position`, and `spherify`'s own output feeds
   `target.mesh.normal` directly, `faceCount: 6` on the sink) in the running editor; confirm a
   visibly bumpy/displaced sphere renders in the mesh preview pane — not just a smooth sphere,
   proving displacement actually reaches the renderer end-to-end. Also confirm the empty state
   shows correctly when no `target.mesh` node exists in the graph.
   > **Correction (2026-07-03):** this item originally read "wire `position`/`normal` from
   > the surface source" — wrong, `surface.cubeFace` only outputs `position`. Caught during
   > independent review after landing; the shipped implementation (`704e1d1`, bundled sample
   > `displacedSphereMeshGraph` in `graphBuilders.ts`) already wires it correctly as described
   > above — the executor caught and fixed this brief's error without it being flagged here.
   > Corrected the text so the document matches what was actually (correctly) built.

## Out of scope

Per-vertex normal recomputation for displaced geometry (this brief requires `normal` to be
explicitly wired — if a user wires the *undisplaced* surface normal into a mesh whose
*position* is displaced, shading will look subtly off; correctly recomputing a displaced
normal, e.g. via finite differences, is a separate, harder problem for a later brief). GPU
compute-path changes beyond what `M-mesh-gen-consumer.md` already built (this brief only adds
the graph-declaration + editor-wiring layer on top). Removing or migrating the legacy
`surfaceId`-toggle demo fixtures in `runtime-webgpu` (they stay as reference/test fixtures).
A general N-way instancing node (still separately tracked, bigger, not needed here).

## Handoff

→ A user can wire any position-producing composition (surface source → noise → displacement,
or any other elemental chain) into a `target.mesh` sink and see it rendered live in the
editor — the last missing piece between "the math primitives and the mesh-gen engine both
exist" and "you can actually author and see a displaced-geometry graph."
