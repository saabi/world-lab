# Brief — editor accessibility, Phase C (keyboard port connection)

**Type:** accessibility · **Package:** `@world-lab/graph-editor`
(`GraphNodeView.svelte`) · **Depends on:** Phase B ✅ landed (`06e710b`) · **Design
authority:** none new — reuses the existing right-click quick-connect menu
(`PortConnectMenu.svelte`) verbatim, just adds a keyboard trigger for it · **Contract
author:** Opus · **Recommended executor:** Cursor · **Status:** ready to route

## Problem — scope is narrower than `pending_issues.md`'s phasing note implies

That note reads: "the graph canvas has no keyboard-only path to move a node or make a
connection... arrow-key selection may already exist via xyflow's own defaults, unverified."
**Verified, not assumed, by reading `@xyflow/svelte`'s own source
(`node_modules/@xyflow/svelte/dist/lib/components/NodeWrapper/NodeWrapper.svelte`):** node
selection and arrow-key movement are **already fully working**, for free, out of the box —
`onKeyDown` already handles `elementSelectionKeys` (select/deselect) and arrow keys
(`store.moveSelectedNodes`, with an `aria-live` announce message on every move), gated only by
`store.disableKeyboardA11y`, which `GraphCanvas.svelte` never sets. **This brief is not about
that** — it's already done, nothing to build.

The genuine, confirmed gap: **ports have zero keyboard affordance at all.**
`GraphNodeView.svelte`'s `.port.in`/`.port.out` divs (lines ~144-187) have no `tabindex`, no
`onkeydown` — the *only* way to open `PortConnectMenu.svelte` (the existing right-click
quick-connect menu, already built, already tested) is `oncontextmenu`, a pointer-only event.
A keyboard/AT user can select and move nodes but cannot make a connection at all.

## Fix

- Add `tabindex="0"` and an `aria-label` (e.g. `"${direction === 'in' ? 'Input' : 'Output'}
  port ${name}, ${dataType}"`) to both `.port.in` and `.port.out` divs.
- Add an `onkeydown` handler to each mirroring `onPortContextMenu`'s existing logic exactly
  (`GraphNodeView.svelte` lines ~75-89: compute `matches` via `compatibleConsumers`/
  `compatibleProducers`, set `connectMenu` to open the popup) — trigger on `Enter` or `Space`,
  calling `event.preventDefault()` first (Space's default is page-scroll). **Reuse the
  existing function directly** (adapt its `MouseEvent`-specific `preventDefault`/
  `stopPropagation` calls to work from a `KeyboardEvent`, or extract the shared
  matches-computation + state-setting into a small helper both handlers call) — do not
  duplicate the compatible-primitive matching logic.
- `PortConnectMenu.svelte` itself needs no changes — it's already keyboard-operable (it has
  its own search input and, since Phase B, a focus trap). Opening it via keyboard should just
  work once it's triggered.
- Verify the newly-focusable ports don't break xyflow's own pointer-drag-to-connect
  interaction (this is additive — pointer users see no change).

## Gate

1. `packages/graph-editor`: existing 196 tests stay green; new tests — a port div has
   `tabindex="0"`; pressing Enter (and Space) on a focused port opens `PortConnectMenu` with
   the same `matches` a right-click on that port would produce; Escape or selecting an entry
   closes it, focus returns sensibly (Phase B's focus-trap restore behavior, reused, not
   reinvented).
2. `check` **and** `test` green for `graph-editor` and the full workspace.
3. **Manual ⚠:** using only the keyboard (Tab to a node, arrow keys to confirm movement still
   works, Tab further to reach a port, Enter to open quick-connect, arrow/type to pick a
   match), wire a complete connection with zero mouse input.

## Out of scope

Keyboard-driven manual edge-drawing (dragging a wire node-to-node without the quick-connect
menu) — the menu path already covers "make *a* connection," a raw drag-equivalent isn't
needed to close this gap. Phase D (in-app keyboard-shortcut reference) and Phase E (opt-in
text-readability preferences) — separate, later phases.

## Handoff

→ A keyboard/AT user can fully author a graph — select, move, and connect nodes — with zero
pointer input, reusing every piece of already-built, already-tested connection UX rather than
inventing a parallel keyboard-only interaction model.
