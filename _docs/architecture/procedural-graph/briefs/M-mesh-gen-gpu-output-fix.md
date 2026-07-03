# Brief — fix the mesh-gen GPU path's silent CPU fallback

**Type:** correctness fix, follow-on to `M-mesh-target-sink.md` · **Package:**
`@world-lab/runtime-webgpu` (`consumers/meshGen.ts`, `consumers/surfaceMeshPreview.ts`) ·
**Depends on:** `M-mesh-target-sink.md` ✅ landed (`704e1d1`) · **Design authority:** this
brief itself — the bug and fix were traced by direct code reading, not a pre-existing ADR ·
**Contract author:** Opus · **Recommended executor:** Cursor · **Status:** ready to route

## Problem

Confirmed by direct code reading, not assumed. Three related issues in the "GPU" mesh
generation path, all in `packages/runtime-webgpu/src/consumers/meshGen.ts`:

1. **The GPU path throws for any graph without a pre-declared output, and this is the
   normal case, not an edge case.** `assembleMeshGenShader` (line ~354) calls
   `findOutputName(req.graph, req.position)` (line ~251), which throws `Output port is not
   declared in graph.outputs: ...` unless `req.graph.outputs` already contains an entry whose
   `from` matches `req.position`. `deriveMeshTargets` (the function that builds a
   `MeshTargetDescriptor` from a wired `target.mesh` node, landed in the same brief this
   follows) never synthesizes such an entry — it only reads the wired edge, the way
   `target.display`'s equivalent (`derivePipelinePresentations`/`outputNameForField`) *does*
   synthesize one. **Both bundled mesh sample graphs shipped alongside this feature
   (`displacedSphereMeshGraph`, `rotatedPlaneMeshGraph` in `graphBuilders.ts`) have
   `outputs: []`** — meaning the GPU path throws for both of them today, every time.
2. **The throw is completely silent.** `surfaceMeshPreview.ts`'s `renderMeshGenPreview`
   (line ~207-212) wraps `executeMeshGen` in a bare `try { ... } catch { mesh =
   evaluateMeshGenCpu(request); }` — no logging, no user-facing indication. The "GPU" mesh
   preview is, in practice, always CPU today; nothing signals this.
3. **Even once #1 is fixed, an independently-sourced `normal` isn't fully supported.**
   `assembleMeshGenShader` slices WGSL modules *only* from `req.position`
   (`sliceGraph(req.graph, { outputs: [outputName] })`, singular) — there's no equivalent
   slice/merge for `req.normal`'s own dependency subgraph. If `normal` comes from nodes that
   aren't already reachable from `position`'s slice (a realistic case — e.g. a mesh where
   `normal` is the *undisplaced* surface normal but `position` is *displaced*, exactly the
   shipped `displacedSphereMeshGraph` sample's own shape), the compiled shader would be
   missing WGSL functions `normal`'s expression needs.

Note: `emitGraphVec3Eval` (used for the actual per-vertex expression codegen, not the WGSL
module/dependency gathering) already takes a raw `PortRef` and does **not** require a
declared output — only `sliceGraph`'s name-based lookup does. The fix is narrower than it
might first look: it's the module-slicing step, not the expression codegen.

## Fix

1. **Don't require `req.position`/`req.normal` to be pre-declared in `req.graph.outputs`.**
   In `assembleMeshGenShader`, build a **local, synthetic-augmented copy** of the graph
   document (never mutate `req.graph` itself) with output entries synthesized for whichever
   of `position`/`normal` aren't already declared (e.g. `{ name: '__meshgen_position', from:
   req.position }`, and `{ name: '__meshgen_normal', from: req.normal }` when `req.normal` is
   set) — mirroring the same "synthesize when absent" pattern `target.display`'s
   `outputNameForField` already established for images, just locally within this function
   rather than as a graph-wide reconciliation step.
2. **Slice and merge both subgraphs, not just position's.** Call `sliceGraph` with **both**
   synthesized output names when `req.normal` is present (e.g. `sliceGraph(augmented, {
   outputs: ['__meshgen_position', '__meshgen_normal'] })` — check `sliceGraph`'s actual
   signature for whether it already accepts multiple output names in one call, since its
   `request.outputs` param reads as an array; if so this may already work correctly once #1's
   augmented-doc fix lands, without needing a second `generateWgsl` call to merge). Confirm
   with a test using a graph shaped like the shipped `displacedSphereMeshGraph` sample
   (`normal` sourced from a *different* node than the one feeding `position`'s final value)
   that the compiled shader contains every WGSL function both subgraphs need.
3. **Stop swallowing the GPU path's failures silently.** Replace the bare `catch {}` in
   `surfaceMeshPreview.ts`'s `renderMeshGenPreview` with one that at least
   `console.warn`s the caught error before falling back to CPU — the fallback itself is a
   reasonable resilience feature (GPU unavailable, etc.), but a *correctness* bug in shader
   assembly shouldn't be indistinguishable from "no GPU device" with zero signal.
4. **While touching this function — cheap, low-risk cleanup (Finding #5 from the review that
   prompted this brief):** `executeMeshGen` calls `evaluateMeshGenCpu(req)` unconditionally at
   the top, but traced every use of its result (`cpuReference`): only `vertexCount`/`indices`/
   `indexCount` are read — never `cpuReference.positions`/`.normals` (the real output comes
   from actual GPU readback, `gpuPositions`/`gpuNormals`). `vertexCount` is `gridSize *
   gridSize * faceCount` and `indices` is already `buildMeshIndices(gridSize, faceCount)` —
   both computable directly with no CPU graph evaluation at all. Replace the unconditional
   `evaluateMeshGenCpu` call with these two direct computations; this is a performance
   cleanup, not a correctness fix, so don't let it block or complicate items 1-3 above.

## Gate

1. New test: `executeMeshGen`/`assembleMeshGenShader` on a graph with `outputs: []` (matching
   the shipped sample fixtures' actual shape) succeeds instead of throwing.
2. New test: a graph shaped like `displacedSphereMeshGraph` (normal sourced from a node not
   on position's own dependency path) — compiled shader contains the WGSL functions both
   `position` and `normal` need; GPU execution (skip cleanly headless, existing pattern)
   produces the same values as `evaluateMeshGenCpu` for the same graph (parity check).
3. `renderMeshGenPreview` test: a forced `assembleMeshGenShader`/`executeMeshGen` failure logs
   a warning before falling back to CPU (spy on `console.warn`).
4. `check` **and** `test` green for `runtime-webgpu` and the full workspace.
5. **Visual ⚠:** open the bundled "Mesh — Displaced cube-sphere" and "Mesh — Rotated plane"
   samples in the running editor; confirm the mesh preview actually exercises the GPU path
   now (not silently falling back) — e.g. via a temporary log line during manual testing, or
   by confirming the `console.warn` from item 3 does *not* fire for these two samples anymore.

## Out of scope

Mode A vertex displacement (modifying vertices inside `stage.vertex` for the planet
renderer / adaptive patch instancing / imported meshes) — a separate, much larger,
deliberately-deferred initiative; Mode B (what this brief fixes) is compute-mesh-generation
for editor preview/collision/export only, per `M-mesh-gen-consumer.md`'s own scope note.
Any change to `packages/compiler`'s `sliceGraph`/`generateWgsl` public contract (this brief's
fix is local to `meshGen.ts`'s own request-building, not a change to the compiler package).

## Handoff

→ The mesh preview's "GPU" path actually runs on GPU for realistic, editor-authored graphs
(including both bundled samples), instead of silently and permanently falling back to CPU;
future GPU-path failures are visible instead of indistinguishable from "no GPU available."
