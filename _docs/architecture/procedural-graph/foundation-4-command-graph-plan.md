# Foundation 4 — command graph: sequencing plan

**Status:** draft sequencing plan — no milestone below has a contract yet; each gets its own full
contract (file list, exact signatures, gate-as-failing-tests) written immediately before it's
routed, exactly as every F1-F3 milestone did · **Parent:**
[elemental-webgpu-architecture-review.md, Foundation 4](./elemental-webgpu-architecture-review.md#foundation-4-command-graph)
· **Informed by:** [repo-and-roadmap-review-2026-07-08.md](./repo-and-roadmap-review-2026-07-08.md)
(Parts 1.1-1.6, 2.2) and the independent
[roadmap_app_architecture_review_codex.md](../../roadmap_app_architecture_review_codex.md), which
reached the same top-level sequencing (readback split first, then command graph) — convergent
conclusions from two separate reviews · **Depends on:** Foundations 1-3, complete (F3.6.6
`0ba8d54`+`e0243c9`+`6d2652c` closed the sequence) · **Blocks:** the standard-library
reconstruction list (multi-mesh, particles, vegetation, ShaderToy feedback, planet patch), planet
PoC P1-P5, S0.5 Game of Life, M13 · **Author:** Opus

## Why this order — performance and presentation come first

Foundation 4's five bullets in the elemental review (draw/dispatch/indirect commands, passes,
attachment/pipeline-state descriptors, ordered draw collections, pipeline/binding caches) read as
if the command *vocabulary* is the work and caching is a closing detail. The 2026-07-08 review
found the opposite priority: the app's per-frame execution model is currently a screenshot
pipeline — full revalidation, WGSL re-emission, shader-module/pipeline/buffer recreation, and a
GPU→CPU readback into `putImageData` at a fixed 256×256, every animation frame, per pass
(evidence table in that review, §1.1). Every sample built on top of this bakes the pattern in
deeper, and every F4 command-graph milestone would otherwise be built, tested, and
visually-gated against a rendering path that has to be replaced anyway. So F4.1 fixes the
execution model on the *existing* node vocabulary first — zero new primitives — and everything
after lands on the real path.

The same logic ordered depth and camera (F4.2) before the command vocabulary (F4.3-F4.5): a
`draw` command without depth testing or a view transform can only be proven on flat fullscreen
content, which the existing path already renders — the proof would be hollow. F3.6 demonstrated
repeatedly that a milestone whose gate can't fail is a milestone that ships gaps.

## Verified current state — what exists to build on, what doesn't

Confirmed by direct read (citations), not assumed:

**Already built, reusable as-is or nearly:**

