# Brief — Node swap UX: click the node title to replace it by contract

**Type:** editor UX (Tier 2 node-swap, see `pending_issues` + node-model design notes §C) ·
**Packages:** `@virtual-planet/graph-editor` (node title menu + replace mutation) ·
**Depends on:** swap-family helpers ✅ (`listSwapFamily`/`swapFamily`), palette search model ✅
(`filterPrimitives`) · **Design authority:** `node-model-design-notes.md` §C
(role/contract/swapFamily) · **Contract author:** Opus · **Recommended executor:** Cursor.

## Goal

Clicking a node's **title/name** opens a **searchable node menu** — the same search UX as the
palette, but **pre-filtered to primitives compatible with this node's contract** — and picking
one **replaces the node in place**, preserving position, compatible edges, and params. This is
the "Change operation ▸" UX; the metadata to drive it (`role`/`contractOf`/`swapFamily`)
already landed.

## Part 1 — Compatible candidates (reuse `@virtual-planet/graph`)

`listSwapFamily(node.primitive)` (`contract.ts:39`) already returns every primitive sharing
the node's `swapFamily` (`role ?? contractOf`). Use it directly as the candidate set
(exclude the node's current primitive, or mark it "current"). No graph-core change.

## Part 2 — Title-click swap menu (`graph-editor`)

- Make the node **title** in `GraphNodeView.svelte` a click target that opens a popover menu
  anchored to the node. Distinguish **click** (open menu) from **drag** (move node) so the
  swap menu doesn't fight node-dragging — open on a click with no drag movement, and/or show a
  small caret affordance on the title.
- The menu is a compact, searchable list — **reuse `filterPrimitives`** (and the palette's
  item rendering/help-tooltip) over the `listSwapFamily` candidates. Empty query shows all
  compatible candidates; typing filters. A new `NodeSwapMenu.svelte` may wrap the shared
  search/list; do **not** duplicate the filter logic.
- Selecting a candidate dispatches the replace edit intent (Part 3) and closes the menu.

## Part 3 — `replaceNodePrimitive` edit intent (`irAdapter.ts`)

Add an `applyEditIntent` case that swaps a node's primitive **in place**:

- Keep the node **id and position**.
- Re-instantiate ports from the **new** primitive (reuse `instantiatePorts`).
- **Preserve params** whose names still exist on the new primitive's schema (drop the rest;
  carry values where types match).
- **Preserve edges** whose endpoint ports still resolve on the new node **and** stay
  type-compatible (`compatibleDataTypes`); **drop** edges to ports that no longer exist or
  mismatch — same-contract swaps keep every edge, role-family swaps with differing signatures
  drop only the incompatible ones. (Don't silently keep an edge to a vanished port.)
- Trigger the existing recompile reactivity (the compile signature already keys on
  `{primitive, params, edges}`).

## Gate

1. **Unit (`irAdapter`):** `replaceNodePrimitive` keeps id+position; swapping within an
   identical contract (e.g. `noise.value2d` ↔ `noise.worley2d`, both `vec2f → f32`) preserves
   **all** edges and compatible params; swapping to a primitive missing a port drops only that
   edge; params absent on the new schema are dropped.
2. `check` **and** `test` green for `graph-editor`; keep all prior tests green.
3. **Visual ⚠:** click `noise.worley2d`'s title → menu lists its contract-mates (incl.
   `noise.value2d`) → selecting swaps the node, the `position → … → vec4f` edges survive, and
   the Effect preview recompiles to the new noise. Screenshot.

## Out of scope

Swapping that **rewires** to satisfy a new contract (only preserve-or-drop here); multi-node
swap; the palette's grouping modes inside the popover (flat filtered list is enough); the
"Save as group" / collapse UX (separate). Adding `role`/`swapFamily` to primitives that lack
sensible families (data-driven — separate registry pass).

## Handoff

→ Nodes are swappable in place by contract from their title, reusing the swap-family metadata
and the palette search. Sets up richer "Change operation ▸" affordances and, later,
rewire-on-swap.
