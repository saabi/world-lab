# Brief — M9d fix: code-panel overflow (CSS grid)

**Type:** bug fix (editor shell) · **Package:** `@virtual-planet/graph-editor` ·
**Design authority:** [editor-and-scene-integration.md](../editor-and-scene-integration.md)
· **Contract author:** Opus · **Recommended executor:** Composer/Cursor (⚠ visual gate).
**Must land before M9d.3** (syntax highlighting) — both touch CodeView/MarkupView.

## Problem

`CodeView` and `MarkupView` panels overflow their `subdivide` pane at the **bottom**
(content clipped ~one line). A prior `box-sizing: border-box` fix resolved the
**horizontal** overflow but not the vertical. The panes use a nested percentage-height
chain (`.pane %` → `.inner 100%` → `.zone-content 100%` → `.code-view/.markup 100%`)
plus a flex column with a scrollable `<textarea>` child — a fragile combination where
the scroll child can exceed the row.

## Fix (CSS grid — robust)

Replace the flex column in `.code-view` (CodeView.svelte) and `.markup`
(MarkupView.svelte) with a **CSS grid** that pins the scroll child to a `1fr` track:

```css
.code-view /* and .markup */ {
	box-sizing: border-box;
	display: grid;
	grid-template-rows: auto 1fr;   /* header row, editor row */
	min-height: 0;
	height: 100%;
	padding: 8px;
	gap: 6px;                        /* keep existing gap/spacing */
}

.editor /* CodeView */, .code /* MarkupView */ {
	box-sizing: border-box;
	min-height: 0;                  /* lets the 1fr track constrain the textarea */
	height: 100%;
	width: 100%;
	overflow: auto;
	/* keep existing padding/border/colors */
}
```

`grid-template-rows: auto 1fr` + `min-height: 0` on the textarea reliably bounds the
scroll child to the available space (more robust than `flex:1` for nested scroll
children). Keep `box-sizing: border-box` (already added). The header/title stays in
the `auto` row.

If, after this, the panel still exceeds the pane, the residual is in `subdivide`'s
`.zone-content` (percentage chain) — note it in the report and stop; do **not** change
the shared `subdivide` package without Opus review.

## Files

- `packages/graph-editor/src/CodeView.svelte` — `.code-view` → grid; `.editor` row *(update)*
- `packages/graph-editor/src/MarkupView.svelte` — `.markup` → grid; `.code` row *(update)*

CSS-only; no script, no IR, no new deps. Keep `graph-editor` scene-free.

## Gate

1. `npm run check -w @virtual-planet/graph-editor` + `npm test -w @virtual-planet/graph-editor`
   (incl. `sceneFree.test.ts`) green; `npm run check -w fe` green.
2. **Manual ⚠:** in `/graph-editor`, both the Primitive (WGSL/YAML) and Markup panels
   fill their pane with **no bottom clip**, the textarea scrolls internally, and resizing
   the pane keeps them bounded. Paste what you observe (a screenshot if possible).

## Handoff

→ **M9d.3 — syntax highlighting** (CodeMirror replaces these `<textarea>`s) · executor:
Composer · why: with the panes laid out correctly, CodeMirror can drop into the same
`1fr` grid row. The CodeMirror wrapper must inherit `min-height:0; height:100%`.
