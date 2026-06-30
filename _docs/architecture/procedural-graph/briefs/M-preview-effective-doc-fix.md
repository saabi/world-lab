# Brief — Preview panels must assemble against the effective (normalized) doc

**Type:** fast fix (integration seam left by `M-preview-buffer-list`) · **Packages:**
`@virtual-planet/graph-editor` (panel wiring) · **Depends on:** consumer-derivation ✅
(`effectiveGraphDocument`), preview-buffer-list ✅ · **Design authority:**
[pipeline-as-graph.md](../pipeline-as-graph.md) · **Contract author:** Opus · **Recommended
executor:** Cursor.

## Problem

A valid pipeline graph now compiles (the compiled-WGSL view shows real vertex+fragment
code) **but the Effect preview throws**:

> Output port is not declared in graph.outputs: n_vector_vec4f_2.value

Root cause — an asymmetry left by the buffer-list landing:

- **Compiled-WGSL view** normalizes first: `compiledWgsl.ts:40` `compileReadyDoc(doc) =
  { ...doc, outputs: effectiveOutputs(doc) }`. Works.
- **Buffer enumeration** also reads `effectiveOutputs(doc)` (`previewBuffers.ts:152`), so the
  `pipeline_image` buffer (source `n_vector_vec4f_2.value`) is the *synthetic* output.
- **Preview panels assemble against the raw `doc`.** `EffectPreviewPanel.svelte:87` (and
  `Gpu`/`Cpu`/`Audio`/`Vegetation`) pass the un-normalized `graph` into the runtime assembly;
  `runtime-webgpu/.../fullscreenFragment.ts:72` re-checks `graph.outputs`, the synthetic
  output isn't there, and it throws.

So the buffer list selects the right buffer but hands the panel a doc whose `outputs` don't
contain it. (Headless tests passed; the visual render gate did not actually hold — the
recurring "green ≠ renders" gap.)

## Fix

Normalize once at the preview boundary using the **existing** single source of truth,
`effectiveGraphDocument(doc)` (`@virtual-planet/graph`, `pipeline.ts:151` — merges
`effectiveOutputs` **and** `effectiveConsumers`). In `GraphEditor.svelte`, compute a derived
`previewDoc = effectiveGraphDocument(graph)` and pass **that** to every preview panel
(`Effect`/`Gpu`/`Cpu`/`Audio`/`Vegetation`) and to the buffer enumeration, so the buffer
`output` PortRef and the doc the panel assembles against come from the same normalized doc.
(Prefer normalizing once in `GraphEditor` over editing five panels; keep the panels dumb.)
Consider switching `compiledWgsl.ts`'s `compileReadyDoc` to `effectiveGraphDocument` too, so
there is exactly one normalization helper.

## Gate

1. **Headless regression:** for the reported pipeline graph (`geometry.plane → … →
   stage.fragment(color ← vec4f) → target.display`, empty `doc.outputs`),
   `effectiveGraphDocument(doc).outputs` contains the fragment-color output, and the
   fullscreen-fragment assembly resolves that port **without throwing** (assert the previous
   throw is gone). Test in `graph-editor` (or `runtime-webgpu` for the assembly).
2. `check` **and** `test` green for touched packages; keep all prior tests green.
3. **Visual ⚠:** the reported graph renders in the Effect preview (no "not declared in
   graph.outputs"). Screenshot.

## Out of scope

New buffer families/renderers; the palette work; multi-target preview. **No new normalization
path** — reuse `effectiveGraphDocument`.

## Handoff

→ Every editor render surface (compiled view + all preview panels + buffer enumeration)
assembles against one normalized doc, so a node-driven pipeline graph previews as well as it
compiles. Closes the preview-buffer-list visual gate.
