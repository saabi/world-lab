# Brief — Node palette: all sections collapsed by default

**Type:** touch-up (follows `M-node-palette-organization`) · **Packages:**
`@virtual-planet/graph-editor` (palette only) · **Depends on:** node-palette organization ✅
(`8e358e1`) · **Contract author:** Opus · **Recommended executor:** Cursor.

## Problem

The palette currently renders **every group expanded** by default: `NodePalette.svelte`
tracks `collapsedGroups` (a set that starts empty), and `isGroupOpen(key) =
!collapsedGroups.has(key)` → empty set means all open. With the full library that's a wall of
nodes. Default should be **all sections (and Both-mode subsections) collapsed**; the user
expands what they need.

## Fix

Make collapsed the resting default while preserving persistence and search behaviour. Flip
the model so "open" is opt-in — e.g. track `expandedGroups` (default empty = all collapsed)
instead of `collapsedGroups`, and `isGroupOpen(key)` resolves from that. Specifically:

- **First load, no stored prefs:** every `Section` and every Both-mode `Subsection` is
  collapsed.
- **Persistence preserved:** groups the user expands are remembered across reload (migrate or
  replace the existing localStorage shape — a stored `collapsedGroups` from the old version
  may simply be dropped; don't crash on it).
- **Search unchanged:** an active search query still auto-expands matching groups (the
  collapsed default applies to the no-query resting state); clearing the query returns groups
  to collapsed except those the user explicitly expanded.
- Switching grouping mode (Section/Contract/Both) lands on all-collapsed unless the user had
  expanded specific groups in that mode.

## Gate

1. **Unit (where the open-state resolver is testable):** with no stored state,
   `isGroupOpen`/the resolver returns collapsed for all group keys; after expanding a key it
   returns open for that key only.
2. `check` **and** `test` green for `graph-editor`; keep all prior tests green.
3. **Visual ⚠:** opening the palette shows all sections collapsed; expanding one and
   reloading keeps it expanded; typing a search still reveals matches. Screenshot.

## Out of scope

Expand-all / collapse-all controls (nice follow-on, not now); changing grouping logic or
search. Owns `NodePalette.svelte` (+ its model file if the resolver lives there) — disjoint
from the preview-render fix (`GraphEditor.svelte`).
