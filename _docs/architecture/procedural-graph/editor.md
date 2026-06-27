# Graph editor

**Status:** architecture · **Scope:** `packages/graph-editor` (reusable Svelte
components), `apps/graph-editor` (standalone app). Part of the
[Procedural Graph System](./README.md).

> **Scope ADR:** Parameter inspectors use the shared form schema policy in
> [parameter-and-form-schema.md](./parameter-and-form-schema.md). Resource and
> host input ports use the
> [addendum](./parameter-and-form-schema-addendum.md) (port panel, not
> `SchemaForm`). Scene-tree scope:
> [editor-and-scene-integration.md](./editor-and-scene-integration.md).

A first-class but **separate** package (`graph-editor`) that edits the Typed
Graph IR — it is *not* a planet editor and does **not** own the graph model. Two
delivery modes from one component set:

- **Standalone app** (`apps/graph-editor`) for editor development, primitive
  testing, graph-compilation debugging, WGSL inspection, validation, profiling —
  no planet renderer required.
- **Embeddable library** used inside the main app: `<GraphEditor bind:graph />`
  next to `<PlanetViewport {graph} />`; the renderer reacts to graph changes, no
  duplicate editor.

Exported Svelte components are generic: `GraphEditor`, `GraphCanvas`,
`NodePalette`, `InspectorPanel`, `PortView`, `ConnectionLayer`, `OutputPanel`,
`MiniMap`, `Toolbar`, `ValidationPanel`, plus the code surfaces `MarkupView`
(Svelte) and `CodeView` (WGSL primitive source). Responsibilities: visualization,
node/edge editing, typed-connection validation, inspector, serialization,
import/export, auto-layout, selection, undo/redo, clipboard, shortcuts. It must
contain **no** Virtual-Planet-specific rendering logic.

