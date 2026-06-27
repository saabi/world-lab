# Design vs. implementation audit

**Status:** architect audit · **Date:** 2026-06-27 (Opus) · **Scope:** checks the
built engine (Stages A–D) against the capabilities described in the source
conversation ([../../conversations/node-editor-and-then-some.md](../../conversations/node-editor-and-then-some.md))
and the architecture docs. Triggered by a user observation that **multi-output
multi-stage compilation** appeared unbuilt and unplanned.

> **Correction (2026-06-27): this audit itself under-captured a capability.** It found
> the multi-output *compilation* gap but framed **tessellation / mesh-generation and
> render targets as runtime-only** — when the transcript (turns 37, 38, 42) explicitly
> makes the **tessellator/mesh-generator a graph consumer** and declares consumers in the
> document (`<Consumer type="tessellator" …/>`). The graph is meant to describe the
> **full pipeline** (geometry/buffers/stages/targets as nodes), not only field math. That
> is now [pipeline-as-graph.md](./pipeline-as-graph.md). **Process lesson:** audit the
> transcript against *every* capability claim (geometry/targets/consumers as graph
> elements), not just the most obvious one (multi-output codegen).

## Headline finding (confirmed gap)

**The single-graph → multiple-stage-specialized-shaders capability is designed but
not implemented, and was never a discrete milestone.**

The conversation states this repeatedly and unambiguously — one graph with many named
outputs, each routed to a different WebGPU pipeline stage, the compiler producing N
specialized shaders:

> "un solo grafo con múltiples salidas, que vaya al vertex shader, al fragment shader…
> para que el mismo código genere el terreno, genere la decisión de los árboles en otro,
> con salida a otro shader" (turn 33)

> `terrainHeight → vertex · terrainAlbedo → fragment · treePeakField → vegetation compute
> · grassCoverage → fragment/grass pass` (turn 34); Compute / Vertex / Fragment / **Mesh
> Generation** pipelines all consuming the same graph (turns 37–38).

This is the capability that makes the system "a procedural **language**, not a shader
editor" (turn 38). It is the architecture's central promise (README §2,
[graph-and-compiler.md](./graph-and-compiler.md) "multi-output compilation").

### What IS built (the foundation — solid)

- **`sliceGraph(doc, { outputs })`** (M4) — backward dependency slice per requested
  output set. This is exactly the per-consumer slicing the design needs. ✓
- **`generateWgsl` + `textLinker`** (M5/M6) — slice → WGSL function library → one linked,
  tree-shaken shader string. ✓
- **`emitGraphScalarEval` / `emitGraphVec3Eval`** — emit a graph eval as WGSL. ✓

### What is MISSING (the orchestration tier)

1. **No multi-output compile driver.** Nothing takes a graph + a *set* of consumers
   (each = a stage + an output list) and returns a **bundle** of stage-specialized
   shaders. Slicing is the building block; the orchestration on top was never built.
2. **`GraphDocument.consumers: ProceduralConsumer[]` is inert.** The IR field exists
   (the default graph even sets `consumers: [{ type: 'preview', outputs: ['field'] }]`)
   but **nothing reads it to drive compilation.** It's dead metadata.
3. **No pipeline-stage model.** `ConsumerKind` is a closed enum of four *preview* kinds
   (`plane-scalar-preview`, `plane-mesh`, `surface-mesh-preview`, `vegetation-candidates`).
   There is no `compute | vertex | fragment | mesh-gen` stage concept — the design's
   "procedural consumers / products" (turn 38).
4. **Consumers are bespoke TypeScript, not graph-driven.** Each runtime consumer
   (`planeScalarPreview.ts`, `surfaceMeshPreview.ts`, `vegetationCandidates.ts`,
   `vegetationPreview.ts`) is a hand-written pass. Fine for bootstrapping the runtime,
   but it means **adding an output still means writing TS**, not declaring a graph
   consumer and getting a shader.

**Why it slipped:** every concrete consumer so far was a one-off *preview*, each
hand-writable. The slicing primitive (M4) and the previews (M10–M12) both landed, so the
*tier between them* — "compile this graph's declared consumers into a shader bundle" —
looked covered but never was. No milestone named it.

### Corollary gap: tessellation/mesh-gen is hardcoded, not graph-driven

