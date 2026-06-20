# Driven fields in the editor — surfacing drivers, bindings & constraints

**Status:** proposal · **Scope:** the `/scene/[...path]` node editor —
`TransformEditor` becomes binding-aware, plus Driver / Constraint sections; a
`driverSchema`; a small field-resolution helper in `scene/`. **Related:**
[scene-routing.md](scene-routing.md) (driver/binding dataflow + type-dispatch
registry).

## Problem

The dataflow (drivers → bindings → constraints, shipped in `scene/driver.ts` +
`constraints.ts`) is **invisible and un-authorable** in the editor:

- Select a `phase` node and `TransformEditor` shows `rotation = 0,0,0`. That's the
  **stored base** transform; the real rotation is written each frame by the binding
  `rotationY ← ../#phase`. So the field looks like an editable literal, you type a
  value, and `evaluateScene` stomps it next frame. Misleading and dead.
- A `driver` (kepler: eccentricity, period, …) has **no UI at all** — it's a nested
  object no kind-schema renders, so eccentric orbits exist but can't be edited.
- `bindings` and `constraints` are likewise unrendered.

Root cause: `TransformEditor` receives only `selectedNode.transform` (a plain TRS) and
emits number inputs; it has no notion of which channels are *driven*, what they're
driven *by*, or what their *live* value is. The kind-schema form only renders fields
in a node's schema, and `driver`/`bindings`/`constraints` aren't in any.

## Goal

Make the wiring legible and editable **in the existing per-node editor** (textual /
path-based — not a node-graph canvas):

1. Every transform channel shows whether it's a **literal** or **driven**; a driven
   channel displays its **expression** (`ref#output`) and **live value** in place,
   instead of a dead, stompable number.
2. **Driver params** are editable (kepler: a / e / period / phase / periapsis).
3. **Bindings** are editable: bind a channel to a driver output, or detach to a
   literal.
4. **Constraints** are visible/editable (limit_rotation X/Y/Z toggles + ranges).

### Non-goals (defer)

- A visual node-graph canvas. We surface wiring per-node, by path.
- Freeform math expressions. A binding is `ref#output` (a named driver output), not a
  formula — for now.

## Design

### 1. Field-view resolution (`scene/fieldViews.ts`, pure + tested)

A helper that, given a node and the **evaluated** scene at the current time, returns a
view per transform channel:

```ts
type Channel = TransformField; // 'positionX' | … | 'scaleZ'
interface FieldView {
  channel: Channel;
  driven: boolean;
  binding?: FieldBinding;     // when driven: { ref, output }
  value: number;              // the LIVE evaluated value (for display)
  literal: number;            // the stored base value (what a literal edit writes)
}
fieldViews(node, evaluatedNode): FieldView[]
```

`driven` = some `node.bindings` targets the channel. `value` comes from the evaluated
node (the post-driver transform), `literal` from the stored node. Pure → unit-tested
like the rest of `scene/`.

### 2. Binding-aware `TransformEditor`

Props change from `{ transform }` to `{ node, evaluated, onchange, … }` (it needs the
bindings + the live value). Per channel:

- **Literal** → number input, as today (writes `transform.<channel>`).
- **Driven** → a non-editable **expression chip**: `ƒ ../#phase = 1.23` (the ref, the
  output, the live value in display units). A "driven" affordance (color/icon, à la
  Blender's purple). Row actions: **Detach** (drop the binding → channel becomes a
  literal at its current value) and **Bind…** (open the binding editor).

The "value you see" for a driven channel is read-only and live; literal edits never
silently fight the driver.

### 3. Driver section

When `node.driver` exists, a **Driver** panel above/below the transform:

- Driver type label (`kepler`) + its params via `SchemaForm` driven by a
  **`driverSchema`** (per type), reusing `x-unit`/`x-scale` (semiMajorAxis in km,
  angles in degrees, eccentricity 0–1, period in s). Edits write `node.driver.*`.
- A read-only list of the driver's **outputs** (`phase`, `radius`, `x`, `z`) so the
  author knows what's bindable.

This is the practical win — eccentricity/period become editable and the ellipse
reshapes live. It needs nested editing, but **scoped**: a dedicated sub-form for the
driver object, not a generic flatten of the whole node.

### 4. Binding editor

Edit/add a binding for a channel: a **ref** (scene path, free-text now using the
existing `resolvePath`; a picker later) + an **output** (chosen from the referenced
driver's known outputs). Authoring-time validation: resolve the ref, warn if it
doesn't reach a node with a driver exposing that output (the path/cycle validation
previously noted as pending).

### 5. Constraint section

List `node.constraints`; for `limit_rotation`, X/Y/Z enable toggles + min/max (degrees
in UI, radians stored). Add/remove constraints.

### 6. Live-value time source

Driven values need a `t`. The map (`SystemMapPanel`) already owns the clock. **Decision
needed:** lift the clock to the route (shared by map + editor) so editor values match
the animation, vs. snapshot at `t=0`. *Recommend lifting the clock* — a driven field
reading a different time than the map would be confusing.

## Editor composition

The node editor stays kind-dispatched (`editorForKind`), but **driver / bindings /
constraints are cross-cutting** — any node may have them. So the editor area renders:
binding-aware `TransformEditor` → Driver section (if `node.driver`) → Constraints
section (if `node.constraints`) → the kind schema form (body, light). Each section
edits its slice and calls the existing `updateNode`.

## Decisions to confirm

1. **Live-value clock:** lift the map clock to the route (recommended) vs. t=0 snapshot.
2. **Driven-field editing:** read-only expression + explicit Detach/Bind (recommended)
   vs. type-to-override auto-detach.
3. **Ref input:** free-text path now, picker later (recommended) vs. picker first.

## Phasing

1. **Read-only legibility** — `fieldViews` + binding-aware `TransformEditor` showing
   driven channels as `ref#output = value`. *This is the direct fix for "we can't see
   the expressions."* (Needs the shared clock from decision 1.)
2. **Driver section** — edit kepler params (eccentricity/period authorable; the
   practical payoff).
3. **Binding + constraint editors** — bind/detach, limit_rotation toggles.
4. **Path picker + authoring-time ref/cycle validation.**

Start with (1): it's pure-`lib/` (`fieldViews`) + a focused `TransformEditor` change,
and it answers the question that prompted this.
