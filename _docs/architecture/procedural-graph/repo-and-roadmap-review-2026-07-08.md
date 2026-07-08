# Repo and roadmap review — post-Foundation-3 (2026-07-08)

**Status:** review findings, **not a contract** — no Fix steps, no Gate items; every suggestion here
needs its own scoping/contract pass before routing · **Scope:** the whole app against the stated
objective — *render arbitrary things (planets, atmosphere) in the scene editor through the graph,
plus audio processing, DOM updates, etc.* — reviewed the day Foundation 3 closed (F3.1-F3.5 +
F3.6.1-6 all landed) · **Method:** direct code reads with file:line citations (per-frame execution
path traced end to end), plus the roadmap documents themselves
([work-plan.md](./work-plan.md), [elemental-webgpu-architecture-review.md](./elemental-webgpu-architecture-review.md),
[planet-pipeline-poc-feasibility.md](./planet-pipeline-poc-feasibility.md),
[pending_issues.md](../../pending_issues.md)) and the F3.x post-landing verification records ·
**Author:** Opus

## Where the app actually is

Foundation 1-3 are complete: elemental contracts, generic resources with lifetimes/feedback, and
generic kernels — closing with a graph-authored vertex+fragment kernel pipeline
(`stage.vertexKernel` + `stage.fragmentKernel`) rendering noise-displaced geometry with a real
interpolated varying, visible in the editor as a bundled sample. That is a genuine architectural
milestone: the "everything is a special-cased executor" era is structurally over *for the paths
Foundations touched*. But the review below finds the app's per-frame execution model, several
capability cliffs, and the roadmap documents themselves have not caught up — and some things the
stated objective needs have no roadmap home at all.

---

## Part 1 — App-state findings not on any roadmap (or under-planned)

### 1.1 The preview loop recompiles the world and round-trips through the CPU every frame (HIGH)

The single largest gap between the current app and "render arbitrary things." Confirmed by direct
read, the full per-`requestAnimationFrame` cost today
(`packages/graph-editor/src/previewFrameLoop.ts:63-131` → `graphFrameExecutor.ts:70-158` →
`pipelineGraph.ts` → consumers):

| Per-frame work | Evidence | Should happen |
|---|---|---|
| Full structural graph validation | `pipelineGraph.ts:241` (`validateGraph(doc)` inside `planPipelineGraph`, called per pass per frame) | Once per edit (`compileSignature` already exists in `GraphEditor.svelte`'s effect) |
| Document walks: `planIndependentGraphFramePasses` + sink derivations — **run twice per tick** (once in `previewFrameLoop.ts:70-72`, again inside `graphFrameExecutor.ts:71-82`) | both files | Once per edit |
| Full WGSL re-emission: `compileGraph` (slice + module resolution) + `emitGraph*Eval` walks + string assembly | `fullscreenFragment.ts`/`kernelFragment.ts`/`vertexKernelPosition.ts`, every `execute` call | Once per edit, cached by signature |
| `device.createShaderModule` + `createRenderPipeline(Async)` | `fullscreenFragment.ts:270-272`, `kernelFragment.ts:124-125` | Pipeline cache keyed by code hash (Foundation 4 names this in one bullet) |
| Uniform/params/readback `GPUBuffer`s created **and destroyed** | e.g. `fullscreenFragment.ts` (uniform/params/readback per call, `.destroy()` at end) | Persistent buffers + `queue.writeBuffer` |
| One `createSampler` per channel | `fullscreenFragment.ts:174` | Device-lifetime sampler cache |
| **GPU→CPU readback stall per pass**: `copyTextureToBuffer` + `await mapAsync` + row-unpadding copy into a fresh `Uint8Array` | every consumer's tail; passes awaited serially in `graphFrameExecutor.ts:98-135` | Not at all, for display — render into the canvas's own `getCurrentTexture()` and keep readback only for tests/probes/CPU preview |
| `putImageData` onto a 2D canvas | `previewFrameLoop.ts:174-176`, `GpuPreviewPanel.svelte:59-61` | Direct WebGPU canvas presentation |
| Fixed **256×256** preview resolution | `previewFrameLoop.ts:43` (`width ?? 256`) | Target-sized, per the pass-graph model already designed in `inputs-cpu-and-resources.md` |

None of this was wrong to build — every piece was the honest minimum for its milestone, and the
readback path is exactly what the test suite needs. But it means the app's *rendering architecture*
is currently a screenshot pipeline, not a renderer. A planet with atmosphere at 60fps cannot ship
on it, and — more subtly — **every new sample built until this changes bakes the pattern in
deeper.** Foundation 4's realignment section contains one bullet ("runtime pipeline and binding
caches") that covers roughly a third of this table. The rest (canvas presentation vs readback,
edit-time vs frame-time validation/emission, buffer/sampler persistence, per-target resolution) has
no roadmap line anywhere. **Suggestion:** make "performance and presentation foundation" the
*first* F4 milestone, not an implicit byproduct — see Part 2.2.

