# Brief — user-facing node names

**Type:** editor UX gap (user-flagged) · **Packages:** `@world-lab/graph` (`Node` type),
`@world-lab/graph-editor` (`irAdapter.ts`, `InspectorPanel.svelte`, `GraphNodeView.svelte`) ·
**Depends on:** none · **Design authority:** none (additive field, no existing ADR governs
node identity) · **Contract author:** Opus · **Recommended executor:** Cursor · **Status:**
ready to route

## Problem

`packages/graph`'s `Node` type (`types.ts`) is `id`/`primitive`/`params`/`inputs`/`outputs`/
`position` only — no user-facing display name/label field. Nodes are only ever shown by their
`id` (an opaque, minted string — see `graphIds.ts`) or their `primitive` type (e.g.
`noise.perlin3d`), both on the canvas (`GraphNodeView.svelte`'s `<span class="label-text">
{nodeData.label}</span>`, where `label` is set to `node.primitive` verbatim in
`irAdapter.ts::graphToFlow`, line ~158) and in the inspector (`InspectorPanel.svelte`'s
`<h2 class="title">{primitive.id}</h2>` — the *primitive's* id, e.g. `"noise.perlin3d"`, not
the node's). A graph with several `noise.perlin3d` nodes wired together is unreadable at a
glance; nothing distinguishes them.

## Fix

- **`packages/graph/src/types.ts`:** add an optional `name?: string` field to `Node`. Purely
  additive — no schema migration, no change to serialization shape beyond one new optional key
  (existing `.test.ts` round-trip/validation tests should need no changes; add one asserting a
  `Node` with `name` set serializes/deserializes losslessly).
- **`packages/graph-editor/src/irAdapter.ts`:**
  - Add a new `GraphEditIntent` variant: `{ kind: 'set-name'; nodeId: string; name: string }`
    (follow the existing `set-params` case exactly — see `applyEditIntent`'s
    `case 'set-params'`, a 6-line `nodes.map` replace; `set-name` is the same shape).
  - `graphToFlow`'s `label` computation becomes `node.name?.trim() || node.primitive` (empty/
    whitespace-only names fall back to the primitive id — never show a blank canvas label).
- **`packages/graph-editor/src/InspectorPanel.svelte`:** add an editable text field for the
  node's name near where params are already edited (this file already computes `node`/
  `primitive` from `nodeId`; wire a new input calling `onchange?.(applyEditIntent(graph,
  { kind: 'set-name', nodeId, name: next }), 'Rename node')` — the existing `onchange` prop
  already threads an optional history label through to `GraphEditor.svelte`'s undo stack, see
  the `set-params` call site immediately below for the exact pattern). Placeholder text should
  show the primitive id so an unnamed node's field isn't just empty with no context.
- **`packages/graph-editor/src/GraphNodeView.svelte`:** no structural change needed —
  `nodeData.label` already renders via `irAdapter.ts`'s `graphToFlow`, so once that falls back
  correctly, the canvas display updates for free. Consider (optional, not required for the
  gate): showing the primitive id as a small secondary/muted line under a custom name, so
  "which primitive is this" stays visible even once renamed — a judgment call, not a hard
  requirement.

## Gate

1. `packages/graph`: existing tests green; new test for `name` field round-trip.
2. `packages/graph-editor`: existing 163 tests green; new tests for (a) `applyEditIntent`'s
   `set-name` case, (b) `graphToFlow`'s fallback-to-primitive-id behavior when `name` is unset/
   blank, (c) the InspectorPanel rename field firing the intent with the right node id/label.
3. `check` **and** `test` green for both packages and the full workspace (`apps/webgputoy`
   consumes `graph-editor` transitively).
4. **Visual ⚠:** screenshot showing a renamed node's custom label on the canvas, distinct from
   an unrenamed sibling of the same primitive type.

## Out of scope

Bulk/find-replace renaming; enforcing name uniqueness (names are cosmetic, not identifiers —
`id` remains the real reference key everywhere); exposing `name` in the compiled WGSL or any
codegen path (it's editor-only presentation metadata, same tier as `position`).

## Handoff

→ Nodes become distinguishable by role/intent, not just primitive type — a real readability
unlock for any graph with repeated primitives (which is most non-trivial graphs).
