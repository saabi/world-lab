# Procedural Graph System

**Status:** architecture reference + development plan · **Scope:** new
`packages/graph`, `packages/compiler`, `packages/runtime-webgpu`,
`packages/graph-editor`, `packages/procedural-wgsl`, `packages/mcp-server`;
builds on the existing `@virtual-planet/schema` package and the cube-sphere
`patches/` system in `apps/scene-editor/`.

> This is the canonical architecture for **the procedural language of Virtual
> Planet** — a design discussion that started with procedural vegetation and grew
> into a typed, schema-driven graph from which every planetary system is derived.
> Treat this folder as the project's **primary Architecture Decision Record**: the
> single architectural reference, from which the smaller per-package specs (one
> file per development stream) derive. This README holds the consolidated
> "shell + plan"; see the index below for the streams. Source transcript:
> [`../../conversations/node-editor-and-then-some.md`](../../conversations/node-editor-and-then-some.md).

## Index

| Doc | Covers | Primary packages |
|-----|--------|------------------|
| [schema-and-primitives.md](./schema-and-primitives.md) | Schema as single source of truth; primitive library | `schema`, `graph`, `procedural-wgsl` |
| [graph-and-compiler.md](./graph-and-compiler.md) | Typed graph/ports; dependency slicing, WGSL gen, module resolver, linker, tree shaking | `graph`, `compiler` |
| [wgsl-parsing-and-codegen.md](./wgsl-parsing-and-codegen.md) | **ADR:** no owned WGSL AST; codegen as text; signature inference; linker/Use.GPU policy | `compiler`, `procedural-wgsl` |
| [runtime-and-tessellation.md](./runtime-and-tessellation.md) | Consumers, WebGPU pipelines, shared/graph-described surfaces | `runtime-webgpu` |
| [inputs-cpu-and-resources.md](./inputs-cpu-and-resources.md) | Generic inputs, CPU runtime services, image/mesh/audio resources, tessellation-as-primitives | `graph`, `runtime-webgpu`, `runtime-cpu` |
| [audio-graphs.md](./audio-graphs.md) | **Spec (proposed):** CPU-first audio graphs — block consumer, STFT/spectrogram resources, Web Audio host, optional GPU viz | `graph`, `runtime-cpu`, `graph-editor`, `apps/webgputoy` |
| [stream-graphs.md](./stream-graphs.md) | **Spec (proposed):** CPU stream processing — `stream<T>` / `future<T>` types, multi-emitter primitives, mux/demux/filter, promise nodes (`spawn`/`await`/`awaitAll`), worker pool | `graph`, `runtime-cpu`, `graph-editor`, `apps/webgputoy` |
| [vegetation.md](./vegetation.md) | Dual-frequency fields, peak placement, coverage vs instances | vegetation consumer |
| [noise-functions.glsl](./noise-functions.glsl) | Source/reference GLSL noise functions for future `noise.*` primitive harvests | `procedural-wgsl`, `graph` |
| [editor.md](./editor.md) | Standalone + embeddable schema-driven editor | `graph-editor` |
| [editor-and-scene-integration.md](./editor-and-scene-integration.md) | **ADR:** graph editor vs scene tree; host composition, no package fusion | `graph-editor`, `apps/scene-editor/` scene |
| [parameter-and-form-schema.md](./parameter-and-form-schema.md) | **ADR:** param SSOT, shared form generator, GPU packing vs authoring | `schema`, `graph`, `graph-editor`, `apps/scene-editor/` |
| [parameter-and-form-schema-addendum.md](./parameter-and-form-schema-addendum.md) | Resource/host inputs vs param form; inspector boundaries (M9+) | `graph-editor`, M10, M14 |
| [collaboration-and-mcp.md](./collaboration-and-mcp.md) | Document/session model, multiuser, MCP/AI access | `mcp-server`, backend |
| [implementation-plan.md](./implementation-plan.md) | Concrete milestones (M0–M17), packages, test gates, critical path | all |
| [design-vs-implementation-audit.md](./design-vs-implementation-audit.md) | **Audit (2026-06-27):** built vs designed; multi-output gap + remediation | `graph`, `compiler` |
| [planet-pipeline-poc-feasibility.md](./planet-pipeline-poc-feasibility.md) | **Design review:** reproduce the single-planet pipeline (tess→vertex→fragment) as one graph; PoC plan | `graph`, `compiler`, `runtime-*`, `apps/scene-editor/` |
| [pipeline-as-graph.md](./pipeline-as-graph.md) | **ADR:** the graph IS the full WebGPU pipeline — geometry/buffer/stage/target **nodes** + resource ports; ShaderToy-equivalent in capability | `graph`, `compiler`, `runtime-webgpu`, `graph-editor` |
| [elemental-webgpu-architecture-review.md](./elemental-webgpu-architecture-review.md) | **Architecture review (2026-07-03):** final elemental graph form; structural types, primitive kinds, generic resources/kernels/commands/passes, and decomposition of mesh/particles/vegetation/planet features | all procedural-graph packages |
| [foundation-1-elemental-contracts-plan.md](./foundation-1-elemental-contracts-plan.md) | **Implementation plan — ✅ all 5 milestones landed (2026-07-03):** primitive-kind union, structural types, open semantic tags, static/runtime collection split, unified execution roots — milestones + test gates, mirroring `implementation-plan.md`'s rigor | `graph`, `compiler`, `procedural-wgsl`, `runtime-webgpu`, `graph-editor` |
| [foundation-2-generic-resources-plan.md](./foundation-2-generic-resources-plan.md) | **Sequencing plan (2026-07-03), proposed/not yet approved:** generic buffer/texture/sampler resources + frame execution, superseding `M-pass-graph-executor.md`'s texture-only model — the pure ordering core already exists and is generic, only the type layer and runtime wiring need building | `graph`, `runtime-webgpu` |
| [pipeline-realignment-report.md](./pipeline-realignment-report.md) | **Report:** what the repo (as built) needs to reach pipeline-as-graph — R1–R5, additive not a rewrite | all |
| [work-plan.md](./work-plan.md) | **Prioritized backlog (2026-06-29):** Tier 1 = fully functional editor pipeline, then engine / library / PoC | all |
| [primitive-library.md](./primitive-library.md) | **Catalogue:** every node built/planned/discussed — fields, domain, inputs, + geometry/buffer/stage/target families; low-hanging fruit | `graph`, `procedural-wgsl` |
| [node-model-design-notes.md](./node-model-design-notes.md) | **Design:** collections/loops (lights→PBR), elemental geometry + transforms, node-swap UX (Blender math vs perf) | `graph`, `compiler`, `graph-editor` |
| [execution-and-delegation.md](./execution-and-delegation.md) | Model-tier allocation per milestone, contract-first workflow | all |
| [TASK_BOARD.md](./TASK_BOARD.md) | **Retired 2026-07-03** — unified into the root [`_TASK_BOARD.md`](../../../_TASK_BOARD.md), the live task board | all |
| [HANDOFF.md](./HANDOFF.md) | Stable index of task-specific handoff records | all |
| [handoffs/](./handoffs/README.md) | Task-specific implementation, review, and commit records | all |
| [briefs/](./briefs/README.md) | Routable per-task contract briefs, ordered by the task board | per-milestone |

