# Brief — graph-editor toolbar reorg (grouping + redundant control removal)

**Type:** UI polish (user-flagged) · **Packages:** `@world-lab/graph-editor`
(`GraphEditor.svelte`, `DocumentList.svelte`) · **Depends on:** none · **Design authority:**
none (mechanical reordering/removal; one placement decision made below, not left open) ·
**Contract author:** Opus · **Recommended executor:** Cursor · **Status:** ready to route

## Problem

`GraphEditor.svelte`'s `<header class="toolbar">` (line ~769) currently mixes three unrelated
concerns in one flat row: document/file actions, undo/redo, and canvas/selection actions.
Three specific issues, confirmed by reading the current markup, not assumed:

1. **Undo/Redo splits the file-action cluster.** `<DocumentList>` (line 775) renders the
   document switcher, then `onUndo`/`onRedo` buttons (passed as props, rendered inside
   `DocumentList.svelte`'s own `.actions` row), then the New/Save/Load/More buttons — so
   Undo/Redo visually sits *between* two halves of what should read as one file-action group.
2. **A selection-scoped "Delete" button lives in the file-action toolbar.** Lines 802–808:
   a bare `<button>` disabled unless a node/edge is selected, calling `deleteSelection` — this
   belongs with canvas/selection UX, not alongside document New/Save/Load.
3. **A redundant sidebar toggle duplicates existing affordances.** Lines 809–817: a `»` button
   toggling the canvas zone's floating sidebar via `handleFloatingPanelToggle('sidebar')`. The
   pane's own `N`-key handling and its closed-state reveal tab (both already built, see
   `pending_issues.md`'s N-key floating-panel entry) already cover open/close without a
   toolbar duplicate.

## Fix

- **Remove the `»` sidebar-toggle button** (lines 809–817 and its `.sidebar-toggle` CSS,
  ~line 929) entirely. `N` (while hovering the canvas pane) and the reveal tab are the sole
  ways to open/close it now.
- **Move the "Delete" button into the canvas sidebar itself**, not a new UI surface. The
  `{#snippet sidebar()}` block (line ~652) already has a `<h3>Display</h3>` section (Node
  tint). Add a sibling `<h3>Selection</h3>` section below it with the same Delete button
  (same `disabled`/`onclick` logic, moved verbatim) — this reuses the floating-panel
  infrastructure already built for "canvas-scoped, per-view controls" (the sidebar's own
  stated purpose per `pending_issues.md`: "a natural home for future per-view toggles too")
  instead of inventing a new selection toolbar or context menu.
- **Regroup Undo/Redo with the file-action cluster in `DocumentList.svelte`.** Confirm where
  `onUndo`/`onRedo` currently render relative to the New/Save/Load/More buttons inside
  `DocumentList.svelte`'s markup, and move them to sit immediately adjacent to that cluster
  (either just before New or just after More — pick whichever reads as one visually
  contiguous group with the smallest markup diff) rather than between the document-name
  switcher and the file buttons.

## Gate

1. `packages/graph-editor`: existing 177 tests stay green; update/add a component test
   confirming (a) no element with the sidebar-toggle's `aria-pressed`/title pattern exists
   anymore, (b) a Delete control exists inside the rendered sidebar snippet with the same
   disabled-when-nothing-selected behavior, (c) Undo/Redo render adjacent to the other file
   actions (not split by the document switcher) in `DocumentList.svelte`.
2. `check` **and** `test` green for `graph-editor` and the full workspace.
3. **Visual ⚠:** screenshot of the reorganized toolbar (file actions + undo/redo as one visual
   cluster, no `»` button) and the canvas sidebar showing both "Display" (Node tint) and the
   new "Selection" (Delete) sections.

## Out of scope

Any change to `deleteSelection`'s actual logic; any change to Node tint's controls; adding new
floating-panel content beyond the moved Delete button; keyboard-shortcut discoverability
(tracked separately under the accessibility Phase D backlog).

## Handoff

→ The toolbar reads as three coherent groups (document/file, edit history, and — moved out of
the header entirely — selection actions living with the rest of the canvas's per-view
controls) instead of one flat row mixing all three.
