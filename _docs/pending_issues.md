# Pending Issues

## /fe

- camera near/far should include all objects visible on screen, with considerations for next item
- when close to the surface and looking up, sometimes the planet dissappears
- should move from fe/ to apps/scene-editor

## /apps/graph_editor

- updating the code or the parameters for a node, or rewiring, is not always triggering a rerender of the preview.
- the preview panel should list available outputs for the active shader
- the primitives menu needs collapsible sections, perhaps use existing components (the `category`→`group` taxonomy + `@virtual-planet/editor-ui` `Section`/`Subsection` already exist — wire them up). See `architecture/procedural-graph/editor.md`.
- we still have sdf functions when they're simply aliases for other functions. This was discussed elsewhere, resolve with help tips. (`help`/`usage` metadata fields exist; the editor doesn't render them yet, and `sdf.opUnion`/`opIntersect` should be removed in favour of `math.min`/`max` + a help tip.) See `node-model-design-notes.md` §C.
- **node-swap UX** not built: "Change operation ▸" should let you swap a node for another sharing its role/contract (preserving edges). The `role`/`contractOf`/`swapFamily` metadata landed (foundation Slice 2); the editor UI is pending. See `node-model-design-notes.md` §C.
- **node groups UX** not built: "Save as group", zone framing, and collapse-to-node. The group *system* (`groupToFunction`/`buildGroupModule`) exists; the editor authoring/collapse UI does not. See `node-model-design-notes.md` §E.
- **params-as-inputs not wireable in the editor**: promotable params (e.g. remap bounds) should appear as input ports and the form should show connected-vs-literal. Graph-core helpers exist (`paramInputPorts`/`resolveParamBindings`); the editor + codegen integration is pending (see Engine below). Brief: `M-params-as-inputs.md`.
- **S0 pipeline render unconfirmed (visual)**: the pipeline nodes (`geometry.fullscreenPlane`→`buffer.persist`→`stage.vertex`/`fragment`→`target.display`) and the `pipelineGraph` runner landed headless-green, but "does the canvas show the pipeline and render the palette" needs a human eyeball. Brief: `M-pipeline-nodes-s0.md`.
- Functions representing group nodes must be decomposable into its components and editable upon request. Built-in group functions such as remap must be inspectable as graphs (ideally a la touchdesigner by zooming in or similar gesture) and outomatically cloned and replaced if modified.

## Engine — compiler / runtime (not built)

- **🔴 Pipeline nodes are empty stubs — geometry/tessellation isn't really generated.**
  `procedural-wgsl/src/modules/pipeline/stubs.ts` gives `geometry.plane`/`fullscreenPlane`/
  `buffer.persist`/`stage.vertex`/`stage.fragment`/`target.display` **empty WGSL bodies**
  (`fn planeGrid() {}`), and the runner renders via a **hardcoded fullscreen triangle**
  (`fullscreenFragment.ts FULLSCREEN_VERTEX_WGSL`). So the compiled-WGSL view shows empty
  functions and no tessellation/geometry code — the pipeline-as-graph is cosmetic at the
  geometry/vertex level (only the fragment field subgraph is real). Fix: `geometry.plane`
  emits real vertex-grid WGSL, `stage.vertex` compiles to a real `@vertex` shader using it,
  the runner uses that instead of the hardcoded triangle. **High priority — it makes "build
  uses actual nodes" honest for the geometry path.** Brief: `M-real-geometry-vertex-codegen.md`.