### 1.2 No depth buffer in the graph pipeline path — while two sibling executors each carry a private one (HIGH)

The entire F3.x pipeline path (`fullscreenFragment.ts`, `kernelFragment.ts`) renders with color
attachments only — no `depthStencilAttachment`, anywhere. Meanwhile `surfaceMeshPreview.ts:290,436`
and `vegetationPreview.ts:692` each configure their own `depth24plus` setup privately — exactly the
domain-specific siloing the elemental review exists to eliminate. F3.6.6's displaced plane renders
correctly only because one plane can't occlude itself meaningfully; the moment a sample has two
overlapping surfaces (a planet in front of a skybox, an atmosphere shell over terrain), the graph
path produces wrong output with no error. The elemental review covers this nominally ("`target.depth`
→ texture attachment with a depth format"; F4 "attachment descriptors") but no milestone names it.
Given three code sites already reinvent or omit it, depth should be an explicit early-F4 item.

### 1.3 No camera/view-projection model in the graph path (HIGH)

Confirmed during F3.6.4's design pass and unchanged: the pipeline model is flat-NDC — the vertex
path lifts `vec3f → vec4f(p, 1.0)` with no view/projection anywhere. The scene editor solves camera
CPU-side with double precision (`lib/planet/camera/`, `math/`); the graph runtime has nothing, and
no roadmap item names "camera/view uniform semantics for graph pipelines." The planet PoC (P1/P4)
implies it — the existing planet shader binds `ViewUniforms` — but never states it as a capability
gap the way it states instance inputs. Planet-scale rendering also needs the camera-relative /
body-local f32 precision policy (mentioned today only inside `pending_issues.md`'s *particle*
bullet). **Suggestion:** define a standard host-binding semantic for view/projection (the same
`HostBinding` mechanism `host.iTime` uses — precedent already proven), plus a documented precision
policy, as a named F4 item.

### 1.4 The F3.6 capability cliffs — six flagged gaps, zero scheduled (MEDIUM, cheap)

Each was honestly flagged in an F3.6 closeout or design doc; none has a roadmap home:

1. **Vertex kernels can't read time** — `assembleVertexKernelPositionModuleAsync` has no ShaderToy
   uniform support, so displacement is static-only (F3.6.6 Out of scope).
2. **Vertex-side `GraphParams` can't be bound** — any param-bearing node in a vertex slice emits a
   `@binding(0)` uniform nothing binds; F3.6.6's sample had to be *designed around* this
   (raw unscaled noise, no amplitude control — a real authoring limitation, not just a test dodge).
3. **One varying (`uv: vec2f`) in practice** — mechanism is array-shaped but unproven beyond one;
   a planet needs normal + world-pos + uv at minimum.
4. **`host.vertexIndex`/`host.instanceIndex` have zero usable consumers** — no `u32→f32` cast or
   coercion exists (F3.6.4 finding).
5. **`HostBinding.stages` unenforced** — wiring a vertex-only input into a fragment graph fails as
   an undecipherable WGSL compile error rather than a validation finding (flagged since F3.6.4,
   pre-existing).
6. **`stage.vertexKernel` + legacy `stage.fragment` unsupported** (F3.6.6 Out of scope).

Individually small; collectively they are the difference between "a vertex kernel exists" and "a
vertex kernel is an authoring tool." **Suggestion:** one consolidated "vertex-kernel parity"
milestone (probably 2-3 briefs) rather than six orphaned fixes discovered by users.

### 1.5 Three render paths, no convergence trigger (MEDIUM)

The codebase now carries: (a) the legacy ShaderToy path (`stage.vertex`/`stage.fragment`,
`resolveVertexAssembly`'s hand-written WGSL), (b) the kernel path (F3.6, including the nested
special-case branch inside `PipelineGraphExecutor.execute`), and (c) the scene editor's entirely
separate `PlanetRenderer`/`WebGPUBackend`. The elemental review's own acceptance criterion —
"adding a sample must not add a new domain-specific executor" — is satisfied in letter but the
F3.6.6 nested branch is a mini-variant, and the D2 decision ("don't replace `stage.vertex`/
`stage.fragment` in place") explicitly deferred retirement *to a later evidence-backed decision*
that nothing now owns. Foundation 4's command graph is where (a) and (b) should collapse into
data-driven draw/pass nodes; `renderer-unification-plan.md` gates (c). **Suggestion:** F4's plan
should state the collapse of (a)/(b) as a deliverable, and D2's retirement decision should be
attached to it by name — deferrals without owners become permanent.

### 1.6 `rgba8unorm`-only, no float targets, no mipmaps, no MSAA (MEDIUM)

Every target in the graph path is hardcoded `rgba8unorm`. Atmosphere scattering computed in 8-bit
will band visibly; HDR planet lighting needs `rgba16float` intermediates. The elemental surface
section lists texture formats generically; no milestone owns "float render targets." Cheap to add
once the resource model carries formats (it already does — `RenderTarget.format` exists in the
frame-graph core; the consumers ignore it).

### 1.7 External resource GPU binds still missing (MEDIUM, known)

Cross-pass render-target reads landed (F2.5); *asset* binds (an image file as `iChannel0`, audio
FFT as a texture) did not — `pending_issues.md` tracks it ("M8 delivered CPU views only") but it
sits outside the Foundation plans' ordering. It gates ShaderToy parity (S1) and any textured planet
material. Small, well-understood, should be slotted explicitly.

### 1.8 A geometry "cache" that caches nothing (LOW, honesty item)

`PipelineGraphResourceCache.realizeGeometry` (`pipelineGraph.ts:~60-70`) adds a fingerprint to a
`Set` and increments a counter — no GPU resource is retained or reused. Harmless today (grid
positions are pure per-vertex arithmetic; there is nothing *to* cache), but it reads like
infrastructure and is asserted on by tests as if it were. When F4's `MeshResource` lands, either
make it real or rename it — a cache-shaped no-op is exactly the kind of thing a future contract
builds on by mistake.

---

## Part 2 — Roadmap findings

### 2.1 `work-plan.md` is the stated priority order and it predates everything that happened (HIGH)

Dated 2026-06-29 — before Foundation 1 landed. Verifiable staleness: Tier 2 lists the "frame-graph
GPU executor" (landed, F2) and the "graph-driven mesh-gen consumer" (landed 2026-07-03, per
`pending_issues.md`'s own ✅); Tier 1 item 4 shows params-as-inputs "editor+codegen pending" while
`pending_issues.md:19-27` marks it ✅ done 2026-07-03. It never mentions the Foundation sequence,
audio, streams, or DOM egress at all. Meanwhile **three roadmap documents coexist** — work-plan's
tiers, the elemental review's Foundation realignment, and the planet PoC's S/P milestones — and
only the Foundation plan docs track landed state. Anyone (human or agent) reading `work-plan.md` as
"what's next" gets a 9-day-old wrong answer. **Suggestion:** one reconciliation pass: either retire
`work-plan.md` (fold the still-live rows into the elemental review's realignment section, which is
maintained) or regenerate it against post-F3.6 reality. Cheap, high leverage for a
multi-agent workflow where documents are the coordination medium.

### 2.2 Foundation 4 is the critical path and has five bullets where F1-F3 each had a plan document (HIGH)

Everything in the stated objective that isn't audio/DOM funnels through F4: multi-mesh scenes,
depth, cameras, draw-indexed real meshes, instancing, pipeline caching. F1-F3 each got a dedicated
sequencing plan with verified current-state sections and milestone gates — a process that
demonstrably worked (every F3.6 contract's pre-routing review caught 1-3 real defects, including
three separately-unbuildable gate items). F4 has five bullets in the realignment section.
**Suggestion:** draft `foundation-4-command-graph-plan.md` next, and sequence it so the app stops
accruing debt against 1.1-1.3 immediately. A candidate shape (to be validated by its own
pre-drafting research, not committed here):

- **F4.1 — performance & presentation foundation** on the *existing* path: compile/pipeline caches
  keyed by `compileSignature`+code hash, edit-time validation, persistent uniform buffers,
  canvas-context presentation, readback demoted to probes/tests. No new nodes. (Closes 1.1.)
- **F4.2 — depth + camera:** depth attachment descriptors on the pass model, view/projection host
  bindings with a precision policy. (Closes 1.2/1.3.)
- **F4.3 — `MeshResource` + `draw`/`drawIndexed` command nodes** (the elemental review's typed
  buffer-view composition), replacing `buffer.persist`'s geometry special case.
- **F4.4 — `render.pass` with ordered `list<DrawCommand>`** — multi-mesh into one target
  (absorbing `pending_issues.md`'s multi-mesh bullet), blending/write-mask state.
- **F4.5 — instanced + indirect draw** (absorbing the particles-precursor capabilities 2 and 3
  from `pending_issues.md`'s reframing).
- **F4.6 — proof:** a bundled multi-mesh scene sample (several meshes + depth + camera orbit),
  the visual-gate convention as always.

Then the **standard-library reconstruction** list (fullscreen effect → stored mesh → displaced
grid → multi-mesh → particles → vegetation → ShaderToy feedback → planet patch) stops being
blocked and becomes mostly *sample-authoring* work, which parallelizes well.

### 2.3 Audio is in the objective, unblocked since Foundation 1, and scheduled nowhere (HIGH)

The elemental review's own realignment says audio Phase A "has no Foundation 2-4 dependency at
all… can be briefed and start independently, in parallel." That was written 2026-07-03; nothing
has scheduled it, and `work-plan.md`'s tiers never mention audio. It is the single largest
objective item that could progress *today* without touching the F4 critical path — a genuinely
parallel track for a second implementer. **Suggestion:** brief audio Phase A (block consumer,
mic/file input, one `evalCPU` primitive, wired `AudioPreviewPanel`) as a parallel-track item now.

### 2.4 DOM updates hinge on E1, and E1 is "may route" (MEDIUM)

The graph→host egress story (`signal<T>`, `sink.host` — how a graph updates DOM, scene selection,
pick results) is well-specified in `stream-graphs.md`/`cpu-elemental-model.md`, ADR accepted rev. 3,
and gated on E1 which "may route after rev. 3 ADR merge." If DOM updates are a first-class
objective, "may route" should become a tiered commitment — E1 is also the unblock for streams,
picking (Phase B+), and mesh/nav phases, so it has unusually high fan-out for one milestone.

### 2.5 The planet PoC document doesn't know Foundation 3 happened (MEDIUM)

`planet-pipeline-poc-feasibility.md`'s capability list (§5) still describes as "designed but
unbuilt": the instance/vertex-index input model (P0 — `host.vertexIndex`/`host.instanceIndex`
landed in F3.6.4, though unusable pending the `u32` gap, and per-instance buffer binding remains),
multi-output compile + stage entry points (landed across F3.2/F3.6.5 — `assembleStageEntry`,
typed varyings, shared-function emission into paired stages), and S0's fullscreen-fragment
consumer (landed long since). The PoC's P1 ("tessellator composition nodes… reproduce one patch's
body_dir/world_pos") is now *directly* buildable on `assembleVertexKernelPositionModuleAsync`'s
machinery rather than needing new design. **Suggestion:** a refresh pass marking S0/P0-partial as
landed and re-pointing P1-P3 at the F3.6 primitives — otherwise whoever picks up the PoC will
re-derive or, worse, re-design what exists.

### 2.6 Deferred decisions need owners (LOW, process)

Three explicit "later, evidence-backed decision" deferrals now exist with no trigger attached: D2
(retire `stage.vertex`/`stage.fragment`?), the `u32` consumer gap, and `HostBinding.stages`
enforcement. Each was the right call at the time; each becomes permanent by default. Attach each to
a named future milestone (D2 → F4's path collapse; `u32` + stage enforcement → the vertex-kernel
parity milestone from 1.4) so the deferral has an expiry.

### 2.7 Process items worth keeping / fixing (LOW)

- **Keep contract-first + pre-routing review.** The F3.6 record is unambiguous: every one of six
  contracts had 1-3 real defects caught before routing (three would have been unbuildable gates);
  post-landing reviews caught a wrong task-board hash, a missing cycle guard, and a contract gap
  the implementer had to compensate for. The overhead pays.
- **Fix the stale-`dist` check drift with tooling, not memory.** `pending_issues.md` documents it;
  it also bit this reviewer mid-F3.6 (app build attempted before package `dist` rebuild). A
  pretest/precheck hook (`rm -rf packages/*/dist`) or an exports-condition fix is an hour of work
  that removes a recurring class of false verification.

---

## Part 3 — Objective coverage matrix

The stated objective, mapped to current state and roadmap home:

| Objective | Current state | Roadmap home | Gap |
|---|---|---|---|
| Planets in scene editor via graph | Scene editor renders planets via its own hand-written pipeline; graph path can displace a plane (F3.6.6) | PoC S/P plan (stale, §2.5) + M13 (gated on renderer unification) | F4 (depth/camera/mesh/draw), PoC refresh, then P1-P5 |
| Atmosphere | Hand-written in scene editor | none names it | Float targets (1.6) + blending + depth (1.2); a fullscreen-raymarch sample is achievable post-F4.2 |
| Arbitrary meshes/scenes | `target.mesh` preview only; no multi-mesh render into a display target | `pending_issues.md` multi-mesh bullet; F4 bullets | F4.3/F4.4 |
| ShaderToy parity | Fragment path solid; cross-pass reads landed; feedback (ping-pong) partial; `iChannel` assets missing; `iMouse` raw landed | S0.5/S1 rows | 1.7 + S0.5 completion |
| Audio processing | `audio` resource type + CPU views exist; no consumer, no panel wiring | audio-graphs.md Phase A (unscheduled) | §2.3 — schedulable today |
| DOM updates / host egress | Nothing | stream-graphs `sink.host`/`signal<T>`, blocked on E1 | §2.4 — commit E1 |
| Real-time performance | Per-frame recompile + readback at 256×256 (1.1) | one F4 bullet | §2.2 — F4.1 first |

## What this review deliberately does not do

Commit to any milestone, sequence, or contract — every numbered suggestion needs its own
pre-drafting research pass (the F3.x record shows first-draft scoping is reliably wrong in at
least one load-bearing way). It also does not audit the scene editor's internal renderer quality,
the `/scene` route UX, or `packages/subdivide` — the objective quoted at the top concerns the
graph pipeline's reach, and that is what was reviewed. Nothing here diminishes what landed:
Foundation 1-3 built the right substrate, reviewed hard, with every proof real. The findings above
are what stands between that substrate and the stated objective.
