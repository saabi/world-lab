# Mesh geometry, physics, and navigation

**Status:** architecture spec (proposed) · **Scope:** mesh processing primitives,
spatial acceleration, partition kinds (solid / walkable / freeSpace), physics
collider authoring, and portal-graph navigation with A* pathfinding. Part of the
[Procedural Graph System](./README.md).

## Summary

Preview, collision, export, physics, and navigation are **consumers** of the same
procedural surface / mesh pipeline ([README.md](./README.md) — not separate engine
subsystems). This spec defines **vertical slices and phases** for:

1. **Geometry transforms** — `geometry.decimate`, `geometry.boolean*`, `geometry.convexHull` (typed primitives; ADR)
2. **Spatial structures** — `spatial.buildBvh`, `spatial.buildOctree`, … (schema-typed resources)
3. **Partition kinds** — `partition.buildSolid` / `buildWalkable` / `buildFreeSpace` → collider or nav views
4. **Physics bridge** — graph-authored colliders; host rigid-body solver
5. **Navigation** — `partition.toNav` + `spatial.pathPortals`; **A\*** on portals; straight legs inside cells

Canonical types, partition rules, and primitives: [cpu-elemental-model.md](./cpu-elemental-model.md).
Heavy work uses **`future<T>`** + **`async.await`** ([stream-graphs.md](./stream-graphs.md));
invalidation uses **`signal<ResourceRevision>`** — never triangle soups on graph wires.

Ray pick and heightfield walk: [picking-and-collision.md](./picking-and-collision.md).

## Elemental binding

Partition, spatial, and geometry: [cpu-elemental-model.md](./cpu-elemental-model.md).
**Do not** build `pick.mesh`, `accel.*`, or monolithic `PartitionResource` — use typed
primitives and partition **kinds** (`solid` vs `walkable` vs `freeSpace`). This spec
covers phases, nav A\* walkthrough, and editor overlay integration only.

## Problem

| Layer | Today |
|-------|--------|
| IR | `mesh` resource type; no `polygon2d`, `collider`, `accel`, `navGraph` |
| Mesh-gen | `executeMeshGen` for preview; export/collision planned |
| Mesh ops | No decimate / boolean / hull primitives |
| Physics | No collider authoring; no host solver bind |
| Navigation | No nav graph; city/cave pathing not graph-driven |
| Accel | No BVH/octree nodes for pick or cull |

Authors cannot chain `meshGen → decimate → quasi-convex decomp → nav graph → path query`
on the same displaced surface used for rendering.

## Design principles

1. **Handles on wires** — `cpu-handle { schema }` ports; not `array<vec3>`.
2. **Revision-keyed bakes** — mesh ops and nav rebuild on `(resourceId, revision)` change.
3. **Commands + WASM** — booleans, decomposition, large decimation behind `async.spawn`.
4. **Host runs dynamics** — graph authors shapes and fields; integrator stays in Rapier/Jolt (or similar).
5. **Partition kind invariant** — solid partitions → physics only; walkable / freeSpace → nav only.
6. **Portal invariant** — inside a quasi-convex **nav cell**, actors move in straight lines (or funnel)
   **between portals**; global routes = **A\*** on portals + local legs.

## Type system extensions

See ADR `CpuResourceSchema` / `cpu-handle` for canonical wire types. Domain structs:

### Navigation structs

```ts
NavCell {
  id: u32
  partitionPart: u32   // index into partition parts (walkable / freeSpace)
  centroid: vec3f
  boundsMin, boundsMax: vec3f
  tags: u32            // walkable, water, cave, …
}

NavPortal {
  id: u32
  cellA: u32
  cellB: u32           // u32::MAX = exterior / map edge
  start, end: vec3f     // portal segment endpoints (2D: z constant; 3D: polygon support)
  width: f32
  midpoint: vec3f
  bidirectional: bool
}

// Payload behind nav.view cpu-handle — not serialized as raw arrays in GraphDocument
NavViewPayload {
  revision: u32
  cells: /* opaque buffer */
  portals: /* opaque buffer */
  portalAdjacency: /* CSR or edge list for A* */
}
```

