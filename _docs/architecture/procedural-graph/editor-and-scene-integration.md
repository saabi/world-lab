# Graph editor scope & scene-tree integration

**Status:** architecture decision · **Authority:** canonical for what
`packages/graph-editor` owns vs. the scene tree editor, and how the two integrate
in host apps. Part of the [Procedural Graph System](./README.md).

> **For agents:** When a task touches scene tree UI, graph editor features, body
> → graph linking, or "unifying" the planet/scene editors, **read this document
> first**. Do not add scene-tree editing to `packages/graph-editor` without
> updating this record and its rationale. Integration belongs in **host app
> composition**, not package fusion.

---

## Decision (summary)

**Do not add scene-tree support to `packages/graph-editor`.**

The graph editor edits **field graphs** (`GraphDocument` IR) only. The scene tree
editor edits **hierarchy** (`SceneNode` tree — bodies, orbits, lights, transforms)
separately. A full planet or solar system is authored by **composing both** in the
host app (`fe/`, `/scene`), linked by **document references**, not by merging IRs
into one canvas or one package.

| Action | Verdict |
|--------|---------|
| Scene outliner inside `packages/graph-editor` | **No** |
| One canvas mixing scene nodes and field nodes | **No** |
| Body → graph document linking in scene/body schema | **Yes** |
| Embedded `<GraphEditor>` when a body is selected | **Yes** (host app) |
| Shared layout + inspector chrome (`subdivide`, section components) | **Yes** |
| Standalone `apps/graph-editor` without scene concepts | **Yes** (required) |

---

## Two editors, two IRs

| | **Procedural graph editor** | **Scene tree editor** |
|--|------------------------------|------------------------|
| **Package** | `packages/graph-editor`, `apps/graph-editor` | `fe/` scene modules, `/scene/[...path]` |
| **IR** | `GraphDocument` — nodes, typed ports, edges, outputs, consumers | `SceneNode` tree — bodies, orbits, lights, transforms |
| **Metaphor** | Dataflow graph | Hierarchy; URL mirrors tree path |
| **Question** | *What is this body made of?* | *Where is it, what orbits what, who lights whom?* |
| **Routing** | Graph document id in document store | [`scene-routing.md`](../../specs/scene-routing.md) — path segment ⟺ node |

These are **different invariants**. Field edges carry data types and coordinate
spaces; scene relationships are parent/child, orbit nodes, and light `affects`
scoping. One combined canvas would mix incompatible connection semantics and
validation rules.

See [editor.md](./editor.md) (graph editor scope) and
[solar-system-model.md](../../specs/solar-system-model.md) (celestial hierarchy).

---

## What the graph editor owns

From [editor.md](./editor.md):

- Visualization and editing of **Typed Graph IR** only.
- Schema-driven palette, inspector, port validation, serialization.
- Standalone app for primitive testing, compilation debugging, WebGPUToy — **no
  planet renderer or scene tree required**.
- Embeddable `<GraphEditor bind:graph />` — generic; host supplies context.

The graph editor **must not** contain Virtual-Planet-specific rendering logic or
scene-tree models. That keeps the generic core shippable headlessly and avoids
coupling compiler milestones to solar-system UI.

---

## What the scene editor owns

- Scene tree outliner (`SystemTreePanel` and successors).
- Path-addressed node editors dispatched by `kind` (body, orbit, light, …).
- Per-body appearance/physics forms via kind-schema (today's
  `PlanetParameters` → future `CelestialBody`).
- Selective illumination, orbit hierarchy, system persistence.

Spec track: [solar-system-scene.md](../../specs/solar-system-scene.md),
[scene-routing.md](../../specs/scene-routing.md),
[scene-editor-layout.md](../../specs/scene-editor-layout.md).

---

## Recommended integration (host composition)

Integrate at the **app shell**, not inside `graph-editor`:

```
┌─────────────────┬──────────────────────────┬─────────────────┐
│ Scene outliner  │  Graph canvas            │  3D viewport    │
│ (scene IR)      │  (<GraphEditor />)       │  (runtime)      │
├─────────────────┴──────────────────────────┴─────────────────┤
│ Inspector — scene kind-schema OR graph primitive schema      │
└──────────────────────────────────────────────────────────────┘
```

**Layout:** `@virtual-planet/subdivide` panes (same pattern as the scene editor).
Reuse ported chrome (`EditorVerticalTabs`, `EditorSuperSection`, …) — **shared
UI, separate models**.

**Selection flow:**

1. User selects a **body** in the scene outliner.
2. Host resolves `body.graphDocumentId` (or equivalent ref) → loads that
   `GraphDocument`.
3. Host mounts `<GraphEditor bind:graph={bodyGraph} />` in the graph pane.
4. Viewport renders using compiled slices from that graph + scene transform/lighting.

**Linking fields (not merging trees):**

