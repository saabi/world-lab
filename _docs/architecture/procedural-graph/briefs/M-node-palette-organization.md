# Brief — Node palette: search + organize by section / contract / both

**Type:** editor UX · **Packages:** `@virtual-planet/graph-editor` (palette only; reuse
`@virtual-planet/editor-ui` `Section`/`Subsection`) · **Depends on:** nothing (independent of
the preview chain — different file, safe in parallel) · **Design authority:**
[editor.md](../editor.md), `node-model-design-notes.md` §C (contract/role/swapFamily) ·
**Contract author:** Opus · **Recommended executor:** Cursor.

## Problem

`NodePalette.svelte` is a **flat, unsearchable list** of every registered primitive (id +
category). The library has grown past the point where scanning works. Add a **search bar** and
**switchable grouping** with collapsible groups, using taxonomy that already exists in the
primitive metadata — no graph-core changes.

Two grouping axes are already in the data:

- **Section** — `primitive.category` (e.g. `'geometry/source'`, `'noise'`, `'Colour'`,
  `'stage'`). Some are path-like (`a/b`) → split on `/` for Section→Subsection nesting.
- **Contract** — `swapFamily(primitive)` (from `@virtual-planet/graph`) = `role ??
  contractOf(primitive)` (e.g. `colorSpace`, `pipelineStage`, or a mechanical port
  signature). This is the "nodes interchangeable here" axis.

## Part 1 — Pure palette model (`nodePaletteModel.ts`, new + test)

Keep grouping/search logic pure and unit-tested, separate from the Svelte view:

```ts
export type PaletteMode = 'section' | 'contract' | 'both';

export interface PaletteGroup {
	key: string;            // category / swapFamily key
	label: string;          // human label (see below)
	primitives: NodePrimitive[];
	subgroups?: PaletteGroup[];  // populated in 'both' mode
}

export function filterPrimitives(prims: NodePrimitive[], query: string): NodePrimitive[];
export function groupPrimitives(prims: NodePrimitive[], mode: PaletteMode): PaletteGroup[];
```

- **`filterPrimitives`** — case-insensitive substring/token match across `id`, `category`,
  `metadata.keywords`, and `metadata.description`. Empty query → all.
- **`groupPrimitives`**:
  - `section` → group by `category` (split path-like categories into Section→Subsection).
  - `contract` → group by `swapFamily(p)`; sort groups by size then label.
  - `both` → primary by section, nested subgroups by contract (`PaletteGroup.subgroups`).
- **Labels** — contract label = `role` title-cased when present, else `contractOf` (render
  the raw key; a friendlier map for known roles is fine but not required). Section label =
  the category segment. Sort primitives within a group by `id`.

## Part 2 — Palette view (`NodePalette.svelte`)

- **Search input** pinned at the top; filters live as you type.
- **Mode switch** (segmented control): `Section · Contract · Both`.
- **Collapsible groups** via editor-ui `Section`/`Subsection` (Both mode = `Section`
  containing `Subsection`s). While a search query is active, **auto-expand** groups that have
  matches and hide empty groups. Show each primitive as today (id + a muted category/contract
  badge); add `metadata.help` as the button `title` (hover tooltip) to aid discovery.
- **Persist** the selected mode + per-group collapse in `localStorage` directly from the
  palette (a dedicated key) so it does **not** touch `GraphEditor.svelte`'s chrome layout —
  keeps this disjoint from the in-flight preview task. Default mode: `section`.

## Gate

1. **Unit (`nodePaletteModel.test.ts`):** `filterPrimitives` matches by id, category, and a
   keyword (and excludes non-matches); `groupPrimitives` returns expected groups for each mode
   — `section` groups by category (path split), `contract` groups by `swapFamily`, `both`
   nests contract under section; primitives sorted by id within a group.
2. `check` **and** `test` green for `graph-editor`; keep all prior tests green.
3. **Visual ⚠:** typing in search narrows the list and auto-expands matching groups; the mode
   switch regroups; groups collapse/expand; the choice survives reload. Screenshot.

## Out of scope

Removing deprecated alias primitives (`sdf.opUnion`/`opIntersect` → `math.min`/`max`) — that's
a separate registry change; the help-tooltip surfacing here is the discovery half of it.
Drag-from-palette, favourites/recents, fuzzy ranking (substring is enough for v1),
keyboard-driven quick-add palette (command-palette is a separate feature).

## Handoff

→ The palette scales with the library: searchable, and groupable by where a node *lives*
(section) or what it can *swap with* (contract), or both. Sets up the node-swap "Change
operation ▸" UX (same `swapFamily` axis) and a future command-palette quick-add.
