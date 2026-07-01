# Brief — Save pane layout with each graph + load toggle

**Type:** editor UX · **Packages:** `@virtual-planet/graph-editor` (`documentStorage.ts`,
`GraphEditor.svelte`, layout/chrome flag) · **Depends on:** layout persistence ✅ (`4d8da96`),
default layout v2 ✅ (`bc5640e`) · **Design authority:** `editor.md` · **Contract author:**
Opus · **Recommended executor:** Cursor.

## Goal

> **⛔ SUPERSEDED by `M-document-system.md`, landed `7cf7d0a`.** Do not route. This brief was
> deferred (2026-06-27) as too narrow — layout-in-artifact needed to be part of a unified named
> document save/load system, not a standalone slice. `M-document-system.md` delivered exactly
> that (Part 4: layout in the `GraphArtifact`, load toggle default ON) plus named save/load and
> samples-as-artifacts. Kept for history only.

Persist the **pane divisor layout** (the `LayoutDocument` from `@virtual-planet/subdivide`)
**with each saved graph**, and add a **toggle next to the Load button (default ON)**: on load,
if ON and the graph has a saved layout, apply it; otherwise use the default layout.

Today the layout is saved **editor-wide** as "chrome" (`layoutStorage`), decoupled from the
graph (`documentStorage`). This binds a layout to the graph artifact.

## Part 1 — Layout travels with the saved graph (`documentStorage.ts` + test)

Wrap the persisted/downloaded artifact so it carries an optional layout **without polluting
the pure `GraphDocument`** (nodes/edges schema stays clean):

```ts
export interface StoredGraph { graph: GraphDocument; layout?: LayoutDocument; }
export function saveGraphToStorage(graph: GraphDocument, layout?: LayoutDocument, key?): void;
export function loadGraphFromStorage(key?): StoredGraph | null;
export function formatGraphForDownload(graph: GraphDocument, layout?: LayoutDocument): string;
export function parseGraphFile(json: string): StoredGraph; // accepts the wrapper OR a bare
                                                           // GraphDocument (back-compat → no layout)
```

- Storage/download JSON becomes `{ version, graph, layout? }`. `parseGraphFile` must still
  accept a **bare `GraphDocument`** (older files / hand-written) and return `{ graph }` with no
  layout — don't break existing graph files.
- Update the call sites in `GraphEditor.svelte` (save/load/download/upload) to the new
  signatures, passing the current `layout` on save.

## Part 2 — Load toggle (`GraphEditor.svelte`)

- Add a **toggle beside the Load button**, default **ON** (e.g. a small checkbox/switch
  labelled "Load layout"). Persist its state (a `loadLayoutWithGraph: boolean` flag in the
  editor chrome record via `layoutStorage`, default `true`) so it survives reload.
- On **load**: read `StoredGraph`; set the graph as today; then set the layout:
  - toggle **ON** and `stored.layout` present → `layout = stored.layout`;
  - toggle **OFF**, or no saved layout → `layout = defaultGraphEditorLayout()`.
- On **save**: include the current `layout` in `saveGraphToStorage`/`formatGraphForDownload`.
- Applying a loaded layout must go through the same `layout` `$state` + `onLayoutChange`
  path so the Subdivide panes re-render and the change persists to chrome as usual.

## Gate

1. **`documentStorage` (unit):** round-trip `saveGraphToStorage(graph, layout)` →
   `loadGraphFromStorage()` returns both; `parseGraphFile` accepts the wrapper **and** a bare
   `GraphDocument` (returns `{ graph }`, no layout); `formatGraphForDownload` emits the wrapper.
   Tests.
2. **Toggle behaviour (where testable):** default true and persisted; the load-apply logic —
   ON+layout → saved, OFF/none → default — covered by a small pure helper if extracted.
3. `check` **and** `test` green for `graph-editor`; keep all prior tests green.
4. **Visual ⚠:** arrange panes, Save; change the layout; Load with toggle ON → panes restore;
   toggle OFF → default layout; the toggle state survives reload. Screenshot.

## Out of scope

A named multi-graph library (single storage slot stays as-is; layout rides whatever graph is
saved/downloaded); embedding layout inside the `GraphDocument` node schema (keep it in the
artifact wrapper); per-graph preview-mode/other chrome (layout only).

## Handoff

→ Each saved/downloaded graph carries its pane layout; loading restores it (toggle-gated,
default on) or falls back to the default layout. Graph files become self-contained workspaces.