---

## 1. Vision

### Goals

Build a single, typed **procedural field graph** that is the canonical
description of a planet — terrain, vegetation, materials, water, atmosphere,
collision, navigation, and future gameplay are all *consumers* of the same
graph, not separate authored programs.

- Infinite, deterministic procedural generation with zero persisted instance data.
- One graph, many outputs, compiled per-consumer down to minimal WGSL.
- Strong typing end-to-end, driven by a single schema source of truth.
- Multiple authoring surfaces (visual editor, declarative markup, JSON,
  programmatic API, AI/MCP) over one shared IR.
- Framework- and topology-independent core; Svelte and the cube-sphere planet
  are the *first* adapters, not the foundation.

### Design philosophy

**The procedural graph describes the planet, not the rendering.** Shader stages
(vertex / fragment / compute / mesh-generation) are implementation details the
compiler distributes work across, chosen by dependency analysis — not concepts
the author manipulates directly. The author describes *fields*; the compiler
decides *where they run*.

### Long-term vision

The graph engine is not planet-specific. It should evolve into a reusable
procedural programming environment for WebGPU — a **"WebGPUToy"**: a ShaderToy-
like platform that operates at the procedural-graph level (sharable graphs,
publishable primitives, live preview, generated-WGSL inspection, benchmarking).
Virtual Planet becomes its flagship application. See §4 below.

---

## 2. High-level architecture

```
Authoring Layer
  Visual Graph Editor · Declarative Svelte · JSON · Programmatic API · MCP
        │
        ▼
  Typed Graph IR            ← the single authoritative representation
        │
        ▼
  Semantic analysis · type checking · validation
        │
        ▼
  Dependency slicing  (per requested output / per consumer)
        │
        ▼
  WGSL function generation
        │
        ▼
  WGSL module resolution + Shader Linker
        │
        ▼
  WebGPU pipeline assembly
        │
        ├──────────────┬──────────────┬──────────────┬──────────────┐
        ▼              ▼              ▼              ▼
  Mesh generation   Compute       Vertex        Fragment
```

