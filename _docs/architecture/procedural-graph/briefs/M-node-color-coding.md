# Brief — Color-code nodes by category or contract (toggle)

**Type:** editor UX (quick win) · **Packages:** `@virtual-planet/graph-editor`
(`GraphNodeView.svelte` + a color map) · **Depends on:** nothing · **Design authority:**
`editor.md` · **Contract author:** Opus · **Recommended executor:** Cursor.

## Goal

Give each node a color accent derived from its **category** (or **contract/`swapFamily`**), with
a small toggle to pick the mode (or turn it off). Makes a dense graph scannable at a glance.

## Fix

- A pure `nodeAccentColor(primitive, mode: 'category' | 'contract' | 'off'): string | null`
  in a new small module (+ test): a stable hash → hue, or a curated map for the well-known
  categories (`vector`, `noise`, `math`, `sdf`, `Colour`, `geometry/*`, `stage`, `target/*`).
  `contract` mode keys on `swapFamily(primitive)`; `off` → null (no accent).
- `GraphNodeView.svelte` applies the accent as the node header background / left border
  (subtle, not full-fill — keep text legible; respect the existing error/warning highlight so
  a validation state still reads).
- A toggle in the editor toolbar/chrome (`nodeColorMode`, default `category`), persisted in
  chrome like `previewMode`.

## Gate

1. **Unit:** `nodeAccentColor` is deterministic per primitive, distinct across a few sample
   categories, and `null` for `off`; `contract` mode keys on `swapFamily`. Test.
2. `check` **and** `test` green for `graph-editor`; keep prior tests green.
3. **Visual ⚠:** nodes are tinted by category; switching to contract regroups colors; off
   removes them; error/warning highlight still visible; choice persists. Screenshot.

## Out of scope

Per-category user-editable palettes; legend UI; colorblind-safe curation (a follow-on — pick
reasonable defaults now).

## Handoff

→ Graphs are visually organized by category/contract at a glance, complementing the palette
grouping and swap menu that already use these axes.
