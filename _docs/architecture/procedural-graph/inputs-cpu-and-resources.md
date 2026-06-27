# Generic inputs, CPU runtime & resources

**Status:** architecture (design-in-progress) · **Scope:** `packages/graph`
(input/resource port types), `packages/runtime-webgpu` and a companion
`runtime-cpu` (CPU services + resource binding). Part of the
[Procedural Graph System](./README.md).

## Generic from the start

The core (IR, primitives, compiler, linker, editor) is **domain-agnostic from day
one**. Nothing about planets, terrain, or the cube-sphere is privileged in the
engine. Concrete capabilities — tessellation, mesh generation, terrain shaping —
arrive purely as **primitives (or compositions of primitives), each with optional
CPU support**, shipped in the standard library. They make the system *usable*;
they are never special-cased subsystems the core knows about.

Two things therefore need first-class, generic design rather than being bolted on
per-consumer: **what feeds the graph** (inputs and resources) and **how it runs
without a GPU** (CPU support). Both are essentials, not afterthoughts.

## Graph inputs

Inputs are host-provided and typed. Three categories:

- **Procedural inputs** — pure, per-evaluation values: `positionSphere`,
  `positionMeters`, `surfaceNormal`, `uv`, `faceId`, `altitude`, `slope`,
  `curvature`, `seed`. (See [graph-and-compiler.md](./graph-and-compiler.md).)
- **Host / runtime inputs** — per-frame, bound as uniforms: `time`, `camera`
  (view/projection, world position), the **derived frustum**, `pointer`
  (screen coords + projected world ray), `viewportSize`. Some are *computed* on the
  CPU from simpler inputs (frustum planes from view-projection; pointer→ray from
  the inverse camera), which is why they belong to the CPU runtime below.
- **Resource inputs** — externally supplied data bound per session: **image /
  texture**, **mesh**, **audio**. Resolved by the same kind of resolver as WGSL
  modules, bound per session, and may be user-uploaded (so they live in the shared
  document store — see
  [collaboration-and-mcp.md](./collaboration-and-mcp.md)).

## Per-primitive CPU support

Every primitive may carry a CPU evaluator alongside its WGSL emitter
(`evalCPU?(ctx)` on `NodePrimitive`; see
[schema-and-primitives.md](./schema-and-primitives.md)). A primitive that provides
both can run on GPU *or* CPU from the same definition. CPU evaluators power:

- **standalone-editor preview** without spinning up a full GPU pipeline;
- **headless tests** (`vitest`) that check a primitive's numeric output;
- **CPU consumers** — vegetation candidate generation, collision, navigation —
  that need surface values without a render pass.

CPU support is *optional per primitive*: a GPU-only primitive simply omits
`evalCPU`, and consumers that need CPU evaluation validate availability up front.

## Generic CPU runtime services

Some essentials are not the job of any single primitive — they are services the
runtime computes once and exposes as inputs:

- **Camera frustum** — derive the six planes from the view-projection matrix; used
  for culling and LOD scheduling (including tessellation scheduling, below).
- **Pointer / picking** — project mouse/touch screen coordinates into a world ray;
  the basis for selection, hover, and graph-driven interaction.
- **Resource sampling on CPU** — decode/sample bound resources (image pixels, mesh
  attributes, audio samples/FFT bands) so resource-driven graphs evaluate without
  a GPU.

These live in a small framework-agnostic `runtime-cpu` layer so they are shared by
the standalone editor, headless tests, and the planet app alike. They are the
"generic CPU support for essentials" the engine needs to be usable beyond pure GPU
rendering.

## Resource inputs in detail

Each resource type is a typed port with both a GPU and a CPU view:

| Resource | GPU view | CPU view | Typical use |
|----------|----------|----------|-------------|
| Image / texture | sampled texture | pixel array | masks, imported heightfields, decals, lookups |
| Mesh | vertex/index buffers | attribute arrays | custom surfaces, scatter targets, collision proxies |
| Audio | sample buffer / FFT bands as a field | sample/FFT arrays | reactive animation & visuals (a natural WebGPUToy input) |

