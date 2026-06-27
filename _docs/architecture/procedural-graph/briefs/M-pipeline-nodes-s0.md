# Brief — Pipeline nodes + S0 rebuilt as a full pipeline graph

**Type:** core model + S0 redo · **Packages:** `@virtual-planet/graph` (resource ports +
node categories), `@virtual-planet/runtime-webgpu` (pipeline-graph execution),
`@virtual-planet/graph-editor` (sample) · **Depends on:** compileGraph ✅,
assembleStageEntry ✅, S0 ✅ (`7917bfc`/`0ba7e29`) · **Design authority:**
[pipeline-as-graph.md](../pipeline-as-graph.md) · **Contract author:** Opus
(resource-port + node contracts pinned here) · **Recommended executor:** Opus pins
Part 1; Cursor/browser-agent does Parts 2–3 (⚠ visual).

## Objective

Make the S0 graph describe the **true, self-contained WebGPU pipeline** — geometry source
→ GPU buffer → vertex stage → fragment stage → render target — as **nodes**, per
[pipeline-as-graph.md](../pipeline-as-graph.md). Today S0 only has the fragment field
chain (host → effect → output) with an *implicit* fullscreen triangle and an *implicit*
offscreen blit. Expose them.

## Part 1 — Resource ports + node categories (`graph`, Opus-pinned)

Add **resource port kinds** alongside the existing value `dataType`s:

```ts
export type ResourcePortKind =
	| 'vertexBuffer' | 'indexBuffer' | 'texture' | 'renderTarget' | 'bindGroup' | 'geometry';
```

A `Port` carries either a value `dataType` (existing) or a `resource: ResourcePortKind`.
Validation: a resource edge connects matching resource kinds; a value edge connects
matching value types (existing). Resource and value ports never cross-connect.

Register the **S0 node category stubs** (schema + metadata; execution in Part 2):

| id | kind | inputs | outputs |
|----|------|--------|---------|
| `geometry.fullscreenPlane` | geometry/source | — | `mesh: geometry` (2-tri plane) |
| `buffer.persist` | buffer | `in: geometry` | `out: geometry` (cached across frames) |
| `stage.vertex` | stage | `mesh: geometry` (+ value subgraph for clip pos) | `varyings` |
| `stage.fragment` | stage | `varyings` + value subgraph (color) | `color: texture` |
| `target.display` | target/sink | `color: texture` | — (present) |

`stage.fragment` embeds the existing field subgraph (the cosine-palette nodes) — those
nodes stay value-typed; the stage is where value meets resource.

## Part 2 — Pipeline-graph execution (`runtime-webgpu`)

Generalize `executeFullscreenFragment` into a small **pipeline-graph runner** that walks
the resource edges: realize `geometry.fullscreenPlane` (honor `buffer.persist` — generate
once, reuse), build the vertex+fragment pipeline from the `stage.*` nodes (via
`assembleStageEntry` — the existing path), render into the `target.display` (the existing
RGBA8 target / canvas). The cosine-palette field subgraph compiles exactly as it does now;
this wraps it in real source/stage/target nodes.

Keep the **scope minimal**: one geometry source, persist, vertex passthrough, fragment
(field), one display target. No multibuffer (S0.5), no LOD/scheduling (planet).

## Part 3 — S0 sample = the full pipeline (`graph-editor`)

Rebuild `cosinePaletteEffectGraph()` (the `samples.ts` ShaderToy sample) to the full
pipeline of [pipeline-as-graph.md](../pipeline-as-graph.md): `geometry.fullscreenPlane →
buffer.persist → stage.vertex → stage.fragment(effect.cosinePalette) → target.display`.
Loading the sample shows **all** these nodes in the canvas; the preview renders the
pipeline. Keep graph-editor scene-free.

## Gate

1. **graph (headless):** resource-port validation accepts a `geometry→geometry` edge,
   rejects a `geometry→f32` edge; the five node stubs register with correct ports.
2. **runtime-webgpu:** assembled pipeline WGSL is valid (string scope-guards as added in
   `0ba7e29`; device test renders when present, skips headless); `buffer.persist` realizes
   geometry once across two frames (unit test on the cache).
3. **Visual ⚠:** load the ShaderToy sample → the canvas shows geometry/buffer/vertex/
   fragment/target **nodes** (not just the field chain) → preview renders the animated
   palette → it visibly describes a source→…→target pipeline. Screenshot.
4. `npm run check`/`test` for touched packages green; `apps/graph-editor` builds.

## Out of scope

Multibuffer / feedback (S0.5); LOD/cull scheduling (planet); compute stage; full bind-group
reflection. **No AST.** Resource *allocation/pooling* optimization is deferred (one buffer
per node is fine).

## Handoff

→ The graph now authors a real pipeline. S0.5 adds `target.render` nodes read as
`resource.texture` channels (multibuffer); the planet PoC uses `geometry.grid` (instanced)
+ `stage.vertex` (displace) into the terrain target. The frame-graph executor binds the
`target.*` nodes.
