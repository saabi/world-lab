# Realignment report — current repo → pipeline-as-graph

**Status:** analysis · **Date:** 2026-06-27 (Opus) · **Question:** what does the repo
*as built* need to reach the [pipeline-as-graph](./pipeline-as-graph.md) state (the graph
describes the **full WebGPU pipeline** — geometry, buffers, stages, targets as nodes)?

## Where the repo is today

The **field-graph engine is complete and solid** — but it is a *field* graph (value
ports, shading math), not yet a *pipeline* graph (resource ports, geometry/buffer/stage/
target nodes).

| Built & aligned (reusable as-is) | Status |
|----------------------------------|--------|
| Typed Graph IR (`graph`): nodes, **value** ports (data + coordinate-space), validate, serialize | ✅ |
| Primitive registry + ~44 **field** primitives (noise/math/sdf/colour/surface/terrain/material/host/effect) | ✅ |
| Compiler: `sliceGraph` → `generateWgsl` → `textLinker` → `compileGraph` (per-consumer bundle) → `assembleStageEntry` (@vertex/@fragment/@compute) | ✅ |
| `runtime-cpu` (frustum, cull, pointer, vegetation), `runtime-webgpu` (buffers, scalar/mesh/vegetation/fullscreen consumers), **frame-graph pure core** (order/lifetimes/validate) | ✅ |
| Editor (`graph-editor` + `apps/graph-editor`), `editor-ui`, samples, CodeView/clone, multi-level | ✅ |

**The gap:** there is **no resource-port system** and **no pipeline nodes** (geometry/
buffer/stage/target). Today a "consumer" is metadata + a hand-written runtime consumer
(`fullscreenFragment.ts`), not a graph the author wires source → stage → target. The S0
graph proved this: it rendered, but only described fragment shading — no real source/target.

## What realignment needs (ordered)

### R1 — Resource ports (graph) · Opus · foundational, headless

Add `ResourcePortKind` (`vertexBuffer`/`indexBuffer`/`geometry`/`texture`/`renderTarget`/
`bindGroup`/`storageBuffer`). A `Port` carries a value `dataType` **or** a `resource`
kind. `validateGraph` gains resource-edge rules (resource↔resource by matching kind;
value and resource ports never cross). *(Brief: `M-pipeline-nodes-s0` Part 1.)*

### R2 — Pipeline node categories (graph + procedural-wgsl) · Opus contracts, agent impl

Register the four new node families (schema + ports; WGSL/exec in R3):
- **`geometry.*`** — emit vertices/faces (fullscreenPlane, grid, cubeSphere mesh, tessellate).
- **`buffer.*`** — GPU storage/persistence (persist, vertex, index, storage, upload, readback).
- **`stage.*`** — vertex/fragment/compute/mesh-gen; **embed a field subgraph** (the existing
  primitives) + bindings.
- **`target.*`** — render target / display / depth (the pipeline sinks).

Each is just another schema-driven primitive (with resource ports) — the registry,
palette, and compiler already handle registration; categorization is frontmatter.

### R3 — Pipeline-graph runner (runtime-webgpu) · agent, ⚠ GPU

Generalize `executeFullscreenFragment` into a runner that walks **resource edges**:
realize `geometry.*` buffers (honor `buffer.persist` = create once, reuse across frames),
build pipelines from `stage.*` nodes (via `assembleStageEntry` — **exists**), render into
`target.*` nodes, present `target.display`. The **frame-graph pure core (T4) exists** —
wire `target.*` nodes into it for ordering/allocation.

### R4 — Editor as pipeline (graph-editor) · agent, ⚠ visual

Resource edges visually distinct from value edges; the S0 sample rebuilt to the full
pipeline (geometry→buffer→stage→fragment(field)→target nodes on the canvas); ValidationPanel
surfaces resource-edge errors. *(Brief: `M-pipeline-nodes-s0` Parts 2–3.)*

### R5 — Fold existing consumers onto the model · agent, incremental

`fullscreenFragment` / `surfaceMesh` / vegetation / scalar previews become `stage.*` +
`target.*` graphs over time (not a big-bang). The pinned **mesh-gen consumer**
([M-mesh-gen-consumer](./briefs/M-mesh-gen-consumer.md)) becomes the `geometry.tessellate`
+ `buffer.vertex` path. The planet PoC's tessellator = `geometry.grid` (instanced) +
`stage.vertex` (displace) → terrain `target.render`.

## Effort & risk

- **R1–R2 are the keystone** (resource ports + node contracts) — modest, headless, mine.
  Everything else is "more schema-driven nodes" + runtime wiring of pieces that exist.
- **R3–R4 are ⚠ GPU/visual** — agent + review; reuse `assembleStageEntry` + the frame-graph
  core, so the new code is buffer/pipeline plumbing, not new compiler theory.
- **Low risk overall:** no redesign of the compiler/IR — the field-graph engine *nests
  inside* stage nodes unchanged. The only genuinely new concept is **resource edges**.
- **What does NOT change:** the ~44 field primitives, compileGraph, the linker, CPU eval,
  the editor shell. They are the field layer the pipeline layer wraps.

## Bottom line

Realignment is **additive, not a rewrite**: add resource ports (R1), add geometry/buffer/
stage/target node families (R2), wire a runner over the existing compiler + frame-graph
pieces (R3), surface it in the editor (R4), migrate consumers opportunistically (R5). The
full node catalogue (built / planned / discussed, incl. the new buffer/geometry/target
families) is in [primitive-library.md](./primitive-library.md).