Resources are *inputs to the graph*, not consumers of it. Binding is per session;
user-uploaded resources round-trip through the document store. A graph that
references a resource declares the dependency the same way it declares a WGSL
module dependency, so the compiler/loader and MCP tooling can reason about it.

## Tessellation & mesh generation as primitives

Tessellation is **not** a privileged subsystem. A tessellator is composed of
primitives:

- a **surface-mapping** primitive — `uv → position / normal` (graph-described,
  shareable; see [runtime-and-tessellation.md](./runtime-and-tessellation.md));
- a **mesh-generation** consumer primitive — a compute primitive that emits
  vertex/index buffers from the mapping.

Each may provide CPU support: the editor runs the mapping on the CPU to build a
cheap preview mesh; the planet app runs the GPU compute primitive under full LOD.
Concrete tessellators (plane, cube-face, cube-sphere, terrain tile) are
**compositions of these primitives** in the standard library — exactly the same
mechanism as any other primitive, with no engine-level special casing.

Only **scheduling** (LOD bands, patch culling, vertex budget, streaming) stays a
runtime concern, and it consumes the generic CPU **frustum** service above. So:
mapping + mesh-gen = primitives; scheduling = runtime; nothing tessellation-
specific leaks into the core graph model.

## Render targets, per-target resolution & the pass graph

> **Updated by [pipeline-as-graph.md](./pipeline-as-graph.md):** render targets are now
> **graph nodes** (`target.render` / `target.display`), and the pass graph **is the graph
> itself** (target nodes + their read/write edges). The runtime still *schedules and
> allocates* (ordering, ping-pong, per-target resolution, transient pool) — everything
> below holds — but authoring is via nodes, not a separate runtime-only structure.


A consumer doesn't render "to the screen" — it writes to a **render target / image
buffer**. The swapchain is one target; offscreen textures are others (ShaderToy's
Buffer A–D + Image). This makes **resolution a per-target value, not a global
`iResolution` uniform** — and since a multi-output graph can drive many fragment/compute
consumers that read each other's targets, this needs first-class design (it does **not**
exist today — each preview hardcodes its own texture + ad-hoc `width`/`height`).

**Render target descriptor** (a runtime/host object, not a graph node):

```
RenderTarget {
  id; format;
  size: { kind: 'screen-relative', scale } | { kind: 'fixed', w, h } | { kind: 'driven', expr }
  // resolved to concrete (w,h) at bind time
}
```

**Per-consumer resolution.** Each fragment/compute consumer declares the target it
**writes**. Its `resolution` host input is bound from *that target's* resolved size — so
two consumers writing to a full-res and a half-res buffer see different `iResolution`. The
fullscreen-fragment consumer's implicit geometry is exactly the user's point: a **plane
tessellator reduced to two triangles, sized to its write target** — a degenerate case of
the same surface-mapping/tessellation model (§"Tessellation as primitives"), not a special
path.

**Per-channel resolution.** When consumer B reads consumer A's target as a resource
**channel**, B also gets that source's resolution (ShaderToy's `iChannelResolution[i]`) —
because B's sampling math needs the *input's* size, which differs from B's own output size.

**Pass graph.** Cross-target reads form a small **render/pass graph**: consumers + their
write targets + read-dependencies. The runtime topologically orders passes per frame, and
supports **single-frame feedback** (a consumer reading its own previous-frame target via
ping-pong buffers — ShaderToy buffer feedback). This is a *runtime composition* layer, the
same architectural role as tessellation scheduling: **the graph declares fields/outputs;
the runtime binds them to targets and orders the passes.** The consumer-stage model
([briefs/M-multi-output-compile.md](./briefs/M-multi-output-compile.md)) must therefore
carry an optional **write-target ref** and **channel→target reads**, so the host can
resolve per-target/per-channel resolution and the pass order. The pass-graph *executor*
itself is a follow-on runtime milestone, separate from the compile driver.