Semantics: `['physics:convexPart']`, `['nav:cell']`, `['nav:portal']`, `['cave:chamber']`.

Runtime stores adjacency for **A\*** in CPU memory beside `nav.view`; not serialized as raw
arrays in `GraphDocument` topology.

## Geometry transform primitives

Canonical ids from ADR — each has static ports in the primitive registry:

| Primitive | Input → output |
|-----------|----------------|
| `geometry.decimate` | `geometry.mesh` → `geometry.mesh` |
| `geometry.booleanUnion` / `Subtract` / `Intersection` | mesh × 2 → mesh |
| `geometry.convexHull` | mesh → mesh |
| `geometry.convexHullCollider` | mesh → `collider.compound` |
| `geometry.repair` / `weld` / `genNormals` | mesh → mesh |
| `poly2d.fromContour` | field slice / iso → `geometry.polygon2d` |
| `mesh.fromField` | meshGen wrapper | position subgraph → mesh |

**Implicit CSG** (SDF union/subtract) stays in the **field graph** for render/pick ray march;
**mesh booleans** are the baked triangle path for export, physics, and nav.

### Example: collision proxy (solid partition)

```
target.mesh → geometry.decimate(ratio=0.15)
            → partition.buildSolid
            → partition.toCollider
            → physics.bindCollider
```

## Spatial structures

| Primitive | Role |
|-----------|------|
| `spatial.buildBvh` | `geometry.mesh` → `spatial.bvh` |
| `spatial.buildOctree` | mesh or bounds → `spatial.octree` |
| `spatial.buildGrid` | uniform / hash grid |
| `spatial.buildPatchTree` | host planet patch tree → `spatial.patchTree` |
| `spatial.ray` | `spatial.bvh` + ray → `SpatialHit` |
| `spatial.frustum` | cull / broadphase |

Integrates with [picking-and-collision.md](./picking-and-collision.md): pick consumer wires
`spatial.ray`; auto-build BVH on mesh `revision` when unwired.

**Rule:** build is **command** (amortized); query primitives are event-scoped. GPU BVH optional later;
same port contract, different `implementation.kind`.

## Partition kinds (quasi-convex decomposition)

Approximate decomposition (V-HACD / CoACD-style in 3D; convex partition with concavity budget
in 2D) — **not** exact convex decomposition.

| Primitive | Input | Output schema |
|-----------|--------|---------------|
| `partition.buildSolid` | `geometry.mesh` | `partition.solid` |
| `partition.buildWalkable` | mesh or `geometry.polygon2d` | `partition.walkable` |
| `partition.buildFreeSpace` | mesh or voxel void | `partition.freeSpace` |
| `partition.toCollider` | `partition.solid` only | `collider.compound` |
| `partition.toNav` | walkable or freeSpace only | `nav.view` |

**Params (all nav partition builds):** `maxHulls`, `maxConcavity`, `resolution`,
`minVolumePerHull`, `minPortalWidth`, **`agentRadius`** (erosion / portal clearance after decomp).

### `partition.buildFreeSpace` input contract

| Input path | Semantics |
|------------|-----------|
| **Mesh** | Oriented boundary of **traversable volume** — inward-facing normals indicate air side. Not a collision shell. Cave mesh = volume the agent occupies. |
| **Voxel** | Occupancy grid + `occupancyThreshold`, `airConnectivity` seed rules for connected free air |

Portals are clipped after **`agentRadius`** erosion so openings meet **`minPortalWidth`**.

### Intra-cell movement (quasi-convex policy)

Cells are **quasi-convex**, not strictly convex. Straight segments between portals are used only
after **line-of-sight validation** at `agentRadius` clearance (sample test along segment).
`maxConcavity` documents decomposition tolerance — do not assume strict convex guarantee without
stating the concavity budget.

### 2D vs 3D

| | 2D maps | 3D caves / props |
|--|---------|------------------|
| Source | footprint, iso contour, SVG | meshGen, import, voxel bake |
| Decomp | `partition.buildWalkable` on poly2d | `partition.buildFreeSpace` for caves; `buildSolid` for props |
| Use | districts, strategy overlays | chambers, tunnels, ship interiors |