Every authoring method produces the **same** Typed Graph IR. The Graph IR is the
only authoritative model — the visual editor edits it directly, and declarative
markup is just another view of it.

Package layout (framework-agnostic core, adapters at the edges):

```
packages/
  schema/             existing — single source of truth for typed objects
  graph/              Typed Graph IR, node defs, primitive registration, validation
  compiler/           dependency slicing, WGSL codegen, module resolution, linking
  runtime-webgpu/     buffers, pipelines, bind groups, consumers
  procedural-wgsl/    reusable WGSL function modules (the standard library)
  graph-editor/       reusable Svelte editor components (no renderer logic; canvas
                      via a swappable adapter over @xyflow/svelte; subdivide layout)
  mcp-server/         AI/agent access over the Graph IR (no Svelte/renderer dep)
  runtime-cpu/        CPU services (frustum, picking) + resource sampling + CPU eval
  subdivide/          existing — Svelte split-pane layout (reused by the editor UI)
apps/
  planet/             main Virtual Planet app (first consumer/adapter)
  graph-editor/       standalone editor app (canonical save = Graph IR JSON; Svelte
                      is an export/optional-import projection — see editor.md)
future:
  @virtual-planet/react · @virtual-planet/vue
```

Rule: **framework components are only authoring/runtime adapters; they never own
the graph model.**

---

## 3. Prior art & existing renderer docs

The engine is **generic from the start** (see
[inputs-cpu-and-resources.md](./inputs-cpu-and-resources.md)) — planets and terrain
are not privileged. But this architecture is also the **generalization of work
already specced in this repo**, and it must stay consistent with these documents
rather than duplicate or contradict them:

- **[`planet-shaping-pipeline-graph.md`](../../planet-shaping-pipeline-graph.md)**
  — the concrete precursor. It proposes a typed `PlanetShapingPipeline` schema for
  the *existing* terrain: graph nodes with **coordinate-space-typed ports**,
  shader-stage eligibility, and a compiler that emits an ordered WGSL include list
  plus `sampleShape()` / `sampleMaterial()` / `sampleNormal()` wrappers for the
  cube-sphere and surface-patch shaders. In the generic model it is **one consumer
  expressed as a composition of primitives**, not a special subsystem; its node set
  (BodyDirection, LayerGate, MacroDistortion, MacroVoronoi, DetailFbm, HeightRemap,
  FineTextureNoise, PolarTerm, BiomeMaterial, NormalEstimator, WorldNormal,
  SelfShadow, PbrLighting) seeds the terrain primitives in the standard library.
- **[`renderer-unification-plan.md`](../../renderer-unification-plan.md)** — the
  authoritative renderer roadmap. It defers *migrating the existing terrain
  renderer onto a graph compiler* behind its own contract work (param/scale +
  coordinate-space types, route-parity tests, debug views). That deferral governs
  **when this one consumer adopts the graph**, not whether the generic engine is
  built — the engine proceeds independently (validated on trivial surfaces and
  primitives), and the existing terrain migrates when that plan's contracts land.
- **[`driven-fields-editor.md`](../../specs/driven-fields-editor.md)** and the
  `/scene/[...path]` node editor — existing **schema-driven** node forms
  (kind-schema → inspector). Concrete prior art for "the schema drives the editor";
  the graph editor extends this model rather than inventing a new one.
- **`apps/scene-editor/vite-wgsl.ts`** — the existing WGSL composition layer (`#include`
  expansion). This textual precursor is what the typed Shader Linker upgrades; the
  GLSL mirror is `apps/scene-editor/vite-glslify.ts`.

Existing terrain-shaping source map (under `apps/scene-editor/src/lib/planet/`):
`params/planetParams.ts`, `params/presets.ts`, `planet/layers.ts`,
`gpu/wgsl/planet/{kernel,material,normal,shadow,lighting}.wgsl`, and
`gpu/wgsl/terrain/{cubeSphereVertex,surfacePatchVertex}.wgsl`.

---

## 4. Future platform (WebGPUToy)

The same architecture generalizes into a public procedural-GPU playground that
operates at the graph level rather than on handwritten fragment shaders:

```
Graph Editor → Typed Graph → Compiler → WGSL → WebGPU Runtime → Interactive Playground
```