## Inter-target dependencies = a frame graph (implications)

When targets read other targets, the pass graph **is a frame graph / render graph** (the
standard real-time pattern). This is **not ShaderToy-specific** — the existing planet
renderer already is one: `TerrainPass` writes color+depth targets, `AtmospherePass`
samples them. So the same model unifies ShaderToy multi-buffer effects *and* the planet's
terrain→atmosphere→composite chain. Two implications are obvious (resolution access;
dependency-ordered scheduling). The non-obvious ones, roughly in priority order:

1. **Cycles are only legal across frames.** A→B→A *within* one frame is unsatisfiable
   (a value needed before it exists) → **validation error**. A target reading itself or a
   downstream target is legal **only** as an explicit *previous-frame* read, resolved by
   **ping-pong / double buffering** (write frame N while reading N−1). The scheduler must
   detect cycles, reject intra-frame ones, and allocate two physical textures for
   feedback ones.
2. **Read-write hazards / usage flags.** WebGPU forbids a texture bound as **render
   attachment and sampled in the same pass** — so "read my own output" *requires*
   ping-pong, and every target's `GPUTextureUsage` (RENDER_ATTACHMENT | TEXTURE_BINDING)
   must be declared from the dependency graph up front. The scheduler owns the
   usage/transition bookkeeping.
3. **The display is a reader.** "Which buffer the preview shows" is an **edge in the
   graph** (a present/blit pass reads target X). So selecting a different display buffer
   changes an output edge, *keeps that buffer alive* (even if nothing else reads it), and
   never changes the computation. Intermediate buffers must survive if displayed.
4. **Resource lifetime → aliasing & memory.** The DAG gives each target a lifetime (first
   write → last read); non-overlapping lifetimes can **alias one GPU allocation**
   (transient-resource pooling — the core frame-graph optimization). **Persistent** targets
   (feedback/history, displayed buffers) must be excluded from aliasing. Optimization, not
   PoC — but the model enables it.
5. **Sampler/format/resolution-mismatch correctness.** Mixed-resolution reads are the
   *point*, so each channel read carries a **sampler** (filter/wrap) and needs the source's
   resolution (`iChannelResolution`) for texel math; **format** compatibility
   (rgba8/rgba16f/r32f, color vs depth vs data) must validate, and mip/filter/texel-center
   offsets matter.
6. **Cross-stage targets.** Dependencies aren't fragment→fragment only: a **compute** pass
   may write a buffer a **vertex** consumer reads (e.g. the existing patch-cull compute →
   vertex draw, or a heightfield compute → vertex displacement). The frame graph spans
   compute/vertex/fragment uniformly via the consumer-stage model.
7. **Invalidation / recompile scope.** Editing a node dirties only its **downstream
   sub-DAG** — both for shader recompilation and for which passes re-execute. Live-edit
   performance depends on scoping to the affected passes, not re-running everything.
8. **Purity & caching.** A pass that is a pure function of unchanged inputs can be
   **skipped/cached** between frames; passes depending on **time / feedback / live
   resources** cannot. The scheduler needs each pass's purity flag (ties to the
   determinism question below).
9. **Iterative / conditional passes.** Some passes run **N times** (mip pyramids, blur
   ping-pong, iterative solvers) or **conditionally** (enable flag) → the graph isn't
   purely static; target allocation for a mip chain is dynamic.
10. **Resize.** Screen-relative targets reallocate on viewport resize → re-derive
    resolutions and re-bind; the executor handles resize as a first-class event.
