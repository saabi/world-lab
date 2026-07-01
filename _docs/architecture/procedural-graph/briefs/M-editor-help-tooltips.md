# Brief — Surface help/usage tooltips + drop alias primitives

**Type:** editor UX + std-lib cleanup · **Packages:** `@virtual-planet/graph-editor`
(inspector/help surfacing), `@virtual-planet/graph` (remove alias primitives) · **Depends
on:** nothing · **Design authority:** `node-model-design-notes.md` §C · **Contract author:**
Opus · **Recommended executor:** Cursor.

**Status:** DONE `5a17295`

## Problem

Primitives carry `help`/`usage`/`description` metadata, but the **inspector** doesn't render
it (palette/swap menu only show it as a `title` hover). And `sdf.opUnion`/`sdf.opIntersect`
exist purely as **aliases** for `math.min`/`math.max` — cruft that a help tip should replace.

## Part 1 — Render help/usage in the inspector (`graph-editor`)

When a node is selected, `InspectorPanel` shows its `metadata.help` (and `usage` if present,
e.g. as a short example) beneath the title/description — not just a hover `title`. Keep it
compact; fall back to `description` when `help` is absent. (Palette/swap `title` tooltips stay.)

## Part 2 — Remove the SDF alias primitives (`graph`)

Deregister `sdf.opUnion`/`sdf.opIntersect`; steer users to `math.min`/`math.max` via those
nodes' `help` metadata (e.g. "SDF union = `math.min`; intersection = `math.max`"). Update any
sample/default graph or test that referenced the aliases. Do **not** break loading an older
graph that names them — parse should tolerate an unknown primitive as an `unresolved-primitive`
validation error (already the behavior), not a crash.

## Gate

1. **graph:** `sdf.opUnion`/`opIntersect` no longer registered; `math.min`/`max` carry help
   text pointing SDF users to them; the registry/sample tests updated and green.
2. **graph-editor:** selecting a node with `help` shows it in the inspector (unit-test the
   help-resolution helper if extracted).
3. `check` **and** `test` green for both packages; keep prior tests green.
4. **Visual ⚠:** inspector shows help/usage for a selected node; the SDF nodes are gone from
   the palette and their help tip points to math.min/max. Screenshot.

## Out of scope

A full rich-text/example runner for `usage`; auditing every alias in the library (SDF
min/max only here); the deprecated `geometry.fullscreenPlane` alias (kept as a back-compat
resolver, separate).

## Handoff

→ Node help is discoverable in the inspector, and the redundant SDF alias nodes are replaced
by help-tipped `math.min`/`max` — smaller, self-documenting library.