- **The frame-graph core already models most of what F4 needs declaratively.**
  `packages/runtime-webgpu/src/frameGraph/types.ts`: `ResourceTarget` is a buffer/texture union
  with `ResourceShape`, `ResourceLifetime`, and `TextureTargetSize` (screen-relative *and* fixed —
  per-target resolution is modeled, just unused by the preview loop's hardcoded 256);
  `ResourceRead.version?: 'previous'` models cross-frame feedback and `order.ts` already excludes
  it from cycle detection; `realize.ts:206` already passes `target.shape.format ?? 'rgba8unorm'`
  through to `createTexture` — **float/HDR targets are a consumer-honoring problem, not a core
  redesign.**
- **Instanced draw is extracted and compute-ready.** `consumers/instancedMeshDraw.ts`:
  `renderInstancedMesh` + `InstanceVertexLayout`, caller-owned instance `GPUBuffer` with no
  internal `writeBuffer` — a compute-populated buffer works unchanged (deliberate, per its brief).
  Not graph-authorable yet.
- **Depth + a real camera exist twice, privately.** `surfaceMeshPreview.ts:290,421,436`
  (`depth24plus` pipeline state + attachment, `meshPreviewViewProjection`) and
  `vegetationPreview.ts:692` — working reference implementations of exactly what F4.2 generalizes,
  and exactly the domain-executor siloing the elemental review exists to eliminate.
- **Kernel assembly is real and proven** (F3.1-F3.6): `assembleStageEntry` (all three stages,
  typed varyings), `resolveKernelBindings`/`buildKernelBindingDecls`/`buildComputeBindGroupEntries`
  (stage-agnostic, proven for compute and render), `executeComputeKernel`,
  `assembleVertexKernelPositionModuleAsync`, `executeKernelFragment`, derived binding sets.
- **`compileSignature` already exists** as the editor's recompile key
  (`GraphEditor.svelte`'s preview-loop `$effect`) — the natural cache key F4.1 needs is already
  threaded to the right place.

**Confirmed missing (the gaps this plan closes):**

- No caching anywhere between "graph edited" and "pixels": `validateGraph` per pass per frame
  (`pipelineGraph.ts:241`), document walks run twice per tick (`previewFrameLoop.ts:70-72` +
  `graphFrameExecutor.ts:71-82`), `compileGraph`+emission+`createShaderModule`+
  `createRenderPipeline` per pass per frame (`fullscreenFragment.ts:270-272`,
  `kernelFragment.ts:124-125`), uniform/params/readback buffers created and destroyed per call,
  one `createSampler` per channel per call (`fullscreenFragment.ts:174`).
- Display reaches the screen via readback + `putImageData` (`previewFrameLoop.ts:174-176`,
  `GpuPreviewPanel.svelte:59-61`) — no `GPUCanvasContext` presentation anywhere in the graph path.
- No depth attachment, no camera/view-projection semantics, no vertex-stage uniform binding
  (time/params), single proven varying — the graph pipeline path is flat-NDC, `rgba8unorm`,
  fragment-uniforms-only (review §1.2-1.4, F3.6 closeout records).
- No draw/pass command vocabulary: `PipelineGraphExecutor.execute` is a hardcoded
  one-fullscreen-draw path with two nested kernel branches; multi-mesh, draw order, blending,
  and attachment load/store are unrepresentable (`pending_issues.md` multi-mesh bullet).
- `PipelineGraphResourceCache.realizeGeometry` is a cache-shaped no-op (fingerprint `Set` +
  counter, no GPU resource retained) — must become real or be renamed when `MeshResource` lands.

## Milestone sequence

### F4.1 — performance and presentation foundation (no new nodes)

The execution-model fix on the existing vocabulary. Scope: (a) split **plan/compile time** from
**frame time** — validation, document walks, WGSL emission, `createShaderModule`, and pipeline
creation happen once per `compileSignature` (a compiled-frame-plan object the executor holds;
frame time only writes uniforms, sets bind groups, encodes, submits); (b) **persistent frame
resources** — uniform/params buffers written via `queue.writeBuffer`, device-lifetime sampler
cache, readback buffers pooled; (c) **canvas presentation** — display targets render into a
`GPUCanvasContext.getCurrentTexture()` view; readback survives only for tests, probes, and the
CPU preview panel (explicitly: the test suite's readback-based assertions stay — they are the
proof mechanism, just no longer the display path); (d) **static-graph dirty detection** (Codex
review's suggestion, adopted): a graph with no time/pointer/frame-dependent host inputs and no
edits renders once, not per-rAF; (e) honor the frame-graph core's **per-target sizes** instead of
the hardcoded 256. Gate shape: frame-time work provably free of compile-cost (a spy/counter test
asserting zero `createShaderModule`/`validateGraph` calls after the first frame per signature),
all existing samples render identically (visual gate), and an honest before/after frame-cost
measurement recorded in the closeout.

### F4.2 — depth, camera, and stage-complete uniforms

Everything "the third dimension" needs, folded together because it is all one plumbing concern:
uniforms and attachments reaching the vertex stage and the pass. Scope: (a) **depth attachment**
on the pass model (a `ResourceShape` texture with a depth format — `realize.ts` already passes
formats through; pipeline `depthStencil` state derived from it), generalizing what
`surfaceMeshPreview`/`vegetationPreview` each hand-roll; (b) **view/projection host-binding
semantics** — a standard camera uniform (the `HostBinding` mechanism `host.iTime` already uses),
with a documented **precision policy** (camera-relative / body-local f32, the policy the scene
editor already implements CPU-side and `pending_issues.md` names for particles); (c) **vertex-stage
uniforms** — ShaderToy host uniforms and `GraphParams` bindable in vertex kernels, closing two of
the F3.6 capability cliffs (static-only displacement; the designed-around amplitude gap in
F3.6.6's own sample); (d) **N varyings** — the array-shaped mechanism proven past one
(`position`+`uv`+`normal`+`worldPos` is the realistic floor for lit 3D); (e) **float color
targets** honored end-to-end (atmosphere/HDR prerequisite). Gate shape: a real-device test with
two overlapping camera-transformed surfaces resolving correct occlusion; a time-animated,
param-controlled vertex displacement through the real executor path; every F1-F3 sample untouched.

### F4.3 — `MeshResource` and draw commands

The elemental review's typed mesh decomposition. Scope: `MeshResource` as composed typed buffer
views (vertex/index, arbitrary attributes); `draw`/`drawIndexed` command nodes carrying pipeline
state (topology, cull, front-face) and per-draw bindings; `buffer.persist`'s geometry special
case subsumed (its `PipelineGraphPlan` role becomes a real resource realization —
`PipelineGraphResourceCache` becomes real or is deleted, per the review's §1.8); mesh-gen's
compute path writes a `MeshResource` instead of its own private buffers. Explicitly deferred
here: instancing (F4.5), multi-draw passes (F4.4).

### F4.4 — `render.pass` with an ordered draw collection

Multi-mesh into one target. Scope: `render.pass` owning attachments (color list + depth,
load/store policy, clear values) and an ordered `list<DrawCommand>` input (the elemental review's
"ordered command collection, not multi-fan-in on a value port"); blending and write masks on draw
state; **the legacy-path collapse decision (D2's deferred retirement trigger) lives here by
name** — `stage.vertex`/`stage.fragment`'s fullscreen path becomes a preset/group over "one draw
in a pass," and `PipelineGraphExecutor`'s nested branches collapse into command interpretation.
If investigation shows in-place collapse is too risky in one milestone, the fallback is the F3
pattern: additive command path + explicit migration milestone — but the decision gets made here,
not re-deferred.

### F4.5 — instanced and indirect draw

Scope: instance buffers as first-class draw inputs (`renderInstancedMesh` becomes
graph-authorable); compute-populated instance/storage buffers feeding draws (the particles
precursor capability 2 — `STORAGE`-usage instance buffers, compute dispatch → draw dependency
through the existing pass DAG); generalized ping-pong/history for buffers (capability 3 — the
`order.ts` feedback model applied to buffer targets, which `types.ts` already unions); indirect
draw/dispatch variants. This is the milestone after which particles, vegetation-as-graph, and
S0.5 Game of Life are integration briefs, not capability work.

### F4.6 — proof: a bundled multi-mesh 3D scene

Mirroring F2.5/F3.5/F3.6.6's proof-milestone convention, with the standing bundled-sample rule
for the visual gate. A pickable sample: several `MeshResource` draws (at least one instanced, at
least one graph-displaced), depth-tested, camera-orbitable, one time-animated element, rendered
through canvas presentation at interactive frame rates — plus every prior sample still rendering
identically through the collapsed path. The gate is a real-browser screenshot *and* the
frame-cost counter from F4.1 still holding (no compile-time work per frame).

## Parallel tracks (not gated on F4, should not wait for it)

- **Audio Phase A** (`audio-graphs.md`) — Foundation-independent since F1; the largest objective
  item startable today by a second implementer. Schedule independently.
- **E1** (`cpu-elemental-model.md` — `cpu-handle`, stream/future/signal) — unblocks DOM egress
  (`sink.host`/`signal<T>`), streams, picking Phase B+; high fan-out, no F4 dependency.
- **Vertex-kernel parity leftovers not absorbed by F4.2:** the `u32` consumer gap
  (`host.vertexIndex` casts) and `HostBinding.stages` validation enforcement — small,
  validation-shaped, routable anytime.
- **Roadmap hygiene:** reconcile/retire `work-plan.md`; refresh
  `planet-pipeline-poc-feasibility.md` against F3.6 (its P0 is half-landed) — after F4.2, P1-P3
  point directly at the vertex-kernel machinery.

## Open questions this plan deliberately does not resolve

- **Auto-lowering:** should higher-level field graphs eventually compile into
  `stage.vertexKernel`/`stage.fragmentKernel` automatically, keeping stage nodes as an
  expert-level layer? (Raised in the Codex review's risk list; real, not urgent — F4's command
  vocabulary is a prerequisite either way.)
- **Shader linking/dedup:** whether shared-module emission across vertex/fragment/compute pairs
  needs a real linker pass (Codex suggestion) or stays concatenation-with-dedup; revisit at F4.3
  when `MeshResource` materialization multiplies stage combinations.
- **Automated screenshot gates:** manual visual gates caught real bugs every time they ran
  (F3.5, F3.6.6 twice) — worth automating, but that's editor/tooling scope, not F4's.

## What this plan deliberately does not do

Write any milestone's contract — each F4.x gets its own, with its own pre-drafting research, in
the review loop that caught 1-3 real defects per contract across all six F3.6 milestones. It does
not sequence the standard-library reconstruction list (those become sample-authoring briefs after
F4.5, mostly parallelizable). It does not touch M13/renderer-unification gating, `/scene`'s own
renderer, or the accepted CPU-elemental ADR's scope. And per the F3.4 lesson, F4.4's collapse
decision point is flagged now precisely so it cannot silently become a "replace in place" rescope
surprise mid-implementation.