Planet **exterior** walk: `spatial.buildHeightfield` + `spatial.sampleHeight`
([picking-and-collision.md](./picking-and-collision.md)) — not planet-scale triangle decomp.
**Interiors** and **POIs** use `nav.view` instances.

## Physics bridge

**Not in graph:** rigid-body integration, constraints, sleeping islands.

**In graph:**

| Concern | Expression |
|---------|------------|
| Collider shape | `partition.toCollider` from `partition.buildSolid` |
| Terrain | `spatial.buildHeightfield` + `spatial.sampleHeight` |
| Triggers | analytic `collider` or SDF volumes |
| Contacts | host solver → `stream<ContactEvent>` ([stream-graphs.md](./stream-graphs.md)) |
| Rebake | `signal<ResourceRevision>` |

Host syncs `collider` + `revision` into Rapier/Jolt compound colliders. Triangle mesh
colliders are last resort; quasi-convex compound is default for props and cave chunks.

## Navigation from partition kinds

### Build pipeline

**Solid and nav partitions are separate bakes** — do not decompose once and feed both physics
and nav ([cpu-elemental-model.md](./cpu-elemental-model.md) § Partition kinds).

**Props / collision:**

```
geometry.mesh → partition.buildSolid → partition.toCollider → physics.bindCollider
```

**Walkable surface (2D map or navmesh):**

```
geometry.mesh | geometry.polygon2d
    → partition.buildWalkable
    → partition.toNav                    (nav.view)
    → nav.filterWalkable                 (slope, tags — optional filter node)
```

**Caves / interiors (free air):**

```
geometry.mesh | voxel void
    → partition.buildFreeSpace
    → partition.toNav
```

Optional: `partition.align(solid, walkable)` when both describe the same authored space.

Portal extraction (inside `partition.buildWalkable` / `buildFreeSpace`):

1. One **NavCell** per quasi-convex part.
2. **Portal extraction** — adjacent parts → shared boundary segment
   (2D: shared edge clip; 3D: coplanar face patch or tunnel mouth between AABBs).
3. Drop openings narrower than `minPortalWidth`.
4. Build **portal adjacency** for A*.

Optional: `nav.linkManual` for designer chokepoints; `nav.tagCell` for cave chambers vs tunnels.

### Pathfinding: A* on portals

**Global search:**

- **Nodes:** portals (or directed portal pairs per cell).
- **Edges:** connect portals that are valid successors (share cell, or cross from `cellA` to `cellB`
  through portal `P`).
- **Cost:** Euclidean distance between portal midpoints (or custom edge weight: terrain, danger).
- **Algorithm:** **A\*** on this graph from start portal to goal portal.

**Local movement (per cell):**

- From actor position → nearest portal in current cell (straight line if inside cell).
- **Straight segment** from entry portal to exit portal after **LOS verify** at `agentRadius`
  (sample along segment; reject if clearance fails).
- Compose global portal sequence: `spatial.pathPortals` → `SpatialPath`; optional
  `spatial.pathToWaypoints` → `stream<Waypoint>`.

```
spatial.pathPortals(nav.view, start, goal)
    → A* on portal graph
    → for each portal edge: LOS-validated leg inside cell
    → SpatialPath struct on output port
    → optional: spatial.pathToWaypoints → stream<Waypoint>
    → signal<SpatialPath> on sink.host for UI overlay
```

`spatial.pathPortals` is an **event consumer** (`ConsumerProfile: nav.path`) — EventExecutor
runs A*; graph declares topology and costs, not per-frame integration.

### Leverage for maps and caves

| Feature | Mechanism |
|---------|-----------|
| Chamber ↔ tunnel layout | large cell vs thin cell; portals at connections |
| Patrol routes | repeat A* between portal midpoints |
| Reachability / fog | flood fill on cells from `nav.reachability` |
| Enter cave from surface | **handoff portal** links heightfield walk to cave `nav.view` |
| Spawn | random point in cell + exit via random portal |
| Gameplay events | `stream<PortalCrossing>` when actor crosses portal id |

**Caves:** narrow tunnels ≈ one cell, two portals; chambers ≈ one cell, many portals.
Straight-line gameplay inside each segment without per-triangle pathing.

