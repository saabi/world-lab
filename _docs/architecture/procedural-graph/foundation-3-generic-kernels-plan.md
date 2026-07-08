# Foundation 3 — generic kernels: sequencing plan

**Status:** in progress — F3.1 `4c28431`, F3.2 `0c4b7d8`, F3.3 `2dc6009` landed and independently
verified; F3.4 rescoped after pre-drafting research (see its sequence entry below) and F3.6 added
as a result · **Parent:**
[elemental-webgpu-architecture-review.md, Foundation 3](./elemental-webgpu-architecture-review.md#foundation-3-generic-kernels)
· **Depends on:** Foundation 2, complete (F2.1 `04f5319`, F2.2 `397af7f`, F2.3 `f355221`, F2.4
`37f496a`, F2.5 `35a75fb`+`984bfcb`) · **Blocks:** Foundation 4 (generic command graph), correct
graph-authored vertex displacement, particles, and mesh generation (the standard-library
reconstruction list in the parent review).

## Why this is a from-scratch design effort, not a follow-on contract

Foundation 2 generalized *resources* — buffers, textures, lifetimes, the pass DAG — over an
already-generic, already-tested pure core (`frameGraph/order.ts`) that just needed a wider type to
operate over. Foundation 3 has no equivalent pure core to generalize: today's "vertex" and
"fragment" stages are two independent, hardcoded special cases, not one narrow-but-real mechanism
with a texture-shaped blind spot. There is nothing today playing the role `order.ts` played for
F2 — no generic kernel abstraction exists to widen. This plan is longer than F2's because the
shape of the work is "design something new," not "generalize an existing algorithm."

## What already exists, verified directly

- **The primitive-implementation union already reserves the exact seam.**
  `PrimitiveImplementation`'s `{ kind: 'kernel'; stage: ShaderStage }` variant
  (`packages/graph/src/implementation.ts:71`) has been declared since F1.3 with **zero consumers
  anywhere** (confirmed by grep — the only match for `'kernel'` in non-test code is the type
  declaration itself). `ShaderStage = 'vertex' | 'fragment' | 'compute'`
  (`implementation.ts:9`) is already the right shape. Foundation 3 is what gives this variant real
  content, the same way F2.1 gave `{ kind: 'resource' }`'s `ResourceDescriptor` real content.
- **Today's `stage.vertex`/`stage.fragment` are not kernels — they're two unrelated hacks**
  (`packages/graph/src/primitives/pipeline/index.ts:28-58`, verified directly). `stage.vertex` is
  `{ kind: 'wgsl-function'; moduleId: 'stage.vertex'; entry: 'vertexStage' }` — a fixed function
  reference, not graph-authored logic. `stage.fragment` is
  `{ kind: 'legacy-structural'; marker: 'stage.fragment' }` — a marker the compiler special-cases
  entirely outside normal primitive emission. Neither uses `{ kind: 'kernel' }`. There is no
  `stage.compute` primitive at all.
- **The actual "vertex stage" today is a fixed plane/grid generator with zero graph-authored
  displacement** — confirmed via `assemblePipelineVertexWgsl`/`resolvePipelineGeometryParams`
  (`packages/runtime-webgpu/src/pipelineVertex.ts`): the only per-graph inputs are `resU`/`resV`/
  `width`/`height`/rotation — grid shape parameters, never a graph-computed position. This is
  precisely the parent review's "Mode A vertex-displacement gap": there is no way today to author
  vertex logic in the graph at all, only to pick a grid resolution.
- **`assembleStageEntry` (`packages/compiler/src/stageEntry.ts`) is already
  stage-aware but each template is a single fixed shape, not a generic contract** — verified by
  direct read (lines 56-68). The `fragment` template always returns one `@location(0) vec4f` from
  one function call. The `compute` template already accepts a `workgroupSize` option, but its
  emitted attribute is wrong: `stageEntry.ts:63` produces `@compute @workgroupSize(...)` (no
  underscore) — not valid WGSL, which requires `@workgroup_size`. `stageEntry.test.ts:45` asserts
  that same wrong string, so the bug is enshrined in its own test, not just an unnoticed typo. Every
  real compute shader in the codebase (`planeScalarPreview.ts`, `vegetationCandidates.ts`,
  `meshGen.ts`, `compiledWgsl.ts`) is hand-written with the correct `@workgroup_size` and bypasses
  this template entirely — which is exactly why the bug has stayed live. **Correction (found
  re-verifying for F3.3): `GPUComputePipeline`/`dispatchWorkgroups` calls do already exist in
  `runtime-webgpu`** — `planeScalarPreview.ts`, `meshGen.ts`, and `vegetationCandidates.ts` each
  hand-roll their own `createComputePipeline`/`dispatchWorkgroups` call, confirmed by grep
  (`createComputePipeline` appears at `planeScalarPreview.ts:81`, `meshGen.ts:447`,
  `vegetationCandidates.ts:396`). What is genuinely still zero is any compute pipeline built
  through the *generic* model this plan is about: none of the three goes through
  `assembleStageEntry`'s compute branch, none uses `KernelBindingTemplate`/`resolveKernelBindings`
  for its bind group, and every one hand-assembles its own `GPUBindGroupLayoutEntry`s and manual
  buffer allocation with no shared abstraction between them. F3.3's "first real compute pipeline"
  framing (below) is corrected to mean the first one built through this generic model, not the
  first compute pipeline in the package. The
  `vertex` template's `VSOut` struct declares only `@builtin(position)` — no varyings field exists
  or could be added without changing the template, confirming there is no typed-varyings mechanism
  today, generic or otherwise.
- **`BindingDecl.kind` has no read-write storage variant**
  (`packages/compiler/src/stageEntry.ts:8`: `'uniform' | 'storage-read' | 'texture' | 'sampler'`).
  This is not a hypothetical gap — F2.5 hit it directly and had to route around it: its
  buffer-feedback sample's WGSL declares `var<storage, read_write> next: array<f32>`, and F2.5's
  own brief states explicitly it bypasses `assembleStageEntry` entirely "so there is exactly one
  place these bindings are declared" (`F2.5-foundation-2-proof.md`, Fix C, item 11) precisely
  because the generic path couldn't express it. Foundation 3 is what removes the need for that
  detour going forward (F2.5's own sample is not required to migrate).
- **`Pass.bindings`/`ResourceBinding[]` (reserved by F2.2, first consumed by F2.3) still has
  exactly one consumer today: `resolveBufferUsage`, for usage-flag inference**
  (`packages/runtime-webgpu/src/frameGraph/realize.ts:59`, confirmed by grep — the only other
  reference is the "no realized target" error message at line 95). Nothing today turns
  `Pass.bindings` into an actual `GPUBindGroup`. Every bind group built so far
  (`fullscreenFragment.ts`, `bufferFeedback.ts`) is hand-assembled per-consumer, not derived from
  this already-generic planner-level data. This is the concrete gap between "the planner knows
  what a pass reads/writes" and "the runtime builds the bind group from that knowledge alone."
- **`{ kind: 'command'; command: GpuCommandKind }` is a separate, still-inert placeholder**
  (`implementation.ts:62,72`) with `GpuCommandKind = string` — no real shape, one incidental
  reference in `coercion.ts:59` (a structural-equality check, not real usage). This is Foundation
  4's seam, not Foundation 3's — see "What this plan deliberately does not do."
- **Stage-visibility restriction already has a precedent — `HostBinding.stages?: ShaderStage[]`
  (`implementation.ts:21`), used today by `host.fragCoord` (`stages: ['fragment']`,
  `packages/graph/src/primitives/host/fragCoord.ts:14`) — but it is declared, not enforced.**
  Confirmed by grep: `emitGraphEval.ts` never reads `binding.stages` anywhere: nothing checks a
  host-input's declared stage restriction against the stage actually being emitted for. A kernel's
  new resource-binding stage visibility should reuse this same field shape (not invent a second,
  parallel one), but should be validated where `HostBinding.stages` currently is not — a real,
  narrow enforcement gap this milestone closes for its own new bindings, without retrofitting
  `HostBinding`'s pre-existing, separate gap (out of scope — see below).
- **Package dependency direction constrains where a graph-level/compiler-level binding split can
  live**: `@world-lab/graph` has zero workspace dependencies beyond `@world-lab/schema`;
  `@world-lab/compiler` depends on `@world-lab/graph` (never the reverse); `@world-lab/runtime-webgpu`
  depends on both (confirmed via each package's `package.json`). A graph-level `KernelBindingTemplate`
  must therefore live in `@world-lab/graph`, and any pure translation to the compiler's `BindingDecl`
  must live in `@world-lab/compiler` (which can import from `graph`) — not the other way around.

## The key constraint, stated precisely

**A kernel is a typed contract over three things — built-in stage inputs, arbitrary resource
bindings, and (for vertex→fragment) typed varyings — and all three must be expressed through the
one `{ kind: 'kernel'; stage }` shape**, not three independent one-off mechanisms the way
`stage.vertex`/`stage.fragment`/(absent)`stage.compute` are three unrelated hacks today. Concretely:
`BindingDecl` needs the missing `storage-read-write` kind before any compute kernel or read-write
buffer kernel can be expressed at all; `assembleStageEntry`'s vertex/fragment templates need a real
varyings struct (not just `position`) before graph-authored vertex displacement can produce
anything a fragment kernel can consume; and the compute template needs both its `@workgroupSize`
attribute-name bug fixed and an actual runtime consumer (pipeline creation + dispatch) before it
does anything. Each of these three gaps is independently verified above and independently
necessary — none is optional polish.

## Sequence

1. **F3.1 — kernel & binding type algebra (pure types, no runtime dispatch yet).** Give
   `{ kind: 'kernel'; stage }` its real declared shape, with a **graph-level `KernelBindingTemplate`
   kept independent of the compiler's `BindingDecl`** (separate types in separate packages, joined
   later by a pure translation, not merged into one shape): shader name, binding index, resource
   type, access, and stage visibility per declared binding. Built-in stage inputs stay on the
   existing `HostBinding` path for this milestone; F3.1 only gives resource bindings their own
   validated template/resolution model. A pure `resolveKernelBindings` function specifies
   exactly how a kernel's static, id-less binding templates map to per-pass
   `ResourceBinding.resourceId` (a caller-supplied name→id table, mirroring how F2.1's own
   `ResourceTemplate`→`ResourceInstance` split deferred document-walking to F2.2) — this is the
   milestone's actual deliverable, not just a type declaration. Add `storage-read-write` to
   `BindingDecl.kind` and its WGSL address-space table (`stageEntry.ts`'s `bindingVar`). This
   milestone's binding-declaration codegen is `Pass.bindings`'s first consumer beyond usage
   inference, but still does not build actual `GPUBindGroup`s. Scoped like F2.1: types + pure
   resolution functions + tests, no GPU objects.
2. **F3.2 — typed varyings (vertex → fragment).** The direct fix for the Mode A vertex-displacement
   gap. Extend `assembleStageEntry`'s vertex/fragment templates so a vertex kernel can declare named,
   typed varying outputs beyond `position`, emitted as a real `@location(n)`-tagged struct shared
   between a vertex/fragment kernel pair (matched by name and type, rejected on mismatch — the same
   "reject the mismatch clearly" discipline F2.5 used for its own dimension contract). This is where
   `stage.vertex` gets an actual graph-authored alternative to the fixed plane/grid generator, reusing
   the same graph-slicing/emission machinery already proven for fragment kernels
   (`emitGraphVec4Eval`'s family), not a new codegen path. Primarily compiler-side; the existing fixed
   grid path must keep working throughout (same incremental discipline as every prior milestone).
3. **F3.3 — compute kernels and dispatch domains.** The first `GPUComputePipeline` creation and
   `dispatchWorkgroups` call built through the *generic* kernel/binding model — not the first
   compute pipeline in `runtime-webgpu` at all (three hand-rolled ones already exist,
   `planeScalarPreview.ts`/`meshGen.ts`/`vegetationCandidates.ts`, none going through
   `assembleStageEntry`'s compute branch or `KernelBindingTemplate`, see the correction above). Also
   fixes
   `assembleStageEntry`'s compute template so it emits `@workgroup_size` (WGSL-valid) instead of its
   current `@workgroupSize` (verified above — not fixed in F3.1, since F3.1 touches only `graph`'s
   binding types and `stageEntry.ts`'s `storage-read-write` binding kind, not its compute-entry
   template; this is dead code with zero callers until F3.3 gives it its first one, so fixing it
   here rather than as an isolated drive-by keeps the fix next to its first real test coverage).
   `StageEntryOptions.workgroupSize` (declared, unused) becomes real. A dispatch-domain derivation
   function computes `[x, y, z]` workgroup counts from a bound resource's element count or texture
   dimensions (or an explicit param), mirroring F2.2's `resolveBufferSizes`/`resolveTargetSizes`
   resource-kind-aware sizing split. Compute bind groups assembled through F3.1's generic model,
   including the new `storage-read-write` kind — this is what makes a *future* rewrite of F2.5's
   hand-written fragment-shader storage-write workaround unnecessary (not required as part of this
   milestone; F2.5's own sample stays as-is). **Dispatch stays a plain runtime function call** —
   analogous to `BufferFeedbackExecutor.execute`, not a new graph-representable command node.
   `{ kind: 'command'; command: GpuCommandKind }` stays untouched by this milestone; no temporary or
   placeholder command primitive is introduced to carry dispatch — that seam is Foundation 4's,
   entered only once, not pre-built here and redone there.
4. **F3.4 — first real graph-authored compute kernel, wired into `GraphFrameExecutor`.** **Revised
   from the original "replace `stage.vertex`/`stage.fragment`'s hardcodes" framing** — pre-drafting
   research (see the F3.4 brief's own Context/Verified current state) found that framing doesn't fit
   F3.1's design: `stage.vertex`/`stage.fragment` are generic, reused-by-every-pipeline primitives
   whose actual binding set (host uniforms, channels, params) is discovered dynamically per document,
   while `KernelBindingTemplate[]` is validated *statically*, once, at primitive registration —
   a fixed signature, not a per-document-varying one. Converting `stage.fragment` itself into a
   `{kind:'kernel'}` primitive doesn't work structurally. F3.4 is scoped down to what actually fits
   the static model today: register one new, real, purpose-built compute-kernel primitive with a
   fixed binding set, a new sink to expose it, a document-walking function correlating the kernel's
   declared bindings to real upstream/downstream resource nodes by port name, and `ResourceRealizer`
   integration so `GraphFrameExecutor` can actually call F3.3's `executeComputeKernel` with real,
   frame-managed GPU resources instead of a caller-supplied map. **Purely additive** — does not touch
   `stage.vertex`, `stage.fragment`, `pipelineVertex.ts`, `fullscreenFragment.ts`, or any existing
   sample; zero regression risk to the ShaderToy fullscreen case, F2.5's cross-pass-texture sample, or
   F2.5's buffer-feedback sample (all three stay on their exact current code paths, untouched). The
   harder "true pipeline kernels" problem — dynamic host/resource bindings, typed varyings actually
   producing displaced vertex output, presentation-target compatibility, and what (if anything)
   should eventually replace `stage.vertex`/`stage.fragment`'s hardcodes — is deferred to F3.6.
5. **F3.5 — proof.** Per this project's standing instruction: a bundled, pickable, hardcoded sample
   (not a headless-only fixture) proving a real compute-dispatch kernel through F3.4's wiring —
   mirroring F2.5's own proof-milestone shape and its own visual-gate convention. (Real
   graph-authored vertex displacement is no longer this milestone's proof target — see F3.6.)
6. **F3.6 — pipeline kernels (new, added after F3.4's scoping review).** The deferred, harder
   problem F3.4 explicitly did not attempt: dynamic host/resource bindings (a kernel whose binding
   *set* varies per document, not fixed at registration), typed varyings actually flowing real
   graph-computed data from a vertex kernel to a fragment kernel, presentation-target compatibility
   (`target.display`'s existing `stage.fragment`-shaped contract), and what — if anything — should
   replace `stage.vertex`'s `wgsl-function` hardcode and `stage.fragment`'s `legacy-structural`
   marker. This is a distinct design problem from F3.1's static-binding-template model, not a
   direct extension of it; it needs its own from-scratch design pass (mirroring this document's own
   "why this is a from-scratch design effort" framing for Foundation 3 as a whole) before a
   contract can be written for it. **Design discussion drafted:**
   [f3.6-pipeline-kernels-design.md](./f3.6-pipeline-kernels-design.md) — investigates six
   sub-problems (A)-(F) against the current codebase, recommends deriving binding sets from graph
   structure rather than authoring them, recommends staying additive (new primitives alongside
   `stage.vertex`/`stage.fragment`, not replacing them in place), and sketches a tentative F3.6.1-6
   sequencing. A seventh sub-problem, (F)'s vertex kernel invocation model, got its own follow-on
   design discussion once F3.6.1-3 narrowed the remaining scope:
   [f3.6.4-vertex-kernel-invocation-design.md](./f3.6.4-vertex-kernel-invocation-design.md).
   **Status: F3.6.1 landed `29a3208`, F3.6.2 landed `9183107`, F3.6.3 landed `a26d8fb`, F3.6.4 has
   a design discussion but no contract yet, F3.6.5/F3.6.6 unscoped.**

Each milestone above gets its own full contract (file list, exact signatures, gate-as-failing-tests)
written immediately before it's routed — this document only fixes the sequence and the verified
reasons for it, exactly as `foundation-2-generic-resources-plan.md` did for F2.

## What this plan deliberately does not do

It does not design Foundation 4's command graph — `{ kind: 'command'; command: GpuCommandKind }`
stays inert; turning "invoke this kernel" into a first-class, graph-representable, sequenceable
command (draw/draw-indexed/dispatch/indirect variants, ordered draw collections, runtime
pipeline/binding caches) is Foundation 4's job, not this one's. F3.3 makes a compute kernel
directly *executable*; it does not make dispatch a graph command node. It does not migrate F2.5's
hand-written buffer-feedback WGSL to a generic compute kernel — that sample stays as its own
self-contained proof, unchanged. It does not redesign `compileGraph`'s slicing or `ConsumerShader`
(`stage: string` is already generic enough — confirmed by direct read, `compileGraph.ts:14`,
falling back to `'unknown'` rather than assuming a fixed enum). It does not touch Foundation 1's or
Foundation 2's landed contracts. It does not estimate calendar time.
