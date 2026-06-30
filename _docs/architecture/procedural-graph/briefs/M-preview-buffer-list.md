# Brief — Format-adaptive preview: list the graph's output buffers

**Type:** editor UX (Tier 2) · **Packages:** `@virtual-planet/graph-editor` (buffer
enumeration, family classification, selector UX; reuse existing preview panels) ·
**Depends on:** `M-pipeline-output-reconciliation` (✅ needed — `outputSinkNodeIds` makes the
buffer set trustworthy) · **Design authority:**
[pipeline-as-graph.md](../pipeline-as-graph.md),
[editor.md](../editor.md) · **Contract author:** Opus · **Recommended executor:** Cursor.

## Problem

The preview pane is **backend-mode-driven**: a hardcoded tab bar (`PreviewBackend =
'cpu' | 'gpu' | 'effect' | 'mesh' | 'vegetation'`, `previewBackend.ts`) with
`inferPreviewBackend(doc)` guessing one renderer from the whole graph. It answers "which
renderer?", not "which result do you want to see?". A graph can expose **several** output
buffers, and each has a natural format. The pane should **list the graph's output buffers**,
each tagged by family — **geometry · image · data · audio** — render each with the matching
viewer, and offer a **manual format picker** when the family can't be inferred.

The type system already classifies every port (`DataType`) into those four families, and the
rendering panels already exist (`Cpu`/`Gpu`/`Effect`/`Mesh`/`Vegetation`PreviewPanel, each
taking a `{ graph, output }` port to preview). This brief **inverts the model**: enumerate
buffers → classify → route to the existing panel, replacing the fixed backend tab bar.

## Part 1 — Enumerate + classify buffers (`previewBuffers.ts`, new + test)

```ts
export type PreviewFamily = 'geometry' | 'image' | 'data' | 'audio';

export interface PreviewBuffer {
	id: string;            // stable: output name, or `${sinkNodeId}` for a pipeline target
	label: string;         // human label (output name / node label)
	source: PortRef | { sinkNode: string };  // what to render
	dataType: DataType;    // resolved type (for sinks, the sink's input color/texture type)
	family: PreviewFamily; // inferred from dataType (below)
	inferred: boolean;     // false → ambiguous, show the family picker
}

export function previewFamily(dataType: DataType): PreviewFamily; // table below
export function enumeratePreviewBuffers(doc: GraphDocument): PreviewBuffer[];
```

Family table (covers the full `DataType` union):

| Family | DataTypes |
|--------|-----------|
| **image** | `image`, `texture`, `renderTarget` |
| **geometry** | `geometry`, `mesh`, `vertexBuffer`, `indexBuffer` |
| **data** | `f32`, `vec2f`, `vec3f`, `vec4f`, `bool`, `list<…>`, `storageBuffer` |
| **audio** | `audio` |

`enumeratePreviewBuffers` draws from: declared `doc.outputs` (named value/image outputs) **∪
pipeline sinks** (`outputSinkNodeIds` — the `target.display`/render-target nodes, previewed
via their incoming `color`/`texture`); de-dupe by source. `vec4f` is `data` by default but
**ambiguous** (could be a colour image) → `inferred: false` so the picker can switch it to
`image`. Pipeline-target sinks are always `image`.

## Part 2 — Buffer-list selector replaces the mode tab bar (`GraphEditor.svelte`)

Replace the `cpu/gpu/mesh/effect/vegetation` tab bar with a **buffer list** (one row per
`PreviewBuffer`, family icon + label; group or badge by family). Selecting a buffer drives
the preview. A small **family override** control (only when `inferred: false`, or always via
a "view as ▾" menu) lets the user pick the viewer when the format can't be inferred — the
"provide a way to select it" requirement. Persist the selected buffer id + any override in
the chrome layout (alongside the existing `previewMode` persistence).

## Part 3 — Route family → existing panel (extend `previewBackend.ts`)

Map the selected buffer's family (after override) to a renderer; **reuse** the panels:

| Family | Panel | Notes |
|--------|-------|-------|
| image | `EffectPreviewPanel` / `GpuPreviewPanel` | pass `output = buffer.source` (sink → its incoming colour port) |
| geometry | `MeshPreviewPanel` | |
| data | `CpuPreviewPanel` | numeric/scalar view (existing) |
| audio | `AudioPreviewPanel` (new, **minimal**) | `<audio>`/placeholder is fine; the family must appear + be selectable even if playback is a stub |

`mesh`/`vegetation` remain reachable (geometry buffers / the veg consumer). Keep
`inferPreviewBackend` as the **default-selection** heuristic (pick the first buffer / a sane
family on load), not the whole UI.

## Gate

1. **Unit:** `previewFamily` maps every `DataType` to the table above (exhaustive test);
   `enumeratePreviewBuffers` lists the value output of a field graph as **data**, the display
   target of a pipeline graph as **image**, and a geometry output as **geometry**; `vec4f`
   value output is `inferred: false`.
2. **Editor:** selecting a buffer renders the matching panel; the override switches a `vec4f`
   data buffer to the image viewer; selection persists across reload. Test what's testable
   headless (enumeration + routing pure functions).
3. `check` **and** `test` green for `graph-editor`; keep all prior tests green.
4. **Visual ⚠:** the pane shows the buffer list; switching buffers swaps the viewer; the
   pipeline graph from the reconciliation fix lists its display image and renders it.
   Screenshot.

## Out of scope

A full audio DSP viewer (minimal placeholder is enough). Per-buffer thumbnails/live
multi-pane (single active buffer is fine for v1). New renderers — reuse existing panels.
Inspecting **arbitrary intermediate node** outputs (only declared outputs + sinks for v1;
node-probe preview is a follow-on).

## Handoff

→ The preview pane is result-driven and format-adaptive: it lists what the graph produces by
family and shows each with the right viewer (or lets you choose). Sets up node-probe preview
(preview any intermediate port) and multi-target/multibuffer views later.
