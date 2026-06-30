# Brief — Derive the pipeline consumer (compile + preview a pipeline graph)

**Type:** core gap-fix (compile/preview counterpart of output reconciliation) · **Packages:**
`@virtual-planet/graph` (consumer-derivation helper) or `@virtual-planet/graph-editor` if
editor-only; `@virtual-planet/graph-editor` (compiled-WGSL view + preview panels) ·
**Depends on:** `M-pipeline-output-reconciliation` ✅ (`outputSinkNodeIds`, target.display =
sink) · **Blocks:** `M-preview-buffer-list` (its image route assumes a consumer exists) ·
**Design authority:** [pipeline-as-graph.md](../pipeline-as-graph.md) · **Contract author:**
Opus · **Recommended executor:** Cursor.

## Problem

Output reconciliation made a pipeline graph **valid** (target.display recognised as the
terminal sink), but the editor's **compile + preview surfaces are consumer-driven** and a
pipeline graph carries **no `doc.consumers`** — its terminal is the structural
`stage.fragment → target.display` chain, not an authored consumer. (Part 2's cleanup also
correctly pruned the stale fragment-effect consumer.) Result, on a valid pipeline graph:

- **Compiled-WGSL view** → `compiledWgsl.ts:243` bails: *"Graph has no consumers."*
- **Effect preview** → *"Wire a vec4 image output with a fragment consumer."*
- **GPU/CPU preview** → *"Wire a scalar output to preview."*

So a valid, node-complete pipeline neither compiles to visible WGSL nor renders. The
**runner** (`runtime-webgpu/src/pipelineGraph.ts` `buildPipelinePlan`) already assembles this
pipeline structurally (finds `stage.vertex`/`stage.fragment`/`target.display`, builds the
vertex+fragment shader) — the editor surfaces just don't use that path. Teach compile +
preview that a pipeline terminal **is** an implicit image consumer (the dual of
`outputSinkNodeIds` for the validator).

## Part 1 — Derive consumers from the pipeline terminal (shared helper)

```ts
// alongside outputSinkNodeIds (graph/src/pipeline.ts), or graph-editor if it must read editor types
export function derivePipelineConsumers(doc: GraphDocument): ProceduralConsumer[];
export function effectiveConsumers(doc: GraphDocument): ProceduralConsumer[]; // doc.consumers ∪ derived (de-duped)
```

For each `target.display` sink reached through a `stage.fragment` whose `color` is wired,
derive `{ type: 'image', id, stage: 'fragment', outputs: [...] }` describing the presentable
colour. Reuse `pipelineGraph.ts`'s structural resolution (fragment node, field-color input,
display edge) — do **not** duplicate the traversal; export/share it if needed.
`effectiveConsumers` returns explicit `doc.consumers` plus derived ones, so author-declared
consumers (field/scalar graphs) are unchanged.

## Part 2 — Compiled-WGSL view assembles the pipeline (`graph-editor`)

`compiledWgsl.ts`: drive off `effectiveConsumers(doc)` instead of `doc.consumers`. For a
derived pipeline image consumer, assemble via the **pipeline path** (the
vertex+fragment assembly used by the runner / `assembleStageEntry` + `fullscreenFragment`),
so the view shows the **real** `@vertex` (`plane_grid_position`) **and** the fragment field
(`value.value2d → vec4f → color`) — not "no consumers." Keep the diagnostic path for genuinely
empty graphs.

## Part 3 — Preview renders the derived consumer (`graph-editor`)

`EffectPreviewPanel` (and `inferPreviewBackend`/`isPreviewModeCompatible`) use
`effectiveConsumers`: a pipeline graph previews as an **image** via its derived fragment
consumer — the Effect tab renders the node-driven pipeline. GPU/CPU/Mesh paths unchanged for
their graph kinds.

## Gate

1. **Headless:** `derivePipelineConsumers` returns one image consumer for the S0 pipeline
   (`geometry.plane → … → stage.fragment → target.display`) and `[]` for a graph with no
   display target; `effectiveConsumers` preserves explicit consumers. Test in the owning
   package.
2. **Compiled WGSL:** for a pipeline graph with empty `doc.consumers`, `compiledGraphWgsl`
   returns assembled WGSL containing the real `@vertex` + `plane_grid_position` and the
   fragment field — **not** the "Graph has no consumers" diagnostic. Test.
3. `check` **and** `test` green for every touched package; WGSL validity.
4. **Visual ⚠:** the reported graph (value2d → vec4f → fragment → display) renders in the
   Effect preview and the compiled-WGSL panel shows real vertex+fragment code. Screenshot.

## Out of scope

The format-adaptive **buffer-list UX** (`M-preview-buffer-list` — this unblocks it).
Multi-target / multi-pass consumer derivation (single display target for v1). Auto-seeding a
`target.display` when one is absent.

## Handoff

→ A valid pipeline graph compiles and previews with no hand-authored consumer; the editor's
compile + preview surfaces share the runner's notion of "the pipeline terminal," mirroring
`outputSinkNodeIds` on the validator side. `M-preview-buffer-list` can now route the image
buffer to a panel that actually assembles.
