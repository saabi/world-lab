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

## Open design questions

- **Pass-graph executor:** target lifetime/aliasing, ping-pong feedback, and whether the
  pass order is authored, declared on consumers, or inferred from channel reads.
- Exact type system for resource ports (formats, channel layouts, sampling modes)
  and how CPU/GPU views stay in sync.
- Whether frustum/pointer are *graph inputs* a primitive reads, or *services* a
  consumer queries — likely both, exposed as inputs but produced by `runtime-cpu`.
- Determinism + caching rules for resource- and audio-driven graphs (which are not
  pure functions of procedural inputs).
- How heavy a CPU evaluator is allowed to be before a consumer must require GPU.