Everything is **schema-driven** (see
[schema-and-primitives.md](./schema-and-primitives.md)): the palette, node
appearance, ports, inspector widgets, tooltips, and context menus are generated
from registered primitive schemas — adding a primitive automatically exposes
editable properties; no handwritten inspectors. Inspector **grouping** —
collapsible sections and super-sections — is likewise schema-driven: it is declared
in a primitive's frontmatter (see
[schema-and-primitives.md](./schema-and-primitives.md#self-describing-wgsl-primitives))
and rendered with the ported `EditorSuperSection` / `EditorParamSection` /
`EditorSubsection` chrome. This **extends the repo's existing schema-driven node
editor** — the `/scene/[...path]` kind-schema forms (see
[driven-fields-editor.md](../../specs/driven-fields-editor.md)) already render
inspectors from a node's schema — rather than introducing a parallel editor model. The editor never emits WGSL
directly; it always goes Editor → Graph IR → Compiler → WGSL, guaranteeing every
authoring method produces identical code. Although Svelte is first, the same model
later supports `@virtual-planet/react-editor` / `vue-editor` with no
IR/compiler/format changes.

Both the standalone app and the embedded use edit the **same** app-agnostic
document store, so a graph (including a shared surface/tessellation document) saved
in one is opened and edited in the other — see
[collaboration-and-mcp.md](./collaboration-and-mcp.md) and
[runtime-and-tessellation.md](./runtime-and-tessellation.md).

## Multi-level synchronized editing

The editor exposes the **same graph at three levels at once**, and an edit at any
level propagates to the others:

1. **Visual graph** — nodes, ports, edges (`GraphCanvas`).
2. **Graph markup (Svelte)** — the declarative `<PlanetGraph>…</PlanetGraph>`
   document describing the *same* instances and wiring (`MarkupView`).
3. **Primitive code (WGSL + YAML frontmatter)** — the definition of a node *type*
   (`CodeView`; see [schema-and-primitives.md](./schema-and-primitives.md)).

**The Typed Graph IR stays canonical; every view is a projection of it.** An edit
in any view produces an IR patch (or, for primitive code, a primitive-schema
change); the other views re-derive from the patched IR. This is the same
patch-based model used for multi-client sessions
([collaboration-and-mcp.md](./collaboration-and-mcp.md)), applied here to multiple
*views of one client*.

Two kinds of "code" edit **different documents**, which keeps the model sane:

- **Graph markup ↔ visual graph** edits the *graph document* (instances). A
  **bidirectional, lossless** round-trip over the declarative subset: visual edits
  regenerate markup; markup edits reparse to IR and update the canvas.
- **Primitive code** edits a *primitive-type document* (self-describing WGSL).
  Saving re-runs the signature + YAML loader, re-registers the primitive, and **ripples
  to every graph using it** — ports, inspector, and node appearance update live,
  and a graph that referenced a now-removed output surfaces an error in the
  `ValidationPanel` rather than silently breaking.

### Document format: IR-native, Svelte-as-export

**Decision: the canonical, saved document is the serialized Graph IR (JSON).**
Svelte is an **export format** (and an optional, *constrained* import format) — not
the native file. React/Vue/MCP/visual all sit on the IR as equal projections; none
is privileged as "the file."

This is what bounds the whole problem. Because the IR is authoritative, Svelte
markup only has to represent the **declarative subset** that maps 1:1 to the IR;
there is no arbitrary authored Svelte the system is obligated to preserve. Bounding
that subset deliberately (a small declarative grammar — `<PlanetGraph>` +
field/consumer components) is the enabling constraint: it makes the AST parse
tractable and safe and keeps the round-trip lossless. Logic outside the subset is
not stored in the document at all.

### Runtime Svelte compilation — only where actually needed

With Svelte demoted to a projection, the runtime cost drops sharply. Three tiers:

- **Export — IR→Svelte printer (no compiler).** Generating markup from the IR is
  pure printing; needs nothing from `svelte/compiler`. Always available.
- **Constrained import — small parser (compiler optional).** An editable
  `MarkupView` parses the bounded declarative grammar back to IR. A purpose-built
  parser suffices; `svelte/compiler`'s `parse` may be used for convenience but is
  not required. No authored code executes — bounded and safe.
- **Live document — compile-and-run (optional, deferred).** *Only* if we later want
  reactive markup (`{mountainScale}`, runes, `bind:graph`) reflected live does
  `svelte/compiler` become a true runtime dependency, with in-browser compile +
  **evaluation** of authored code. Accept the costs then: bundle weight, a security
  surface (run it in a Worker/iframe sandbox), and that arbitrary imperative Svelte
  is not losslessly representable as IR. This is a nice-to-have, not core.

So `svelte/compiler` as a hard runtime dependency is confined to the optional
live-document mode; the IR-native core and multi-level editing work without it.

### Bounded Svelte import: conversion & player

The constrained importer earns its keep in two roles beyond live editing — both
staying on the safe **bounded-Svelte → parse → IR** path, so neither needs the
runtime Svelte compiler:

- **Transformation into native format.** A one-shot converter ingests bounded
  declarative Svelte and emits the canonical Graph IR (JSON) — for onboarding
  hand-written documents, importing from other tooling, or migrating
  `.planet.svelte`-style authoring into the native store.
- **Player component.** A `Player` renders a graph from IR through the normal
  runtime (`runtime-cpu` / `runtime-webgpu`). Pointed at *exported* bounded Svelte,
  it parses → IR → renders, which **verifies the export round-trips**: the player's
  output should match the source graph's. The same component doubles as the
  embeddable "run this graph" surface for sharing / WebGPUToy.

So import is a **conversion + verification** tool, not a live-editing obligation;
the only path that executes authored Svelte is the optional live-document mode
above.

### Keeping text views stable

Because text views are regenerated from the IR, the IR→markup and IR→WGSL printers
must be **deterministic and stable** (sorted output, fixed formatting) so a small
IR change yields a small text diff — not a whole-document churn that destroys cursor
position and review diffs. Prefer source-mapped, node-scoped regeneration over
reprinting the entire document on every edit.

## UI implementation (SvelteKit app)

The editor's *model* is framework-agnostic (it edits the Graph IR); its *app* is
SvelteKit and should reuse what the repo already has.

**Layout.** Use `@virtual-planet/subdivide` (Blender-style resizable panes) to
organize the display area into zones — graph canvas, inspector, `CodeView` /
`MarkupView`, and the live preview / `Player`. The existing scene editor is a
working reference for shell + panel chrome and may be ported as needed:
`SceneEditorShell.svelte`, the collapsible `EditorSuperSection` /
`EditorParamSection` / `EditorSubsection` sections, `EditorVerticalTabs`, and
`layoutStorage.ts` for persisting the pane layout.

**Preview panel = viewer + transport + interaction surface.** Once the graph drives
multiple render targets (a pass graph), the preview is not "the output" but a *viewer*
over the targets: it **selects which output buffer to display** (with a per-buffer
visualization mode for non-color data), owns the **playback transport**
(play/pause/scrub/reset → the per-preview playback context), and is the **normalized
interaction surface** — pointer/keys originate here, in normalized display space,
**independent of which buffer is shown**, and feed the whole pass graph. See
[inputs-cpu-and-resources.md → host-input binding contexts / interaction surface](./inputs-cpu-and-resources.md#interaction-surface--normalized-display-decoupled).

**Graph canvas — adopt a library behind a thin adapter; don't roll the canvas
from scratch.** Pan/zoom, edge routing, handles, hit-testing, and a minimap are a
lot of undifferentiated work. Default candidate: **Svelte Flow (`@xyflow/svelte`)**
— the xyflow team's Svelte-native, well-maintained node editor that supplies
exactly those primitives and lets us render **our** schema-driven nodes in custom
node slots. Wrap it behind our own adapter so:

- the **Typed Graph IR stays canonical** — the library renders from the IR and
  emits edit intents that become IR patches; it never owns the model;
- it is **swappable** — rolling our own, or moving to another engine (e.g. Svelvet,
  or a framework-agnostic core like Rete.js with a Svelte wrapper), stays a local
  change behind the adapter.

So the generic components above (`GraphCanvas`, `ConnectionLayer`, `MiniMap`,
`PortView`) become thin wrappers over the chosen library rather than from-scratch
implementations. The library dependency lives only in `graph-editor` / the app —
`graph`, `compiler`, and the runtimes stay framework- and library-agnostic. Confirm
the library's current maintenance, license, and Svelte 5 support at adoption (M9).
