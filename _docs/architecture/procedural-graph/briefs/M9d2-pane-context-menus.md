# Brief — M9d.2: Zone-aware pane context menus

**Milestone:** M9d.2 (see
[M9d-editor-shell-polish-proposal.md](./M9d-editor-shell-polish-proposal.md) →
Architect decision, **Option A**) · **Packages:** `@virtual-planet/subdivide` (generic
API — Opus-pinned below), `@virtual-planet/graph-editor` (zone menus) · **Depends on:**
M9d.1 ✅ · **Design authority:**
[editor-and-scene-integration.md](../editor-and-scene-integration.md) · **Contract
author:** Opus · **Recommended executor:** Composer (subdivide change is Opus-reviewed).

## Objective

Right-clicking a pane offers actions **relevant to its zone** (plus the generic
split/close/retarget actions), via a **generic, host-driven** menu in `subdivide`.
`subdivide` stays domain-agnostic — it renders host-supplied actions keyed by the
pane's **opaque** `zone` string; it knows nothing about graphs or scenes.

## Pinned `subdivide` API (additive — no breaking change)

Add to `@virtual-planet/subdivide` (new types exported from `layout/types.ts`; new
**optional** props on `Subdivide`). Existing call sites compile unchanged.

```ts
/** A host-provided action for a pane's zone menu. */
export interface PaneContextAction {
	id: string;
	label: string;
	disabled?: boolean;
	run: (ctx: { paneId: string; zone: string }) => void;
}

/** Emitted when a host opts to fully own the menu instead of supplying actions. */
export interface PaneContextEvent {
	paneId: string;
	zone: string;
	clientX: number;
	clientY: number;
}
```

New optional `Subdivide` props:

```ts
// menus per opaque zone key; subdivide renders the shell + built-in layout actions
zoneContextMenus?: Record<string, PaneContextAction[]>;
// escape hatch: if set, subdivide calls this instead of rendering its own menu
onpanecontextmenu?: (event: PaneContextEvent) => void;
```

**Behavior:**

- On `contextmenu` over a pane body: if `onpanecontextmenu` is set, call it and
  `preventDefault` (host owns the menu). Otherwise, if `zoneContextMenus[zone]` exists,
  render `subdivide`'s shared menu shell at `(clientX, clientY)` with those actions
  **followed by built-in layout actions** (Split N/S/E/W, Change pane type, Close pane);
  `preventDefault`. If neither is set, do nothing (browser default).
- `run({ paneId, zone })` is invoked on selection; menu closes on action / outside-click / Esc.
- Keep zones opaque strings — **no** graph/scene-specific logic in `subdivide`.

**Compose helper (the headless-testable core — pin this):**

```ts
/** Built-in layout actions + host zone actions, in display order. Pure. */
export function composePaneMenu(
	zone: string,
	zoneMenus: Record<string, PaneContextAction[]> | undefined,
	builtins: PaneContextAction[]
): PaneContextAction[];
```

Order: host zone actions first, then a separator-marked `builtins` group. (Represent the
separator however the shell prefers; the function returns the ordered action list.)

## Files

- `packages/subdivide/src/layout/types.ts` — `PaneContextAction`, `PaneContextEvent` *(update)*
- `packages/subdivide/src/layout/menu.ts` — `composePaneMenu` *(new)* · `menu.test.ts` *(new)*
- `packages/subdivide/src/Subdivide.svelte` / `Pane.svelte` — props + `contextmenu` handling + menu shell *(update)*
- `packages/graph-editor/src/GraphEditor.svelte` — pass `zoneContextMenus` *(update)*
- `packages/graph-editor/src/paneMenus.ts` — zone → actions map *(new)*

## Graph-editor zone menus (v1)

Per the proposal table — wire these into `paneMenus.ts`:

| Zone | Actions |
|------|---------|
| canvas | Fit view, Delete selection (if any), Duplicate node |
| preview | CPU / GPU toggle, Refresh preview |
| inspector | Clear selection |
| code | Save primitive (if dirty), Revert draft |
| markup | Re-sync from graph (discard draft), Copy markup |
| validation | Copy report |
| palette | *(none v1)* |

## Conditions (architect-required)

- **Additive only** — verify existing scene-editor usage still builds: `npm run check -w fe`.
- Zones stay **opaque**; no graph/scene semantics enter `subdivide`.
- A right-click inside an editable `CodeView`/`MarkupView` textarea keeps the browser
  default (do **not** hijack text editing) — pick this policy and note it.

## The gate

1. **subdivide (headless):** `menu.test.ts` — `composePaneMenu('canvas', { canvas: [a] }, [b])`
   returns `[a, …, b]` (zone action before built-ins); unknown zone returns just `builtins`;
   empty inputs return `builtins`.
2. `npm run check -w @virtual-planet/subdivide` + `npm test -w @virtual-planet/subdivide` green.
3. `npm run check -w fe` green (scene editor unaffected by the additive props).
4. `graph-editor`: `sceneFree.test.ts` + package tests green.
5. **Manual ⚠:** right-click canvas with a node selected → Delete works; right-click preview
   → toggle CPU/GPU without the tab bar.

## Out of scope

Keybindings editor; node/edge (xyflow) context menus beyond canvas (future); undo/redo.
**No new public exports beyond those listed.**

## Done when

subdivide + graph-editor + fe checks/tests green, the additive API is backward-compatible,
and the manual smoke passes.

## Handoff

→ **M9d.3 — syntax highlighting** (CodeMirror 6 in `graph-editor`; markup first, then
CodeView) · executor: Composer · why: with chrome + menus done, the last shell win is
readable code panes.
