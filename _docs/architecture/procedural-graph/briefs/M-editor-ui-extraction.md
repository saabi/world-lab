# Brief — Extract shared editor chrome + controls to `@virtual-planet/editor-ui`

**Type:** decoupling / shared package · **Packages:** new `@virtual-planet/editor-ui`;
`fe/` (re-point imports); `@virtual-planet/graph-editor` (consume) · **Depends on:** —
· **Design authority:** [editor.md](../editor.md),
[parameter-and-form-schema.md](../parameter-and-form-schema.md),
[editor-and-scene-integration.md](../editor-and-scene-integration.md) · **Contract
author:** Opus · **Recommended executor:** Cursor.

## Problem

The collapsible section / super-section / vertical-tab chrome the graph editor wants for
its **palette categories** and **inspector param groups** lives in
`fe/src/lib/planet/components/` — which `@virtual-planet/graph-editor` **cannot import**
(it must stay scene-free; the `sceneFree` guard enforces it). The components are needed in
both apps → they must move to a **shared package**. This resolves the placement the param
ADR left open ("graph-editor *or* schema-ui").

## What extracts (already generic — verified)

All have no planet/scene coupling (only labels / value+callback props):

**Section chrome:**
- `EditorSuperSection.svelte`, `EditorSubsection.svelte` — collapsible section chrome
- `EditorVerticalTabs.svelte`, `EditorTabIcon.svelte` + `editorTabIcons.ts` — vertical tabs

**Input controls** (`fe/src/lib/planet/components/controls/`) — the reusable editing
widgets the standalone graph editor needs, all generic (`{ label, min, max, value, onvalue }`):
- `ParamSliderRow.svelte` — **slider with numeric readout to the right** (+ `step`,
  `disabled`); neutralize its `variant = 'planet'` default to `'default'`
- `Range.svelte` — linear slider · `LogRange.svelte` — log-scale slider (wide dynamic
  range, e.g. radius; maps to the param ADR's `x-widget: log`)
- `CheckBox.svelte` — boolean
- `sliderList.css` — shared control styles

These four widgets are exactly the building blocks the schema-driven `SchemaForm` / `ParamForm`
composes (param ADR widget map: number→slider, log→LogRange, boolean→checkbox, …). Putting
them in `editor-ui` makes it the shared **editing-UI primitives** package the form generator
sits on top of. Add any further generic widgets discovered (number input, select/dropdown,
color, vector row) the same way — anything with a `value`/`onvalue` shape and no domain
coupling.

**Does NOT extract:** `EditorParamSection.svelte` — it imports `PlanetParameters` /
`paramEditorSchema` (the **legacy** planet param sliders the param ADR retires). The graph
editor uses the generic sections + controls + the schema-driven `SchemaForm` (param ADR),
**not** `EditorParamSection`.

## Package

```
packages/editor-ui/   @virtual-planet/editor-ui
  src/
    Section.svelte         (← EditorSuperSection; generic, label + collapsed + children)
    Subsection.svelte      (← EditorSubsection)
    VerticalTabs.svelte    (← EditorVerticalTabs)
    TabIcon.svelte, tabIcons.ts
    controls/
      SliderRow.svelte     (← ParamSliderRow; slider + numeric readout)
      Range.svelte, LogRange.svelte, CheckBox.svelte
      sliderList.css
    index.ts
  package.json (peerDep svelte ^5; NO @virtual-planet/{graph,schema} — pure chrome + controls)
  tsconfig.json
```

Svelte-only, framework-chrome — **no** graph/schema/scene dependency (keep it the generic
layer both the schema form package and graph-editor sit on). Mirror `subdivide`'s package
shape.

## Migration

- Move the section chrome + the four control widgets into `editor-ui` (neutral names;
  prefer updating `fe/` imports over leaving re-export shims). Neutralize control styling
  variants (`variant='planet'` → `'default'`).
- `fe/` (scene editor **and** its appearance/control usages) imports from
  `@virtual-planet/editor-ui` — behaviour unchanged. Note `EditorParamSection` still
  imports the slider widget; point it at `editor-ui`'s control while it remains in `fe/`.
- `graph-editor` adds the dep (the `sceneFree` guard already allow-lists
  `@virtual-planet/*`; add `editor-ui` to its allow-list pattern).

## Gate

1. `editor-ui` builds: `npm run check`/`test` green (smoke tests: `Section` collapse;
   `SliderRow` emits `onvalue` and shows the numeric readout; `CheckBox` toggles).
2. `fe` check green; the scene editor renders unchanged (manual: `/scene` sections collapse
   **and** sliders/checkboxes still work).
3. `graph-editor` check/test green; `sceneFree.test.ts` updated to allow `editor-ui` and
   still green.
4. Root `npm install` links the new workspace.

## Out of scope

Extracting `EditorParamSection` (legacy, retires with `paramEditorSchema`); the schema-form
generator itself (param ADR — may later live in `editor-ui` or a thin `schema-ui` on top;
not this brief); restyling. **Pure relocation + re-point.**

## Handoff

→ Shared chrome exists. **Palette categorization** ([M-planet-primitive-harvest.md](./M-planet-primitive-harvest.md),
[M-usegpu-primitive-harvest.md](./M-usegpu-primitive-harvest.md)) and the schema-driven
**inspector param sections** can now use `Section`/`Subsection` in graph-editor. Update the
param ADR placement note to point here.
