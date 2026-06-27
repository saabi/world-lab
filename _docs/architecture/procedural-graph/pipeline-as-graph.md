# Pipeline-as-graph — the graph IS the whole WebGPU pipeline

**Status:** architecture decision — **realigns with the original design conversation**
(not a new direction) · **Date:** 2026-06-27 (Opus) · **Authority:** canonical for what
a graph contains — it is the **full WebGPU pipeline** (geometry, buffers, stages,
targets), not only field/shading math. **Touches:** `graph` (node taxonomy + resource
ports), `compiler`, `runtime-webgpu`, `graph-editor`. Corrects/realigns
[inputs-cpu-and-resources.md](./inputs-cpu-and-resources.md),
[runtime-and-tessellation.md](./runtime-and-tessellation.md),
[design-vs-implementation-audit.md](./design-vs-implementation-audit.md).

> **This was in the source conversation; the earlier audit missed it.** The
> [transcript](../../conversations/node-editor-and-then-some.md) already establishes that
> tessellation / mesh-generation is a **graph output/consumer**, not a runtime-only
> concern:
> - **Turn 37:** "como esto es WebGPU… también usamos shaders que generan vértices para
>   teselación. Así que también puede ser una **salida para el teselador**."
> - **Turn 38:** the "**procedural products / consumers**" reframe — Terrain **Mesh
>   Generator**, Collision, Navigation, … all consume the same fields.
> - **Turn 42:** the Svelte markup declares consumers *in the document*:
>   `<Consumer type="tessellator" outputs={["height","normal","lodDensity"]} />`,
>   `<Consumer type="terrain-fragment" … />`, `<Consumer type="vegetation-compute" … />`.
>
> The [design-vs-implementation-audit](./design-vs-implementation-audit.md) caught the
> *multi-output compilation* gap but **under-captured** this: it framed tessellation and
> render targets as runtime-only (mapping=graph / scheduling=runtime), which drifted from
> the transcript. This ADR restores the original intent and makes it concrete
> (geometry/buffer/stage/target **nodes**). It was surfaced by the S0 graph rendering only
> *fragment shading* — no real source, no real target.
>
> **Reconciling "the graph is unaware of pipeline stages"** (transcript turn 56): that
> applies to the **field** nodes — noise/math are pure and stage-agnostic. The
> **pipeline** nodes (`geometry.*` / `stage.*` / `target.*`) are the *stage-aware* layer
> that wires fields into a pipeline; field subgraphs nest inside stage nodes. Two layers,
> no contradiction.

## Principle

**Expose every WebGPU pipeline primitive we can as a graph node.** A graph is not "a
shader" — it is a pipeline: geometry generation, GPU buffers, pipeline stages, and
render targets are all **nodes**, wired source → … → target. Field math (noise, remap,
the cosine palette) lives *inside* stage nodes as nested **field subgraphs**, but the
field subgraph alone is not a pipeline.

**ShaderToy-equivalent in capability, not in form.** ShaderToy hides the fullscreen
triangle and the output buffer; the author only writes `mainImage`. We instead make the
fullscreen plane a **geometry node**, the buffer an explicit **resource node**, the
shading a **fragment-stage node**, and the output a **render-target node**. We can do
everything ShaderToy does (and more: real geometry, multiple stages, compute, mesh
generation) — the WebGPU way, with the pipeline visible and editable.

## Node taxonomy

Two kinds of edges: **value edges** (`f32`/`vec*`/`bool`, with coordinate-space — the
existing field ports) and **resource edges** (`vertexBuffer`/`indexBuffer`/`texture`/
`renderTarget`/`bindGroup` — new, GPU resources). Nodes:

| Category | Examples | Produces / consumes |
|----------|----------|---------------------|
| **Field** (existing) | noise, math, host inputs, `effect.cosinePalette`, surface mappings | value edges; nest inside stage nodes |
| **Geometry / source** | `geometry.fullscreenPlane` (2 tris), `geometry.grid`, `geometry.cubeSphere`, `geometry.tessellate` (GPU compute) | → vertex/index buffers (resource) |
| **Buffer / resource** | `buffer.persist` (cache across frames — generate once, reuse), `buffer.upload`, `resource.texture` | wrap/cache a GPU resource (resource→resource) |
| **Stage** | `stage.vertex`, `stage.fragment`, `stage.compute` | consume geometry/varyings/bindings + a **field subgraph**; produce a pipeline stage / varyings / writes |
| **Target / sink** | `target.render` (offscreen image buffer), `target.display` (swapchain/present) | consume a stage's color; the pipeline's sink |

## The S0 pipeline, done right

