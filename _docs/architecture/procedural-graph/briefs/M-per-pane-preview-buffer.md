# Brief — Independent output buffer per preview pane

**Type:** editor UX · **Packages:** `@virtual-planet/subdivide` (pass pane id to zone
snippets), `@virtual-planet/graph-editor` (per-pane preview selection) · **Depends on:**
multi-target buffers ✅ · **Design authority:** `editor.md` · **Contract author:** Opus ·
**Recommended executor:** Cursor.

**Status:** DONE `b73e6b3`

## Problem

Two preview panes can be open, but they **share one buffer selection** — changing the output
in one pane changes it in the other, so you can't watch both targets at once.
`GraphEditor.svelte` holds a **single** `selectedPreviewBufferId` `$state` (line 71); the
`preview` zone snippet is rendered into each pane by Subdivide with **no per-pane identity**
(`Pane.svelte:161` `{@render zones[frame.zone]!()}`). So all preview panes read/write the same
selection.

## Part 1 — Subdivide passes pane id to zone snippets (`@virtual-planet/subdivide`)

`Pane.svelte`: render the zone snippet with the pane id — `{@render zones[frame.zone]!(frame.id)}`.
Type `zones` as `Record<string, Snippet<[string]>>` (the snippet receives its pane id). Update
the zone-snippet call sites' types; snippets that don't need the id simply ignore the arg. Keep
existing single-pane behavior unchanged. (Minor, reusable — any per-pane-stateful zone benefits,
e.g. two CodeViews later.)

## Part 2 — Per-pane preview selection (`graph-editor`)

Extract a `PreviewZone.svelte` component that takes the **pane id** (+ `previewBuffers` and the
render deps derived in `GraphEditor`) and holds its **own** `selectedPreviewBufferId` +
`previewFamilyOverride`, defaulting via `inferDefaultPreviewBuffer`. The `preview` snippet
becomes `{#snippet preview(paneId)}<PreviewZone {paneId} .../>{/snippet}`. Each pane instance
selects and renders independently.

- **Persist per pane:** store selection keyed by pane id in the editor chrome (e.g.
  `previewBuffersByPane: Record<paneId, { bufferId; familyOverride? }>`), replacing the single
  `selectedPreviewBufferId`. Restore per pane on load; drop entries for panes no longer present.
- Keep the existing behavior for a single preview pane (it just has one entry).
- If a selected buffer disappears (graph edit), that pane falls back to the default — per pane,
  independently.

## Gate

1. **subdivide:** zone snippets receive their pane id; existing tests green; a test that the
   rendered zone gets the pane id. `check` + `test`.
2. **graph-editor:** two `PreviewZone`s with different pane ids hold independent selection
   (unit-test the per-pane selection model / chrome shape). `check` + `test`.
3. Keep all prior tests green across both packages.
4. **Visual ⚠:** open two preview panes; set different output buffers on each → both render
   their own target simultaneously; changing one doesn't affect the other; selections persist
   across reload. Screenshot.

## Out of scope

More than the existing preview families; syncing/linking panes (independent is the goal);
per-pane camera/zoom for non-image previews (follow-on). `GraphEditor.svelte` is shared —
coordinate if another editor task edits it concurrently.

## Handoff

→ Each preview pane selects and renders its own output buffer, so multi-target graphs are
inspectable side-by-side. Subdivide's pane-id-to-snippet plumbing unlocks other per-pane state.
