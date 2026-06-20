# Scene routing — the URL is the scene-tree path

**Status:** proposal (design pinned; implementation pending) · **Scope:** new
`routes/scene/[...path]`, a `scene/scenePath.ts` resolver, a node-type → editor
registry, plus a model refinement (orbit-as-node). **Supersedes** the ad-hoc
`/system` route. Related: [solar-system-model.md](solar-system-model.md),
[solar-system-scene.md](solar-system-scene.md).

## Decision

Route the editor by **mirroring the scene tree**, not by typed per-level routes. A
single catch-all `routes/scene/[...path]/+page.svelte` resolves the path to a node
and renders the editor **dispatched by that node's type**.

```
/scene/milky-way                                  → galaxy group  → galaxy/system map
/scene/milky-way/mw-sol-orbit/sol                 → star body     → body editor
/scene/milky-way/mw-sol-orbit/sol/sol-terra-orbit → orbit node    → orbit editor
/scene/.../sol-terra-orbit/terra/moon-terra-orbit/moon → moon body → body editor
```

### The invariant: route segment ⟺ scene node (1:1)
Every path segment is a real node; every node is addressable. Nothing in the URL
that isn't a node, nothing in the tree that can't be linked to. **This includes
transform/orbit nodes** — they are nodes, so they are segments.

Rejected alternative — typed segments (`/galaxy/{g}/system/{s}/planet/{p}/…`):
encodes the hierarchy's shape twice (route tree + scene tree = two sources of truth),
is combinatorial in relationships (barycentres, rings, sub-moons, ships), and can't
express transform nodes as segments. Option 2 is one source of truth, arbitrary
depth, zero new routes per type.

## Model refinement: orbit-as-node (not orbit-as-component)

To satisfy the invariant, an orbit/transform is its **own node** between parent and
child body — not a field on the body. (This replaces the `orbit?` component shipped
in `solar-system-scene.md`.)

```
galaxy(group) → orbit(node) → star(body) → orbit(node) → planet(body) → orbit(node) → moon(body)
```

- **Orbit node** (`kind: 'orbit'`, or a `transform` kind with optional orbit):
  carries `OrbitElements`; its `transform.position` = `orbitLocalPosition(elements,
  t)` each frame. Addressable/editable on its own (orbit editor).
- **Body node**: carries appearance/physics + its **own spin** (rotation); sits at
  its orbit node's origin. No `orbit` field anymore.
- **Static placement** (root, a system-center star): no orbit node needed — direct
  child, or an identity transform node only where intent warrants. Insert transform
  nodes only where there's real motion/structure, to bound tree depth.

**Why** (recorded for posterity): first-class addressable orbits, clean
motion/appearance separation, free composition (co-orbiting ships, Lagrange markers,
barycentres/binary stars), and uniform routing. **Cost:** ~2× nodes + tree depth
(mitigated by inlining/collapsing orbit rows in the tree UI) and migrating the
orbit-component code.

## Path scheme

- Segments are **node-name slugs** (lowercase, spaces→`-`), readable
  (`/scene/sol/ferro/luna-f`).
- **Unique within a parent** (enforced in the editor on rename/add); on collision,
  append a short id suffix. The full path is therefore unambiguous.
- Resolution is **per-parent**: walk segments from the root, matching each against
  the current node's children. Ids remain the stable internal identity; slugs are
  the URL projection.

## Resolver contract (`scene/scenePath.ts`, pure + tested)

```ts
slugify(name): string
pathOf(scene, nodeId): string[] | null          // node → segments (links, breadcrumbs)
resolvePath(scene, segments): SceneNode | null  // segments → node (404 on miss)
```

Pure functions over `PlanetScene` — unit-tested like the rest of `scene/`.

## Type-dispatch registry

`+page.svelte` (or its `load`) resolves the node, then selects the editor by kind /
bodyType:

| Node | View |
|------|------|
| `group` (galaxy / system / barycentre) | system/galaxy map (`SystemMapPanel`) |
| `body` (`star`/`planet`/`gas_giant`/`moon`) | body editor |
| `orbit` / `transform` | orbit editor (elements: a, e, period, phase, periapsis) |
| `*_light` | light editor |

One centralized switch; new node types add a registry entry, not a route.

## Tree & breadcrumbs

- The `SystemTreePanel` gains **selection→navigation** (selecting routes to the
  node's path) and a **breadcrumb** from `pathOf`.
- **Orbit-node noise**: render orbit nodes as thin/inlined rows under their body (or
  a collapse toggle), so the tree reads as bodies while the route still threads the
  orbit segments.

## Persistence implication (now near-term)

Path-driven routing means a deep link / refresh on `/scene/sol/ferro` must
**resolve against a loaded scene**. So scene persistence (a loadable system document,
not just the in-memory toy preset) stops being optional — it becomes a prerequisite
for deep-linking. Scope: persist the scene tree (bodies + orbit nodes + clock) under
a system id; `/scene/[...path]` loads it before resolving.

## `/planet` (legacy) + dependency rule

`/planet` stays the standalone legacy per-body editor (untouched, functional). The
body-editor *view* dispatched at `/scene/…/{body}` either reuses or forks the
`/planet` editor — same rule as before (keep `/planet` compatible, or fork a
`/system`/`/scene` copy). That view ultimately needs **per-body `params`**
(`CelestialBody`), which don't exist yet — until then the dispatch can open the
legacy editor as a stub (as the current `/system` "Edit" link does).

## Driver / binding dataflow (Blender-style)

Rather than baking primitives (orbit, spin) into nodes, computation lives in **driver
nodes** with named outputs, **wired into fields by paths** — plus a **constraint
stack** for limiters. Fundamental composable transform nodes stay dumb; the dataflow
does the work. One mechanism subsumes orbits (kepler driver → `phase`/`radius` wired
to a rotate + translate node), barycenters / reflex wobble (sum drivers over
referenced positions), and inclined axes (a `limit rotation` constraint).

- **Driven fields.** A field is a literal or a binding `{ field, ref: <path>, output }`.
- **Driver nodes.** `node.driver` exposes `evaluate(t, inputs) → { named outputs }`.
- **Evaluation.** `scene/driver.ts::evaluateScene(scene, t)`: existing transform
  drivers (advanceScene) → evaluate every driver's outputs → resolve each node's
  bindings into its transform. Phase-1 drivers depend only on `t` (no ordering);
  driver→driver/node refs (sum/reflex) add topological eval later, reusing the path
  cycle guard.
- **Constraints** *(phase 2)*: a per-node modifier stack applied after the base
  transform — `limit rotation` (X/Y/Z toggles + ranges), later copy/track/etc.

Phasing: **(1) ✅** field bindings + kepler driver + `evaluateScene` (an eccentric
orbit is now a *wiring* of composable nodes, proven in `driver.test.ts`).
**(2)** constraint stack + `limit rotation`. **(3)** sum/reflex drivers (barycenter,
star wobble, binaries) + the wiring UI; migrate the toy orbits + map onto drivers.

## Phasing

1. **Orbit-as-node migration** — add the orbit node kind; move `OrbitElements` off
   the body onto it; update `advanceScene`, the toy preset, the system map's path
   drawing, and tests. (Prerequisite; do before the model spreads further.)
2. **Resolver + registry** — `scenePath.ts` (tested) + the `/scene/[...path]` route
   with type-dispatch; fold `/system` into it (galaxy/system group → map). Tree gains
   selection→navigation + breadcrumbs.
3. **Scene persistence** — loadable system documents so deep links resolve on refresh.
4. **Per-body params + the body-editor view** — the `CelestialBody` model; the
   dispatched body editor (reuse/fork `/planet`); replaces the edit stub.

Start with (1): it's the model correction the rest depends on, and it's pure-`lib/`
+ tested.