The clearest instance of #4, and the **canonical reason compute outputs exist** (turn
37–38: *"Mesh Generation Pipeline — teselación por compute… puede consumir exactamente
los mismos campos"*). Today:

- `surface.plane` / `surface.cubeSphere` are graph **nodes** (the *mapping*) — ✅ (M11.1).
- But the **mesh generation** is `runtime-webgpu/surfaceMesh.ts::buildSurfaceMesh`, a
  hand-written CPU loop that **hardcodes** `SurfacePrimitiveId = 'surface.plane' |
  'surface.cubeSphere'`, special-cases face counts, and runs `evalCPU` over a uv grid —
  **not** a graph-driven mesh-gen consumer, and **not** a GPU compute pass. The preview
  panels consume *that*, not the graph.

Per [runtime-and-tessellation.md](./runtime-and-tessellation.md) /
[inputs-cpu-and-resources.md](./inputs-cpu-and-resources.md), a tessellator is supposed
to be a *surface-mapping primitive* **+ a mesh-generation consumer primitive (compute
emitting vertex/index buffers)*. The second half is the hardcoded TS — so an arbitrary
surface-mapping **node composition** cannot yet produce a mesh; only the two baked ids
can. The preview panels (plane, cube-sphere) were meant to be *thin consumers of a
mesh-gen graph consumer*, not bespoke builders.

## Other capabilities checked

| Capability (from conversation/docs) | Status |
|-------------------------------------|--------|
| Dual-frequency + peak-based vegetation, metric coords, RGB channels | ✅ built (M12, ADR-faithful) |
| **Coverage vs. instances** (continuous grass vs. discrete trees) | ✅ built — `evaluateVegetationCoverage` + `CoverageConfig` exist (was a suspected gap; it's fine) |
| Self-describing WGSL primitives (signature + YAML) | ✅ built (M3) |
| Schema-driven inspector/palette; param SSOT | ✅ built (M9/M9d, param ADR) |
| WGSL module resolver + linker + two-level tree-shake | ✅ built (M5/M6) — but only ever drives single-shader output |
| Multiple authoring (visual / markup / JSON) | ✅ built (M9b) |
| Tessellation as primitives + frustum cull scheduler | ✅ built (M11) |
| **Resource GPU binds** (image/mesh/audio as shader inputs) | ⚠ partial — M8 delivered CPU views; GPU binding of resources is **not** implemented (no `ResourceDependency` binding in runtime-webgpu) |
| Document/session model, multiuser | ◻ not started (M14) |
| MCP server | ◻ scaffold only (M15) |
| Standalone deployable app | ⚠ route in `fe/`, not `apps/` (tracked deviation) |

## Recommended remediation

1. **New milestone — Multi-output compile driver + consumer-stage model** (Opus-owned;
   it's the core compiler promise). Promote `ProceduralConsumer` to a real model
   (`{ id, stage: 'compute'|'vertex'|'fragment'|'mesh-gen', outputs: string[] }`), and add
   a compiler driver `compileGraph(doc, consumers, resolver) → ConsumerShaderBundle[]`
   that slices per consumer, generates+links a shader per consumer, and reports shared
   vs. specialized functions. Existing previews become *thin callers* of this driver over
   time, not parallel hand-written passes. See
   [briefs/M-multi-output-compile.md](./briefs/M-multi-output-compile.md).
2. **New milestone — Graph-driven mesh-generation consumer** (depends on #1 + stage
   entrypoints). Replace the hardcoded `buildSurfaceMesh` with a **mesh-gen compute
   consumer** that takes *any* surface-mapping node (or composition) — `uv (+faceId) →
   position, normal` — and emits vertex/index buffers via a compute pass. The plane and
   cube-sphere previews become thin consumers of it; new surfaces need **no** TS. See
   [briefs/M-mesh-gen-consumer.md](./briefs/M-mesh-gen-consumer.md).
3. **Backfill resource GPU binding** (smaller) when a consumer needs an image/mesh/audio
   input on the GPU — promote M8's stubbed `ResourceDependency` to real bind groups.
4. Keep the previews; refactor them onto the driver/mesh-gen consumer opportunistically
   (not a big-bang).

## Process note

This gap is also a **process** signal: milestones were derived from "what's the next
runnable thing" (previews), which under-weighted the *general* capability that has no
single visible artifact. Going forward, the architect should periodically re-audit the
plan against the conversation's **capability claims**, not just the milestone list — this
doc is the first such pass.