The cosine palette as the *full* pipeline (what the editor canvas should show):

```
geometry.fullscreenPlane ──vertexBuffer──► buffer.persist ──► stage.vertex (clip pos passthrough)
                                                                   │ fragCoord varying
host.iResolution, host.iTime ────────────────────────────────► stage.fragment ◄── effect.cosinePalette (field subgraph)
                                                                   │ color
                                                                   ▼
                                                              target.display
```

- `geometry.fullscreenPlane` is a real **source** (emits the 2-triangle plane); the
  earlier hardcoded fullscreen-triangle vertex WGSL becomes this node.
- `buffer.persist` caches it in GPU memory so it is **not regenerated each frame** (the
  node the user asked for).
- `stage.vertex` / `stage.fragment` are explicit stages; the cosine palette is the
  fragment stage's field subgraph.
- `target.display` is the explicit **sink** (was an implicit offscreen blit).

A ShaderToy "Image" tab is exactly: `fullscreenPlane → stage.fragment(effect) →
target.display`. A multibuffer effect (S0.5) adds more `target.render` nodes read back as
`resource.texture` channels.

## Reconciliations (this supersedes earlier framing)

- **Render targets are NODES**, not merely a runtime composition layer
  ([inputs-cpu-and-resources.md](./inputs-cpu-and-resources.md) "render targets &
  pass graph"). The **pass/frame graph is the graph itself** (target nodes + their
  read/write edges). The runtime still **schedules and allocates** (ordering, ping-pong,
  transient pool, per-target resolution) — that stays runtime — but authoring is via
  nodes. `iResolution` per-target etc. still hold; the target is now a node you can see.
- **Geometry/tessellation are NODES.** The plane / cube-sphere / tessellator are
  geometry-source nodes (run on the GPU). The **LOD/cull scheduler** remains a runtime
  service ([runtime-and-tessellation.md](./runtime-and-tessellation.md)) that feeds a
  geometry node its per-instance patch descriptors — geometry *generation* is a node,
  geometry *scheduling* is runtime. The Mode-A vertex-shader path (planet) is a
  `geometry.grid` (instanced) → `stage.vertex` (displace) composition.
- **Consumers become stage→target wiring.** The `ProceduralConsumer` model
  ([M-multi-output-compile](./briefs/M-multi-output-compile.md)) + `compileGraph` /
  `assembleStageEntry` are **not wasted** — a `stage.*` node *is* a consumer; the
  compiler compiles each stage node's field subgraph to that stage's WGSL. The graph now
  authors the consumers explicitly as nodes instead of as side metadata.
- **Buffers / persistence** generalize the frame-graph transient-vs-persistent idea to
  geometry: a `buffer.persist` node is a persistent resource (generate once, reuse);
  a regenerated geometry is transient.

## Two-layer or one graph?

One graph, **two port systems**: value edges (field math) and resource edges (buffers/
textures/targets). A `stage.*` node has resource inputs (geometry, bindings), resource
outputs (varyings/writes), and an embedded **field subgraph** (value edges) for its
shading math. The editor may visually group a stage's field subgraph (collapse), but it
is the same document. Validation gains resource-edge rules (a `vertexBuffer` can't feed a
`texture` input; a `target` must be written by exactly one stage per frame unless
feedback) atop the existing value type/space rules.

## What this changes for the plan

- New node categories in `graph` + the runtime (`geometry.*`, `buffer.*`, `stage.*`,
  `target.*`) with **resource port types**.
- `runtime-webgpu` executes a **pipeline graph**: realize geometry buffers (honor
  persist), build pipelines from stage nodes (via `assembleStageEntry`), run passes into
  target nodes (the frame-graph executor), present `target.display`.
- The S0 editor graph is **rebuilt** to the full pipeline above (geometry + buffer +
  stages + target visible on the canvas), not just the field chain.
- The planet PoC's P1 tessellator composition and P3 stage compile slot into this model.

## What we explicitly do NOT do

- Hide geometry/target behind the runtime (the S0 mistake). The pipeline is authored.
- Force every value into a resource (field math stays value edges — no buffer per scalar).
- Put scheduling/allocation in the graph (LOD/cull/pool stay runtime; the graph authors
  *what*, the runtime decides *how/when*).

## Next steps (design pinned; implementation to follow)

1. Pin `graph` resource-port types + the `geometry.*` / `buffer.*` / `stage.*` /
   `target.*` node category contracts (Opus).
2. Rebuild S0 as the full pipeline graph (revised brief).
3. Reconcile the frame-graph executor brief: target nodes drive it.
4. Fold into the planet PoC (geometry node = instanced grid; vertex stage = displace).