```ts
// On a celestial body scene node (conceptual — exact field TBD in scene schema)
interface CelestialBodyNode {
	kind: 'celestial_body';
	graphDocumentId?: string; // procedural field graph for this body
	// params snapshot / CelestialBody — appearance scalars; may mirror graph defaults
}
```

Graph `consumers` metadata (which outputs compile for which pipeline) stays in
**graph IR** — not as scene-tree nodes. Runtime inputs that depend on scene context
(camera, parent star direction, etc.) are **graph input ports** fed by
`runtime-cpu` / host bindings, not by embedding the scene tree in the graph editor.

---

## Planet vs. solar system scope

**Full planet (terrain, tessellation, materials, vegetation, …):** supported by
this architecture — one **field graph** (+ optional **surface mapping graph**
document) per body, with tessellation **scheduling** in `runtime-webgpu`, not in
the graph canvas. See [runtime-and-tessellation.md](./runtime-and-tessellation.md)
and milestone **M13** in [implementation-plan.md](./implementation-plan.md).

**Full solar system:** supported as **scene tree + N field graphs** — not one
monolithic graph for the whole system. Each body (star, planet, moon) references
its own graph document; orbits and light scoping remain scene IR. Multi-body
procedural compositing in the shared scene pass is **scene-renderer work**
([scene-procedural-rendering.md](../../specs/scene-procedural-rendering.md)),
orthogonal to graph-editor scope.

---

## What we explicitly do not build

- Scene outliner, orbit editor, or body hierarchy inside `packages/graph-editor`
- A unified canvas where scene nodes and field nodes share one edge type
- Scene path routing or URL logic inside `apps/graph-editor`
- Duplicating `SystemTreePanel` / `scenePath.ts` in the graph-editor package
- Requiring scene context to open or test graphs in the standalone editor

---

## Standalone app stays scene-free

`apps/graph-editor` must remain usable **without** loading a scene, planet
renderer, or solar-system preset — for:

- Primitive development and CPU preview on a plane
- Compiler/linker debugging and WGSL inspection
- WebGPUToy / MCP headless graph editing
- CI and agent workflows that only touch `GraphDocument` JSON

Scene integration is a **host concern** (`fe/` embed mode, `/scene` route), not a
dependency of the graph-editor package.

## Implementation status (interim — as of M9–M10)

The standalone editor is currently hosted as a **scene-free route in the planet
app** (`fe/src/routes/graph-editor`), **not yet** a separate `apps/graph-editor`
workspace. This satisfies the ADR's *functional* requirement — the route and
`packages/graph-editor` import **only** `@virtual-planet/{graph, schema, compiler,
runtime-cpu, runtime-webgpu}` (verified; **enforced** by
`packages/graph-editor/src/sceneFree.test.ts`) — but defers the
**standalone-deployable** goal (independent build, headless CI, WebGPUToy without
the planet app).

**Tracked extraction:** move `fe/src/routes/graph-editor` → `apps/graph-editor`
**before the embedded-editor / collaboration work (M14/M16)** and ahead of WebGPUToy
(M17), when an independently deployable app actually pays off. Until then the
`sceneFree` guard keeps the deferral safe. See [STATUS.md](./STATUS.md) → "Known
deviations".

---

## When to revisit this decision

Re-open this record only if:

1. The product abandons separate IRs and commits to a **single studio document**
   that formally unions scene + graph — even then, prefer **two panes, two models**
   over one fused canvas unless the unified schema is specced end-to-end.
2. A concrete user workflow proves host composition is unusable (measure before
   merging packages).
3. WebGPUToy is cancelled and graph-editor becomes planet-only **and** the team
   explicitly accepts losing standalone/generic scope — document the tradeoff here
   first.

Adding "scene awareness" for **runtime binding** (e.g. graph inputs fed from parent
star) does **not** require scene tree UI in graph-editor — solve with port types +
host-injected inputs per [inputs-cpu-and-resources.md](./inputs-cpu-and-resources.md).

---

## Related docs

| Doc | Relationship |
|-----|--------------|
| [editor.md](./editor.md) | Graph editor features and UI plan |
| [wgsl-parsing-and-codegen.md](./wgsl-parsing-and-codegen.md) | Compiler output policy (separate ADR) |
| [runtime-and-tessellation.md](./runtime-and-tessellation.md) | Tessellation scheduling vs. graph-described surfaces |
| [scene-routing.md](../../specs/scene-routing.md) | URL ⟺ scene tree invariant |
| [solar-system-model.md](../../specs/solar-system-model.md) | Per-body procedural params + hierarchy |
| [scene-editor-layout.md](../../specs/scene-editor-layout.md) | Scene shell panes (reference for host layout) |
| [execution-and-delegation.md](./execution-and-delegation.md) | Contract-first workflow |

---

## Change log

| Date | Change |
|------|--------|
| 2026-06-24 | Initial record: graph-editor owns field graphs only; scene tree stays in scene modules; host composition + document refs |