### 2.5D / layered maps

Stack `nav.view` per floor `layerId`; vertical portals when `|Δy| ≤ stepHeight`. Sufficient
for many city and cave mezzanine cases before full 3D portal polygons.

## Egress (stream-graphs)

| Event | Channel |
|-------|---------|
| Partition / nav rebaked | `signal<ResourceRevision>` |
| Path found | `signal<SpatialPath>` or `SpatialPath` on port |
| Waypoint stream | `stream<Waypoint>` via `spatial.pathToWaypoints` |
| Unreachable goal | `signal<ErrorReport>` |
| Portal crossed | `stream<PortalCrossing>` |
| Long WASM op | `signal<BakeProgress>` |

## Editor and 3D preview (mesh preview reuse)

3D visualization of nav cells, portals, and A* results should **not** introduce a separate
viewport stack. Reuse the landed mesh preview path
([`MeshPreviewPanel.svelte`](../../../packages/graph-editor/src/MeshPreviewPanel.svelte),
`renderMeshGenPreview`, orbit camera, wireframe mode — see `M-mesh-preview-ux.md`).

### Layering model

| Layer | Source | Renderer |
|-------|--------|------------|
| **Base geometry** | Same `target.mesh` / `meshRequest` as mesh preview | `renderMeshGenPreview` (existing) |
| **Decomp cells** | Per-part hull meshes from **`partition` view** (walkable / freeSpace), not `collider.compound` | Same pass — `instanceColor` / material id per `NavCell.id` |
| **Portals** | `NavPortal` segments (small CPU struct list) | WebGPU line overlay **or** 2D canvas projected with shared `MeshPreviewCamera` |
| **A* debug path** | `stream<Waypoint>` / path query result | Polyline overlay; same camera matrices |
| **Picked cell / portal** | `signal<SpatialHit>` or nav pick | Highlight hull + portal gizmo |

The **heavy mesh** stays on the existing mesh-gen GPU path; nav debug draws only **thin
overlays** (portals, paths, labels) from compact CPU buffers — no second full mesh upload per
frame.

### Integration points

- **`PreviewZone`** — add preview family `nav` or extend `geometry` with optional
  `navOverlay?: NavDebugDraw` prop on `MeshPreviewPanel` (revision + `nav.view` handle, not
  vertex arrays by value).
- **`enumeratePreviewBuffers`** — optional buffer row when graph contains `partition.toNav` or
  `target.mesh` + nav overlay (`family: 'geometry'`, label “Nav debug”).
- **[preview-monitors.md](./preview-monitors.md)** — probe on `spatial.pathPortals` output or portal
  stream without a dedicated sink node.
- **Pick** — reuse mesh preview camera → `host.pointer` ray → `spatial.ray` in debug mode
  ([picking-and-collision.md](./picking-and-collision.md) Phase A).

### 2D vs 3D preview

- **3D caves / props:** `MeshPreviewPanel` as above (primary).
- **2D district maps:** optional top-down orthographic **mode** on the same panel (camera pitch
  locked to −90°) or separate `CpuPreviewPanel` heatmap for `polygon2d` — share `nav.view` handle,
  not geometry buffers.

### What crosses component boundaries

Pass **handles + revision** only:

```ts
interface NavDebugDraw {
  navViewId: string;
  revision: u32;
  highlightCellId?: u32;
  highlightPortalId?: u32;
  pathWaypointCount: u32;  // read from shared session store, not inline vec3[]
}
```

Portal segments and waypoints live in a **session-scoped nav debug store** (main thread);
overlay renderer reads by id — same pattern as avoiding large buffer copies across windows
(see multi-monitor output spec when written).

### UX

- Toggle: **Show nav overlay** (cells tinted by id, portals as arcs between midpoints).
- Toggle: **Show last A\*** path after `spatial.pathPortals`.
- Wireframe + cell colors compose with existing mesh preview wireframe pass.
- “Nav stale” badge when overlay `revision` ≠ baked `nav.view` revision.

## Packages