11. **Authoring-time validation.** The pass graph has its **own** validation rules
    (distinct from the field-graph's type/space checks): intra-frame cycles, dangling
    target refs, format/resolution/usage incompatibility, read-write-same-pass hazards —
    surfaced in the editor's `ValidationPanel` like field-graph errors.

**Architectural placement (unchanged):** the field graph declares *what each field is*;
the **frame graph** (targets + their read/write edges + scheduling) is a **runtime
composition** layer, same role as tessellation scheduling — authored/declared on
consumers, executed by the runtime. Adopt frame-graph vocabulary (transient vs persistent
targets, lifetimes, barriers) rather than reinventing it. The **pass-graph executor** is
its own runtime milestone; the planet's terrain→atmosphere chain is a ready-made,
already-working test case for it.

## Frame-graph executor (design)

The executor is the runtime that, each frame, takes the set of consumers + their targets +
read/write edges and runs the passes. Design decisions:

**Pass ordering — inferred, with explicit feedback edges.** Order is **inferred** from the
read/write edges (topological sort of the target DAG), *not* hand-authored — authoring an
order duplicates information already in the edges and rots. The one thing that *is*
explicit is a **feedback edge**: a read marked `previousFrame` is excluded from the
ordering DAG (it reads last frame's content) and tells the executor to allocate ping-pong.
So: build the DAG from same-frame reads → topo-sort (error on cycle) → feedback reads are
satisfied from the prior frame's buffer. Iterative passes (run K times) are expanded inline
in the order with K instances sharing two ping-pong buffers.

**Transient-resource pool.** Targets are **transient** by default and **persistent** only
if (a) read as `previousFrame` (feedback/history), or (b) currently selected for display.
The executor:
1. computes each transient target's **lifetime** = [first write index, last read index] in
   the ordered pass list (the display pass counts as a reader);
2. allocates from a **pool keyed by (resolution, format, usage)**; a freed target's
   allocation is reused by a later non-overlapping target of the same key (aliasing);
3. on viewport **resize**, recomputes screen-relative resolutions and reallocates the pool;
4. keeps persistent targets out of the pool (stable identity across frames).

For the PoC the pool can be a trivial "one allocation per target" (no aliasing) — the
*model* admits pooling; the optimization is deferrable. Persistent/feedback handling is
**not** deferrable (correctness).

**Skip/caching.** A pass is re-run if any input changed or it is impure (time / feedback /
live resource / interaction). Pure passes with unchanged inputs are skipped (their target
retains last value — so a skipped pass's target is implicitly persistent that frame). The
executor needs a per-pass dirty bit fed by the editor's downstream-invalidation scope.

**Validation (authoring time).** Before execution: topo-sort detects **intra-frame
cycles** (reject; only `previousFrame` reads may close a loop); check every channel read
resolves to an existing target/resource; check format/usage/sample-type compatibility and
no read-write-same-pass. Surface in `ValidationPanel`. This is the pass graph's own
validation, separate from the field-graph's type/space checks.

The terrain→atmosphere→composite chain is the first real test: terrain writes (color,
depth) → atmosphere reads both + writes color → composite/display reads color. No
feedback, three passes, two read-edges — a minimal but real frame graph.

## Host-input binding contexts (the ShaderToy uniform set, generalized)

`iResolution` is not special — it just exposed that host inputs bind from **different
contexts**. Cataloguing ShaderToy's full uniform set by context gives the generic model
(and shows which ones, like resolution, must be resolved per-target/per-channel rather
than as one global):

| ShaderToy | Binding context | Generic equivalent |
|-----------|-----------------|--------------------|
| `iResolution` | **per write-target** | size of the target this consumer writes |
| `iChannelResolution[i]` | **per read-channel** | size of each input target/resource |
| `iChannelTime[i]` | **per read-channel** | playback time of each video/buffer channel |
| `iMouse` | **per interaction surface** (see below) | normalized pointer from the display panel, mapped into the consumer's target space |
| `iTime`, `iTimeDelta`, `iFrame`, `iFrameRate` | **playback context** | one clock/transport per *preview/session*, not global to the app (a multi-preview editor may run independent clocks) |
| `iDate` | **session/global** | wall-clock host input |
| `iSampleRate` | **audio context** | audio device/clock |
| `iChannel0–3` (tex/cube/buffer/video/audio/keyboard) | **per read-channel** | resource or another target, GPU-bound (see resources) |

So the contexts are: **per-target**, **per-channel**, **playback (per preview)**,
**interaction-surface**, and **session/global**. Each host input declares which context it
resolves from; the runtime supplies it at bind time. This is the generic frame the
`iResolution` discussion implied.

## Interaction surface — normalized, display-decoupled

Pointer/mouse (and touch, drag, hover, pen) do **not** belong to any rendered buffer. They
originate at the **preview panel's display surface** and must be:

1. **Sourced from the panel**, not a target — interaction comes from wherever the user is
   pointing, **irrespective of which output buffer is currently displayed**.
2. **Normalized** (e.g. `[0,1]²` or NDC over the displayed area) so it is independent of
   any buffer's resolution — a consumer at half-res and one at full-res receive the *same*
   normalized pointer.
3. **Transformed per-target on demand**: a consumer that wants pixel coords multiplies the
   normalized pointer by *its own* `iResolution`; the runtime does the mapping from the
   panel's space (accounting for the panel's **aspect ratio** and any **zoom/pan view
   transform**) into each target's space.

This decouples three things ShaderToy conflates: *where the user points* (panel),
*which buffer is shown* (a view choice), and *which buffer a consumer renders* (its
target). Generalize beyond mouse to a small **interaction-input set** — `pointer`
(normalized xy + buttons), `pointerDelta`, `wheel`, `keys` (input-device state, ShaderToy's
keyboard texture) — all in normalized surface space, all per the focused preview.

**Preview panel = viewer + transport + interaction surface.** The panel therefore:
- **selects which output target to display** (the pass graph produces many; Buffer A–D /
  Image-style selection), with a per-target **visualization mode** for non-color data
  buffers (the existing scalar-field RGBA8 view is one such mode);
- owns the **playback transport** (play/pause/scrub/reset → the playback context above);
- provides the **normalized interaction surface** that feeds the whole pass graph,
  regardless of which target is on screen. See
  [editor.md](./editor.md).

## Further considerations (beyond mouse/resolution)

Surfaced while generalizing the ShaderToy model — note now, design when reached:

- **Non-2D / non-color targets.** Targets may be cubemap, 1D, or **audio output** (a
  ShaderToy "Sound" shader writes samples to a 1D buffer indexed by the audio clock — an
  *output* counterpart to the audio-FFT *input*). The render-target model and the panel's
  display selection must admit non-image targets.
- **Input devices as resources.** Keyboard/gamepad state as a bindable resource (ShaderToy
  keyboard texture), alongside image/mesh/audio. Fits the resource-input model.
- **Playback transport is per-preview, not global.** Multiple preview panels may run
  independent clocks (one paused, one scrubbing) → `iTime`/`iFrame` resolve from the
  *preview's* playback context, and which preview is the **interaction source** is the
  focused/hovered one.
- **Aspect & view transform.** Normalized pointer mapping must carry pixel **aspect**
  (ShaderToy's `iResolution.z`) and any panel **zoom/pan**, so picking stays correct when
  the displayed buffer is letterboxed or zoomed.
- **Data-buffer visualization.** Selecting a non-color target for display needs a
  visualization mode (false-color, channel pick, remap) — the existing scalar-field RGBA8
  readback is the first such mode.

## Open design questions

- **Pass-graph executor:** target lifetime/aliasing, ping-pong feedback, and whether the
  pass order is authored, declared on consumers, or inferred from channel reads.
- **Interaction-space transform:** exact normalization convention (`[0,1]²` vs NDC), aspect
  handling, and how panel zoom/pan composes into the per-target mapping.
- Exact type system for resource ports (formats, channel layouts, sampling modes)
  and how CPU/GPU views stay in sync.
- Whether frustum/pointer are *graph inputs* a primitive reads, or *services* a
  consumer queries — likely both, exposed as inputs but produced by `runtime-cpu`.
- Determinism + caching rules for resource- and audio-driven graphs (which are not
  pure functions of procedural inputs).
- How heavy a CPU evaluator is allowed to be before a consumer must require GPU.
