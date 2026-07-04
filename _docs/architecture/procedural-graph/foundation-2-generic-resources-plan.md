# Foundation 2 — generic resources and frame execution: sequencing plan

**Status:** F2.1–F2.4 all landed (`04f5319`, `397af7f`, `f355221`, `37f496a`) — the sequencing
question F2.4 flagged is resolved: F2.5 (proof) absorbs one minimal, narrowly-scoped channel-read
primitive rather than waiting for Foundation 3, and the buffer-feedback sample uses a hand-written
fragment entry (WGSL's native storage-buffer write) rather than waiting for compute dispatch — see
[F2.5-foundation-2-proof.md](./briefs/F2.5-foundation-2-proof.md) · **Parent:**
[elemental-webgpu-architecture-review.md, Foundation 2](./elemental-webgpu-architecture-review.md#roadmap-realignment)
· **Depends on:** Foundation 1, complete (F1.1 `b36f864`, F1.2 `3768ae2`, F1.5 `129d35e`, F1.3
`d2db00e`, F1.4a `48ea451`) · **Blocks:** Foundation 3 (generic kernels — needs Foundation 2's
resource model to bind against), Foundation 4 (generic command graph), and this plan's own
predecessor concern: correct graph-based vertex displacement, particles, and mesh generation all
wait on Foundation 3, which waits on this.

## Why this is short

Foundation 1 needed extensive investigation because its problems were scattered across the type
system and primitive registration. Foundation 2's problem is narrower and better-understood: a
real frame-graph **pure core already exists, is already generic, and is already tested** — it's
just not wired to anything real, and its type layer is texture-only. This plan is short because
the shape of the work is mostly "generalize an existing, working algorithm" rather than "design
something new."

## What already exists, verified directly

- **`packages/runtime-webgpu/src/frameGraph/order.ts` (282 lines) is already ~90% resource-agnostic.**
  `validatePassGraph`, `buildAdjacency`, `topologicalOrder`, `collectFeedbackTargets`,
  `computeLifetimes`, `buildPassOrder` — the entire dependency-ordering, cycle-detection,
  feedback-detection, and lifetime-computation algorithm — reason only about `pass.writeTarget`/
  `read.target` as opaque string IDs and `read.previousFrame`/`target.persistent` as booleans.
  None of this code touches `RenderTarget.format` or `.size` at all. This is real, tested,
  correct code (`order.test.ts`, 117 lines) that Foundation 2 does not need to rebuild.
- **Only `frameGraph/types.ts` (32 lines) and `resolveTargetSizes` are texture-specific.**
  `RenderTarget.format: GPUTextureFormat`, `RenderTarget.size: TargetSize` (screen-relative/fixed,
  meaningful only for 2D targets), and `ChannelRead.sampler` are the entire texture-only surface.
  This confirms the parent review's framing exactly: "this supersedes texture-only frame-graph
  assumptions" — the assumption is narrow and localized, not pervasive.
- **The pure core is not actually wired to the runtime, verified directly.**
  `GraphFrameExecutor.execute` (`packages/runtime-webgpu/src/graphFrameExecutor.ts`) never calls
  `buildPassOrder` or `resolveTargetSizes` — it calls `planIndependentGraphFramePasses`
  (`graphFramePlan.ts`), which only ever constructs passes with `reads: []` (zero cross-pass
  dependencies), and runs each one through an independent `PipelineGraphExecutor.execute` call.
  The generic ordering algorithm is proven correct in isolation and then bypassed entirely at
  runtime. There is no GPU resource allocation, no feedback/ping-pong, no shared binding model —
  today's "frame graph" only handles the degenerate zero-dependency case.
- **The old `M-pass-graph-executor.md` brief is what built the above, and is honest about its own
  scope.** Its Part 2 (pure core) is exactly what still exists and still passes. Its Part 4 (GPU
  executor) was never built — `executeFrameGraph` as that brief specified doesn't exist anywhere.
  Its target model (Part 1) is the texture-only piece this plan supersedes. Superseding, not
  discarding: the brief's gate items for the pure core are a direct preview of Foundation 2's own
  parity requirement (Foundation 2 must not regress this brief's own tested behavior).
- **F1.3 already reserved the seam.** `PrimitiveImplementation`'s `{ kind: 'resource'; descriptor:
  ResourceDescriptor }` and `{ kind: 'command'; command: GpuCommandKind }` variants exist today as
  deliberate placeholders (`ResourceDescriptor { placeholder?: never }`, `GpuCommandKind = string`,
  `packages/graph/src/implementation.ts:35-39`) — Foundation 2 is what gives `ResourceDescriptor` a
  real shape. This is a separate concept from the pre-existing `ResourceDependency`/`ResourceDataType`
  (`packages/graph/src/types.ts:109-118`, external image/mesh/audio declarations from the M8
  milestone) — do not conflate the two when writing F2.1's contract.

## The key constraint, stated precisely

**Buffer and texture feedback must share one generic resource-history model.** Concretely: the
existing `ChannelRead.previousFrame` / `RenderTarget.persistent` mechanism must become
`read(resource, version: 'current' | 'previous')` / `write(resource, version: 'next')` over a
`Resource` union that includes both buffer- and texture-shaped members — not a texture-history
mechanism with a bolted-on buffer special case. `collectFeedbackTargets`'s current logic (already
generic — it only checks `.persistent`/`.previousFrame`, never `.format`) is the concrete proof
this generalization is achievable without touching the algorithm, only the type it operates over.

## Sequence

1. **F2.1 — generic resource type algebra ✅ done (`04f5319`).** Buffer/texture/sampler
   descriptors, access modes, inferred usage, transient/persistent/history lifetimes. Gives
   `ResourceDescriptor` its real shape (as `ResourceTemplate`/`ResourceInstance`, id-less template
   vs. materialized instance, after a pre-implementation review round). Pure types + inference, no
   runtime allocation yet.
2. **F2.2 — resource dependency planner ✅ done (`397af7f`), rev. 2.** Generalizes `frameGraph/types.ts`'s
   `RenderTarget`/`ChannelRead`/`Pass`/`PassGraph` to the F2.1 `Resource` union as a discriminated
   union (`ResourceTarget` = buffer-shaped variant paired only with an element-count size,
   texture-shaped variant paired only with a pixel size — shape and size can no longer disagree),
   and updates `resolveTargetSizes` to be resource-kind-aware (texture-shaped resources resolve
   viewport-relative pixel dimensions; buffer-shaped resources resolve element count via a new,
   parallel `resolveBufferSizes` function, not an overload of the texture-only one).
   `validatePassGraph`/`buildAdjacency`/`topologicalOrder`/`computeLifetimes`/`buildPassOrder`
   themselves need **no algorithmic changes** — verified above, they already operate on opaque IDs
   and booleans. `collectFeedbackTargets`'s own criterion is corrected, not just generalized: only
   `history`-lifetime targets (genuinely ping-ponged) count as feedback — a `persistent` target is
   exactly one allocation and must not be told apart as needing a second — and the old unconditional
   "always retain the display target" line is removed, since within-frame display retention was
   already `computeLifetimes`'s job, a separate concern from cross-frame ping-pong. Also
   materializes `ResourceInstance`s from a real `GraphDocument` (`collectResourceInstances`,
   `@world-lab/graph`) and reserves (but does not yet consume) planner-level `ResourceBinding[]` on
   `Pass`, per F2.1's own brief. Keep pure and exhaustively headless-tested, matching
   `order.test.ts`'s existing rigor exactly. **Contract:**
   [F2.2-resource-dependency-planner.md](./briefs/F2.2-resource-dependency-planner.md).
3. **F2.3 — runtime resource realization ✅ done (`f355221`), rev. 3.** The actually-missing piece: allocate real WebGPU
   resources (buffers and textures) from F2.2's descriptors and derive usage flags — buffer usage
   via F2.1's `resolveBufferUsage` over `Pass.bindings` (its first real consumer), texture usage
   inferred structurally from the `PassGraph` (written → `RENDER_ATTACHMENT`, read →
   `TEXTURE_BINDING`, display → additionally `COPY_SRC`) since `TypeRef`'s texture variant has no
   declared-usage floor to combine with. Supports persistent buffers and texture/buffer ping-pong
   history (physical double-buffering for anything `collectFeedbackTargets` flags). **Bind-group
   layout derivation is deliberately deferred to Foundation 3** — it needs a kernel's binding-index/
   shader-stage information, which doesn't exist until then; inventing one now would repeat the
   exact F2.2/Foundation-3 circularity F2.1's own revision 3 already caught and fixed. This is
   genuinely new code otherwise — nothing today does GPU-side resource allocation for the frame
   graph. **Contract:**
   [F2.3-runtime-resource-realization.md](./briefs/F2.3-runtime-resource-realization.md).
4. **F2.4 — generic frame executor ✅ done (`37f496a`), rev. 2.** Replace `GraphFrameExecutor`'s independent-only bypass with
   real execution of F2.2's ordered DAG over F2.3's realized resources. Incremental, not a
   flag-day rewrite: today's zero-dependency preview case must keep working throughout (it's the
   trivial case of the general executor, not a separate code path to maintain alongside it). Also
   fixes a blocking defect this milestone's own real multi-target execution exposed in F2.2/F2.3's
   landed code: `inferTextureUsage` only granted `COPY_SRC` to `graph.display`, but
   `buildIndependentPassGraph` only ever marks the *first* independent target as `display` — every
   other live preview target would fail WebGPU validation on readback. Fixed via a new, additive
   `PassGraph.readbackTargets` field (no existing F2.1–F2.3 test breaks).
   **Deliberately does not add a channel-read primitive or any cross-pass WGSL sampling** — no
   primitive/codegen path for that exists yet, and none is authorable today, so this milestone
   wires the ordering/realization machinery into the executable case that already exists. This
   surfaces a real sequencing question for item 5 below: neither proof sample can be built as a
   real document until at least a minimal channel-read primitive (texture case) and/or a minimal
   compute-dispatch capability (buffer case) exists — see the brief's Handoff. **Contract:**
   [F2.4-generic-frame-executor.md](./briefs/F2.4-generic-frame-executor.md).
5. **Foundation 2 proof.** Two bundled, hardcoded samples, not just unit tests: a two-pass
   render-target sample (one pass feeds another, both textures — the ShaderToy-multibuffer-style
   case the old brief targeted) **and** a small buffer-feedback sample (a minimal ping-pong, e.g. a
   cellular-automaton step over a storage buffer — via a hand-written fragment entry using WGSL's
   native storage-buffer write, not a compute dispatch, so this doesn't wait on Foundation 3). The
   buffer sample is not optional polish — it's the concrete test that the resource-history model
   didn't quietly stay texture-only under a more general-looking type signature. Per this project's
   standing instruction, both are pickable editor samples, not headless-only fixtures. Narrowly
   scoped: one new `input.channel` host-input primitive + WGSL emission branch (using the
   already-reserved `HostBinding{context:'read-resource'}` and already-existing `BindingDecl`
   texture/sampler/storage-read kinds), not Foundation 3's generic kernel/binding model. **Contract:**
   [F2.5-foundation-2-proof.md](./briefs/F2.5-foundation-2-proof.md).

Only once Foundation 2's resource model is real does Foundation 3 (generic vertex/fragment/compute
kernels) have something correct to bind against — kernels need typed resource bindings, and
Foundation 3 built against today's texture-only assumptions would need redoing.

## What this plan deliberately does not do

It does not design Foundation 3's kernel model (a separate planning pass once Foundation 2 lands).
It does not attempt memory aliasing/pooling optimization (explicitly out of scope in the original
frame-graph brief too, and still not needed for correctness). It does not estimate calendar time.