- **params-as-inputs follow-on**: codegen + `evalCPU` must use the wired upstream value when a promotable param is connected (graph-core `resolveParamBindings` exists; compiler/runtime-cpu/editor integration pending). `M-params-as-inputs.md`.
- **frame-graph GPU executor**: multi-pass ordering, single-frame **feedback** (ping-pong), transient-pool allocation. Only the pure core (`buildPassOrder`/`validatePassGraph`/`resolveTargetSizes`, T4) is built. Needed for multibuffer + render-to-texture. `M-pass-graph-executor.md`.
- **render targets beyond single-pass**: `iResolution` per write-target and `iChannelResolution` per read-target; the current runner is single-target. `inputs-cpu-and-resources.md`, `pipeline-as-graph.md`.
- **graph-driven mesh-gen consumer**: `runtime-webgpu/surfaceMesh.ts::buildSurfaceMesh` is still hardcoded to `surface.plane`/`cubeSphere` (CPU loop), not a `geometry.tessellate` compute consumer. `M-mesh-gen-consumer.md` (note: planet uses Mode-A vertex displacement, not Mode-B compute mesh).
- **resource GPU binds**: image/mesh/audio as actual GPU shader inputs (M8 delivered CPU views only) — required for ShaderToy `iChannel` textures (S1). `design-vs-implementation-audit.md`.
- **list container nodes** (`flow.forEach`/`reduce`/`map`): `list<T>` lowering landed (Slice 4); the container nodes for arbitrary per-element subgraphs (e.g. N dynamic lights) are a follow-on. `node-model-design-notes.md` §A.

## Standard library — node gaps

- **`geometry.plane` needs orientation + dimensions**: it currently exposes only `resU`/`resV` (subdivision counts) — no size or facing. Add initial **dimensions** (width/height or size) and **orientation** (normal/rotation) so the general plane can stand in for the deprecated `geometry.fullscreenPlane` (now a 2×2 alias) in arbitrary placements. Open design choice: bake them as node params for convenience, or supply them via composable `transform.scale`/`rotate`/`translate` nodes (per the elemental-primitives + transforms philosophy), or both (params = initial defaults, transforms = composition). `node-model-design-notes.md` §B.
- **geometry transforms**: `transform.spherify`/`displace`/`translate`/`rotate`/`scale`/`twist`/`bend`/affine, and decompose `geometry.cubeSphere` → `geometry.cube` + `transform.spherify` (more elemental, reusable on any vertex list). These also cover the plane orientation/dimensions case above via composition. `node-model-design-notes.md` §B.
- **colorlab harvest remainder**: OKLab/OKLCH, CVD simulation, chromatic adaptation, gamut mapping (slice A = D65 space conversions only). `M-colorlab-harvest.md`.
- **vegetation as nodes**: `veg.densityField`/`peakDetect`/`prominence`/`coverageMask` — the algorithm lives in `runtime-cpu/vegetation.ts` but isn't exposed as graph nodes. `primitive-library.md`.
- **terrain analysis primitives**: `slope`/`altitude`/`curvature`/`beachMask`/`ridgeMask`/`erosionApprox` (discussed turn 50; not built). `primitive-library.md`.
- low-hanging-fruit math/sdf/colour/noise still listed in `primitive-library.md` (e.g. `math.normalize` — needed by `spherify`).

## ShaderToy / PoC (not built)

- **S0.5 Game of Life** multibuffer effect (depends on the frame-graph GPU executor + ping-pong feedback). `M-shadertoy-poc.md`.
- **ShaderToy host inputs**: `iMouse` (normalized pointer), `iFrame`, `iChannel` textures — partial.
- **Planet PoC P0–P5**: instance-input model → tessellator composition → shaping-kernel codegen at parity → route-parity with `/scene`. `planet-pipeline-poc-feasibility.md`.

## Roadmap — not started (see `architecture/procedural-graph/implementation-plan.md`)

- **M13** planet shaping migration — **GATED** behind `renderer-unification-plan.md` (do not start; the planet PoC proves the path without touching the live renderer).
- **M14** document/session model · **M15** MCP build-out (scaffold only) · **M16** embedded editor + shared surfaces · **M17** WebGPUToy.

## Process / verification

- **Visual & GPU gates need a human eyeball** — headless green ≠ it renders. Several "green" agent claims have been green-but-wrong (invalid WGSL emitted; caught only by review + the `@use`↔`dependencies` guard). For any WGSL-emitting change, require `check` **and** `test` **and** WGSL validity (the `procedural-wgsl/use-deps.test.ts` guard, plus a device compile where available).
- `tsconfig.tsbuildinfo` build artifacts (`packages/*/`) are untracked and should be gitignored.
