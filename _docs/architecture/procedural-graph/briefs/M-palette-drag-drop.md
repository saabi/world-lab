# Brief — drag-and-drop node placement from the palette

**Type:** editor UX gap (user-flagged) · **Package:** `@world-lab/graph-editor`
(`NodePalette.svelte`, `GraphCanvas.svelte`, `GraphEditor.svelte`) · **Depends on:** none ·
**Design authority:** `editor-and-scene-integration.md` (graph-editor stays scene-free — this
brief doesn't touch that boundary, just noting it as the relevant ADR to re-read if scope
creeps) · **Contract author:** Opus · **Recommended executor:** Cursor · **Status:** ready to
route

## Problem

`NodePalette.svelte` is click-only today: `onclick={() => onadd?.(primitive.id)}` (line ~93).
`GraphEditor.svelte::addPrimitive` stacks every new node at a fixed, incrementing offset
(`40 + n·24`, `40 + n·24`, where `n = graph.nodes.length`) regardless of where the user is
looking on the canvas or what's already there. For a graph with more than a handful of nodes,
new additions land wherever the stack offset happens to be, not near the user's actual point of
interest.

## Fix

- **`NodePalette.svelte`:** make each primitive button draggable (`draggable="true"`,
  `ondragstart` setting `event.dataTransfer.setData(...)` with the primitive id and
  `effectAllowed = 'copy'`). Keep the existing `onclick` path working unchanged — drag is
  additive, not a replacement.
- **`GraphCanvas.svelte`:** add `ondragover` (call `event.preventDefault()` to permit drop) and
  `ondrop` handlers on the canvas root. On drop, read the primitive id from
  `event.dataTransfer`, convert the drop's screen coordinates to flow coordinates via xyflow's
  own `useSvelteFlow()` hook (`screenToFlowPosition` — confirmed present in the installed
  `@xyflow/svelte` version, `dist/lib/hooks/useSvelteFlow.svelte.d.ts`; this repo doesn't
  currently call it anywhere, so this is new usage, not a variant of an existing call), and
  fire `onchange?.(applyEditIntent(graph, { kind: 'add-node', primitiveId, position }),
  'Add node')` (same intent `GraphEditor.svelte::addPrimitive` already uses — this brief adds a
  new *entry point* to it, not a new intent).
- **`GraphEditor.svelte`:** minimal — `addPrimitive` (the click-to-add path) stays exactly as
  is, as the explicit fallback the brief calls for. If `GraphCanvas`'s `onchange` wiring needs
  a small adjustment to pass the intent-derived label through (it already does, for the
  existing `move-node`/`add-edge`/etc. cases — see the `onchange?.(next, historyLabel)` pattern
  already established there), reuse that, don't introduce a second callback shape.

## Gate

1. `packages/graph-editor`: existing 163 tests green; new tests for (a) the palette button's
   `dragstart` setting the right `dataTransfer` payload, (b) `GraphCanvas`'s drop handler
   computing a flow position and firing the correct intent (can stub/mock
   `screenToFlowPosition` — no real xyflow instance needed for this part of the assertion).
2. `check` **and** `test` green (`packages/graph-editor` and the full workspace).
3. **Visual ⚠:** screenshot/short clip showing a primitive dragged from the palette and dropped
   at a specific canvas location, landing there (not at the old fixed-offset stack position);
   click-to-add still works unchanged alongside it.

## Out of scope

A drag-ghost/preview image beyond the browser's default drag affordance (nice-to-have, not
required for the gate); touch/pointer-based drag parity (HTML5 `dataTransfer` DnD only, per the
existing `pending_issues.md` framing); any change to the fixed-offset fallback's own placement
math.

## Handoff

→ Users can place a new node where they're actually looking, rather than hunting for it at a
stacked offset — closes the last "not built" item under `pending_issues.md`'s node-editing
gaps that didn't already have a brief.