| Package | Role |
|---------|------|
| `graph` | types, structs, primitive registration |
| `runtime-cpu` | WASM geometry ops, partition builders, `spatial.pathPortals` |
| `runtime-webgpu` | meshGen input; optional GPU BVH later |
| `graph-editor` | nav debug overlay; progress signals |
| `apps/scene-editor` | planet handoff portals; actor locomotion host |
| `apps/webgputoy` | mesh pipeline proof (decimate → decomp → path on test graph) |

## Non-goals (this spec)

- Full physics engine in WGSL or value nodes
- Per-frame mesh boolean or decomp on animated graphs
- Planet-scale single `nav.view`
- Exact convex decomposition as default
- A* on every triangle (use portal graph after decomp)
- Streaming vertex buffers on `stream<T>`

## Phased delivery

Requires ADR **E0** accepted, then **E1→E5** as noted. Phases below use canonical primitive ids.

### Phase A — Geometry ops + convex hull

- `geometry.decimate`, `geometry.convexHull` (WASM)
- `collider.compound` resource + `revision`
- Headless: hull encloses test mesh

### Phase B — Solid partition (3D + 2D walkable)

- `partition.buildSolid`, `partition.buildWalkable`
- `partition.toCollider`, `async.spawn` for large inputs
- `physics.bindCollider` stub in webgputoy
- Plan-time rejection: `toNav` on solid partition

### Phase C — Nav view + A*

- `partition.buildFreeSpace` (caves) with input contract + LOS gates
- `partition.toNav`, `spatial.pathPortals`, `spatial.pathToWaypoints`
- `signal<SpatialPath>` / `stream<Waypoint>` egress
- **3D debug:** `MeshPreviewPanel` nav overlay (portals + path polyline; per-cell hull tint)
- Visual: cave test mesh, click goal, path overlay in mesh preview

### Phase D — Scene integration

- Heightfield ↔ nav handoff portals
- `stream<PortalCrossing>` to gameplay
- `spatial.buildBvh` wired to `spatial.ray` pick path

### Phase E — Booleans + advanced geometry ops

- `geometry.boolean*`, repair, UV ops
- Optional geometry preview monitors

## Test gates

1. Solid decomp: N parts within `maxHulls`; each part convex; `toNav` rejected at plan time
2. Walkable decomp: portals between adjacent cells ≥ `minPortalWidth`
3. FreeSpace: cave mesh → nav portals do not pass through solid-only hulls
4. A*: known 3-cell graph → optimal portal sequence via `spatial.pathPortals`
5. Intra-cell leg: LOS-validated straight segment between two portals at `agentRadius` clearance
6. `revision` bump invalidates `nav.view` until rebake
7. `check` + `test` green for touched packages

## Related docs

- [cpu-elemental-model.md](./cpu-elemental-model.md) — partition kinds, typed spatial/geometry primitives
- [spec-consolidation-2026-07.md](./spec-consolidation-2026-07.md) — consolidation memo
- [picking-and-collision.md](./picking-and-collision.md) — ray pick, heightfield
- [stream-graphs.md](./stream-graphs.md) — `future`, `signal`, `stream<Waypoint>`
- [inputs-cpu-and-resources.md](./inputs-cpu-and-resources.md) — CPU consumers, mesh resources
- [briefs/M-mesh-gen-consumer.md](./briefs/M-mesh-gen-consumer.md) — Mode B meshGen
- [preview-monitors.md](./preview-monitors.md) — probe nav ports without sink nodes
- [briefs/M-mesh-preview-ux.md](./briefs/M-mesh-preview-ux.md) — orbit camera, wireframe (base 3D viewport)
- [`city-generation-plan.md`](../../specs/city-generation-plan.md) — spatial / facility context
- [`virtual_planet_architecture_plan.md`](../../specs/virtual_planet_architecture_plan.md) §11 — shared terrain function

## Open questions

1. **Portal graph nodes:** portals only vs (cell, portal) pairs for A* start/goal inside cell?
2. **WASM library:** CoACD vs V-HACD vs meshoptimizer bundle size budget?
3. **Nav view persistence:** scene document resource vs derived from graph each load?
4. ~~**LOS verify** inside quasi-convex cell~~ → **Resolved:** required LOS at `agentRadius`; see § Intra-cell movement