Capabilities: create/share graphs, publish reusable primitives, live preview,
generated-WGSL inspection, parameter animation, dependency visualization,
profiling/benchmarking, and a third-party primitive plugin system. The same
hosted MCP interface ([collaboration-and-mcp.md](./collaboration-and-mcp.md))
lets agents generate, optimize, explain, and debug graphs. Virtual Planet is the
first application on a general procedural platform that can equally power
materials, terrain tools, scientific viz, simulation, and education.

---

## 5. Implementation roadmap

Phased so each stage is independently useful and testable (pure-TS modules with
`npm run check` / `vitest`, per repo convention). The concrete, milestone-level
build plan — packages, deliverables, test gates, critical path, and the smallest
end-to-end vertical slice — is in
[implementation-plan.md](./implementation-plan.md); the phases below are its
summary.

**Generic first.** The core (IR, primitives, compiler, linker, editor) is built
domain-agnostic and validated on trivial surfaces (a plane) and primitives — it
does **not** wait on any concrete consumer. Tessellation, terrain, and mesh
generation arrive as standard-library **primitives with optional CPU support**
([inputs-cpu-and-resources.md](./inputs-cpu-and-resources.md)), and the generic
CPU runtime essentials (camera frustum, pointer/picking, image/mesh/audio resource
inputs) are part of the early phases because the editor needs them for preview and
interaction. Migrating the *existing* terrain renderer
([`PlanetShapingPipeline`](../../planet-shaping-pipeline-graph.md)) onto the graph
follows [renderer-unification-plan.md](../../renderer-unification-plan.md)'s
contract timeline — that is one consumer's adoption schedule, not a gate on the
engine.

1. **Typed Graph IR** — extend `@virtual-planet/schema` with node/port/field
   metadata; `packages/graph` with validation and serialization (`GraphDocument`
   shape: `version, nodes, edges, outputs, consumers`).
   → [graph-and-compiler.md](./graph-and-compiler.md)
2. **Primitive registration** — `registerPrimitive` + the primitive library
   (noise/math first, then tessellation/mesh-gen primitives), each with schema,
   optional CPU evaluator, and a `WgslSourceRef`; plus the self-describing WGSL path
   (signature inference + YAML frontmatter loader) so user-authored functions register
   themselves. → [schema-and-primitives.md](./schema-and-primitives.md),
   [wgsl-parsing-and-codegen.md](./wgsl-parsing-and-codegen.md)
3. **Graph compiler** — dependency slicing, multi-output compilation, WGSL
   function generation, WGSL module resolver (`packages/procedural-wgsl`).
   → [graph-and-compiler.md](./graph-and-compiler.md)
4. **WGSL linker** — minimal `ShaderLinker` behind an internal interface;
   optionally back it with `@use-gpu/shader` initially; WGSL-level tree shaking.
5. **Standalone editor + CPU runtime essentials** — `apps/webgputoy` +
   `packages/graph-editor` components; schema-driven palette/inspector; plane
   tessellation (as primitives) for isolated testing; generic `runtime-cpu`
   services (camera frustum, pointer→world ray) and resource inputs
   (image/mesh/audio) for preview, picking, and headless tests; one shared,
   app-agnostic `GraphDocument` store.
   → [editor.md](./editor.md), [inputs-cpu-and-resources.md](./inputs-cpu-and-resources.md)
6. **Embedded editor + shared surfaces** — mount the same components in
   `apps/planet`; renderer reacts to graph changes. Move the cube-sphere surface
   *mapping* into a shared standard-library document (keeping LOD/patch
   scheduling in `runtime-webgpu`), so the planet tessellation is authored/edited
   from either app. → [runtime-and-tessellation.md](./runtime-and-tessellation.md)
7. **Procedural vegetation** — dual-frequency fields, peak detection,
   coverage-vs-instance split, metric coordinates; CPU consumer first, then a
   WGSL compute consumer wired through the cube-sphere streaming budget.
   → [vegetation.md](./vegetation.md)
8. **MCP server** — `packages/mcp-server`; documents + sessions tools; auth +
   scopes; audit log. → [collaboration-and-mcp.md](./collaboration-and-mcp.md)
9. **Collaborative editing** — multi-tab/session sync over WebSocket/SSE; patch
   conflict handling; temporary-document autosave/promotion.
10. **WebGPUToy** — public sharing, presets, third-party primitives, plugin system.

---

## Guiding principle

The Typed Graph IR is the universal representation of procedural computation for
Virtual Planet. Geometry comes from interchangeable tessellation providers;
execution from interchangeable WebGPU pipelines; authoring from visual editors,
declarative components, programmatic APIs, and AI assistants — all operating on
exactly the same strongly typed graph. The graph describes the planet; everything
else is a consumer.
