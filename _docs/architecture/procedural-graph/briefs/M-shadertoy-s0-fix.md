# Brief — S0 fix: the effect must be the canvas graph (sample docs + preview renders canvas)

**Type:** correction to S0 · **Package:** `@virtual-planet/graph-editor` (+ a tiny
`graph-editor` sample registry) · **Depends on:** S0 ✅ (`7917bfc`) · **Design
authority:** [editor.md](../editor.md),
[briefs/M-shadertoy-s0-runtime.md](./M-shadertoy-s0-runtime.md) · **Contract author:**
Opus · **Recommended executor:** browser-capable agent (⚠ visual). 

## Problem

S0 landed working but **buries the effect**: `EffectPreviewPanel.svelte` hardcodes
`cosinePaletteEffectGraph()` internally and renders it standalone, while the editor canvas
shows the unrelated default (noise→remap). The user opens the editor and **never sees the
ShaderToy shader as an editable node graph** — which defeats the point of a node editor.

## Required behaviour

1. **The ShaderToy effect is a loadable graph document.** The user can open
   `cosinePaletteEffectGraph()` into the **canvas** (as a named **sample/example**, e.g. a
   "Samples ▸ ShaderToy — Cosine palette" action, or as a selectable starting document). Its
   four nodes + edges appear in the canvas and are **editable**.
2. **The preview renders the graph in the canvas — not a hardcoded one.** The GPU/effect
   preview compiles and renders **the current editor graph** whenever that graph has a
   **fragment consumer** producing a `vec4f` image output (via `compileGraph` →
   `assembleStageEntry` → `executeFullscreenFragment`). Editing the canvas graph changes the
   render. Remove the hardcoded `cosinePaletteEffectGraph()` from the preview panel.
3. The existing **CPU scalar preview** (noise→remap) keeps working for graphs whose output
   is a scalar field; the **effect/GPU preview** activates for graphs with a fragment-image
   consumer. The preview picks its mode from the canvas graph's consumer/output type — not a
   separate hardcoded graph.

## Implementation notes

- Add a small **sample-graph registry** in `graph-editor` (e.g. `samples.ts`:
  `{ id, label, build(): GraphDocument }[]`) seeded with the cosine-palette effect (move
  `cosinePaletteEffectGraph` behind it) and the existing default. A toolbar "Samples"/"New
  from sample" loads one into the canvas via the existing document-load path.
- `EffectPreviewPanel` takes the **canvas graph** + its image output port as props (like
  `CpuPreviewPanel`/`GpuPreviewPanel` already do) instead of building its own. Drive
  `executeFullscreenFragment` from those props; animate `iTime`; feed normalized `iMouse`
  from the preview surface.
- Keep `graph-editor` scene-free (`sceneFree` guard green).

## Gate

1. **Headless:** a `samples.ts` test — the registry contains the cosine-palette sample and
   its `build()` returns a graph whose validation passes and whose consumer is a `fragment`
   image output. A unit test that the preview-mode selector picks "effect/GPU" for a graph
   with a fragment-image consumer and "CPU scalar" for the noise→remap default.
2. **Visual ⚠:** open the editor → load the ShaderToy sample → **its nodes appear in the
   canvas**; the preview shows the animated palette; **editing a node** (e.g. a tunable on
   the effect, or rewiring) changes the render. Paste a screenshot of the canvas graph + the
   live preview.
3. `npm run check`/`test -w @virtual-planet/graph-editor` (+ `runtime-webgpu` if touched)
   green; `apps/graph-editor` builds.

## Out of scope

Multibuffer/pass-graph (S0.5); the full schema-driven uniform form (params-as-inputs). Keep
the S0 runtime consumer + uniform packing as-is — this is editor wiring only.

## Handoff

→ The editor now shows effects *as graphs* and the preview reflects the canvas — the correct
node-editor model. S0.5 (multibuffer) and the planet PoC build on this canvas-renders-itself
behaviour.
