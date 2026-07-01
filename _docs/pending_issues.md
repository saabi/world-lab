# Pending Issues

## /fe

- camera near/far should include all objects visible on screen, with considerations for next item
- when close to the surface and looking up, sometimes the planet dissappears
- should move from fe/ to apps/scene-editor

## /apps/graph_editor

> Resolved (see `_TASK_BOARD.md` archive): preview rerender-on-edit, preview lists outputs
> (buffer list), collapsible palette sections, node-swap UX, S0 pipeline render, unified named
> document save/load + samples + layout (`M-document-system.md`, `7cf7d0a`), help/usage
> tooltips + SDF alias removal (`5a17295`), node color-coding (`61b6359`), primitive help
> coverage (`af69aef`). Do not re-add.

- **node groups UX** not built: "Save as group", zone framing, and collapse-to-node. The group *system* (`groupToFunction`/`buildGroupModule`) exists; the editor authoring/collapse UI does not. See `node-model-design-notes.md` §E.
- **params-as-inputs not wireable in the editor**: promotable params (e.g. remap bounds) should appear as input ports and the form should show connected-vs-literal. Graph-core helpers exist (`paramInputPorts`/`resolveParamBindings`) and port-level defaults landed (`1f1bee4`); the editor + connected-override codegen is still pending. Brief: `M-params-as-inputs.md`.
- Functions representing group nodes must be decomposable into its components and editable upon request. Built-in group functions such as remap must be inspectable as graphs (ideally a la touchdesigner by zooming in or similar gesture) and outomatically cloned and replaced if modified.


## Engine — compiler / runtime (not built)

- **params-as-inputs follow-on**: codegen + `evalCPU` must use the wired upstream value when a promotable param is connected (graph-core `resolveParamBindings` exists; compiler/runtime-cpu/editor integration pending). `M-params-as-inputs.md`.
- **frame-graph GPU executor**: pure core (`buildPassOrder`/`validatePassGraph`/`resolveTargetSizes`) ✅, and the **independent-output** GPU executor (`GraphFrameExecutor` — one shared loop, all live targets, shared uniforms) ✅ landed via `M-single-loop-preview.md` (`4a7f43d`+`c8dcceb`). **Remaining:** same-frame cross-target reads (render-target-as-texture GPU binding) + previous-frame **feedback** (ping-pong) for cyclic edges — needed for multibuffer + render-to-texture. See `M-unified-preview-execution.md` Part 3.
- **render targets beyond single-pass**: `iResolution` per write-target and `iChannelResolution` per read-target; the current runner is single-target. `inputs-cpu-and-resources.md`, `pipeline-as-graph.md`.
- **graph-driven mesh-gen consumer**: `runtime-webgpu/surfaceMesh.ts::buildSurfaceMesh` is still hardcoded to `surface.plane`/`cubeSphere` (CPU loop), not a `geometry.tessellate` compute consumer. `M-mesh-gen-consumer.md` (note: planet uses Mode-A vertex displacement, not Mode-B compute mesh).
- **resource GPU binds**: image/mesh/audio as actual GPU shader inputs (M8 delivered CPU views only) — required for ShaderToy `iChannel` textures (S1). `design-vs-implementation-audit.md`.
- **list container nodes** (`flow.forEach`/`reduce`/`map`): `list<T>` lowering landed (Slice 4); the container nodes for arbitrary per-element subgraphs (e.g. N dynamic lights) are a follow-on. `node-model-design-notes.md` §A.

## Standard library — node gaps

- ~~**`geometry.plane` needs orientation + dimensions**~~ ✅ `a55b8c2` — `width`/`height` + Euler XYZ rotation params on `geometry.plane`; WGSL + evalCPU parity; defaults preserve fullscreen quad. Composable `transform.*` nodes remain a follow-on (`node-model-design-notes.md` §B).
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

- **Visual & GPU gates need a human eyeball** — headless green ≠ it renders. Device-compile coverage now runs in Node when the `webgpu` binding is available (`94d0629`); canvas integration tests still skip without a browser WebGPU canvas. See `packages/runtime-webgpu/README.md`.
