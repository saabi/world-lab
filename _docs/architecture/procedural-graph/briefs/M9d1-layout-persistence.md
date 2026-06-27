# Brief — M9d.1: Editor layout persistence

**Milestone:** M9d.1 (see
[M9d-editor-shell-polish-proposal.md](./M9d-editor-shell-polish-proposal.md) →
Architect decision) · **Package:** `@virtual-planet/graph-editor` · **Depends on:**
M10 ✅ · **Runs:** parallel to M11.1/.2 (different packages); **land before M11.3**
(both touch `GraphEditor.svelte`) · **Design authority:**
[editor-and-scene-integration.md](../editor-and-scene-integration.md) · **Contract
author:** Opus · **Recommended executor:** Composer.

## Objective

Reloading `/graph-editor` restores splitter geometry and the CPU/GPU preview tab.
Editor **chrome** (layout + preview mode) persists under its **own** key — never
inside the `GraphDocument`. Mirrors the scene editor's `layoutStorage` pattern and
this package's existing `documentStorage.ts`.

## Files

- `packages/graph-editor/src/layoutStorage.ts` — load/save/clear chrome *(new)*
- `packages/graph-editor/src/defaultLayout.ts` — `defaultGraphEditorLayout()`, extracted from `GraphEditor.svelte` *(new)*
- `packages/graph-editor/src/GraphEditor.svelte` — wire `onlayoutchange` (debounced save), load chrome on mount, persist preview mode *(update)*
- `packages/graph-editor/src/layoutStorage.test.ts` — round-trip + fallbacks *(new)*

No new dependencies. Keep `graph-editor` scene-free (`sceneFree.test.ts` must stay green).

## Public surface (`layoutStorage.ts`)

Mirror `documentStorage.ts` (same `storage()` helper that throws when `localStorage`
is undefined; key-defaulted functions):

```ts
import { parseLayoutDocument, type LayoutDocument } from '@virtual-planet/subdivide';

export const GRAPH_EDITOR_LAYOUT_KEY = 'virtual-planet:graph-editor-layout:v1';

export interface StoredEditorChrome {
	version: 1;
	layout: LayoutDocument;
	previewMode?: 'cpu' | 'gpu';
}

export function loadEditorChrome(key?: string, defaultZone?: string): StoredEditorChrome | null;
export function saveEditorChrome(chrome: StoredEditorChrome, key?: string): void;
export function clearEditorChrome(key?: string): void;
```

- `defaultZone` defaults to `'canvas'` (the largest pane).
- `loadEditorChrome`: `getItem` → `null` if missing; `JSON.parse`; if shape is wrong or
  `version !== 1` return `null` (caller falls back to default). **Always** run the stored
  layout through `parseLayoutDocument(parsed.layout, defaultZone)` so unknown/removed
  zones are coerced rather than throwing. `previewMode` is kept only if it is exactly
  `'cpu'` or `'gpu'`, else dropped.
- `saveEditorChrome` / `clearEditorChrome`: `setItem` / `removeItem`, mirroring
  `documentStorage`.

## `defaultLayout.ts`

```ts
import type { LayoutDocument } from '@virtual-planet/subdivide';
/** The editor's default pane tree (zones: palette, canvas, preview, code, inspector, validation, markup). */
export function defaultGraphEditorLayout(): LayoutDocument;
```

Move the currently hard-coded default out of `GraphEditor.svelte` into this function.

## `GraphEditor.svelte` wiring

- On mount: `const chrome = loadEditorChrome()`; use `chrome.layout` + `chrome.previewMode`
  if present, else `defaultGraphEditorLayout()` and default preview mode.
- Handle `onlayoutchange` from `<Subdivide>` → debounced (300 ms) `saveEditorChrome({ version: 1, layout, previewMode })`.
- On CPU/GPU toggle: persist the new `previewMode` (same debounced save).
- **New graph** action: `clearGraphStorage()` only — **keep** the layout (architect
  decision: clearing the document must not reset chrome).

## The gate (`layoutStorage.test.ts`)

Mirror `documentStorage.test.ts` localStorage setup (`createStorageMock()` +
`vi.stubGlobal('localStorage', mock)` in `beforeEach`). Tests:

1. `saveEditorChrome` then `loadEditorChrome` round-trips `layout` and `previewMode`.
2. Missing key → `loadEditorChrome()` returns `null`.
3. Corrupt JSON (`localStorage.setItem(KEY, '{not json')`) → `null` (no throw).
4. A stored layout that references an unknown zone still loads (coerced by
   `parseLayoutDocument`) — `loadEditorChrome()` returns a non-null `StoredEditorChrome`.
5. `clearEditorChrome()` removes the key.

**Manual smoke:** resize panes → reload → geometry restored; switch to GPU tab →
reload → GPU still selected. (`npm run check -w fe`; `npm run dev`.)

## Out of scope

Per-document layout (would embed chrome in downloaded JSON — defer); context menus
(M9d.2); CodeMirror (M9d.3). **No new public exports beyond those listed; no IR fields.**

## Done when

`npm run check -w @virtual-planet/graph-editor` + `npm test -w @virtual-planet/graph-editor`
(incl. `sceneFree`) green, and `npm run check -w fe` green.

## Handoff

→ **M9d.2 — pane context menus** (subdivide API pinned in
[M9d2-pane-context-menus.md](./M9d2-pane-context-menus.md)) · executor: Composer +
Opus-reviewed subdivide change · why: with chrome persisted, the next shell win is
zone-aware pane menus. **Do not start M11.3 before this lands if the same agent owns
both** (shared `GraphEditor.svelte`).
