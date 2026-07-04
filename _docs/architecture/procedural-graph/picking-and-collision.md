# Picking and collision (graph consumers)

**Status:** architecture spec (proposed) · **Scope:** procedural mesh/field ray pick, terrain
heightfield collision, and host egress of hit/contact events. Part of the
[Procedural Graph System](./README.md).

## Summary

Picking and collision must use the **same surface/position subgraph** as rendering and
mesh generation — one conceptual terrain function for visible geometry, walk height, and
pick rays ([`virtual_planet_architecture_plan.md`](../../specs/virtual_planet_architecture_plan.md)
§11).

This spec defines **vertical slices and phases** for:

1. **Pick consumer** — Mode A: `spatial.rayField`; Mode B: `spatial.ray` + `ConsumerProfile: pick.event`
2. **Heightfield** — `spatial.buildHeightfield` + `spatial.sampleHeight` (block + event)
3. **Host inputs** — pointer ray, camera (`interaction` context on existing `HostBinding`)
4. **Egress** — `signal<SpatialHit>`, `stream<ContactEvent>`, `signal<ResourceRevision>` via
   [stream-graphs.md](./stream-graphs.md) host egress (not bulk geometry on signals)

Canonical types and signal delivery: [cpu-elemental-model.md](./cpu-elemental-model.md).

Streams/signals carry **hits and invalidation**; continuous foot collision **samples block
buffers** (audio/heightfield scheduling), not per-frame event streams.

## Elemental binding

Pick and heightfield: [cpu-elemental-model.md](./cpu-elemental-model.md). Mode A → **`spatial.rayField`**;
Mode B → **`spatial.ray`** (not `pick.mesh`). Heightfield: **`spatial.buildHeightfield`** /
**`spatial.sampleHeight`**. Struct **`SpatialHit`** (not `PickResult`).
This spec retains phase delivery and scene integration detail only.

## Problem

| Layer | Today |
|-------|--------|
| Planet `RenderBackend` | `renderPickingPass` stub (`pickingPass.ts`) |
| Scene orbit pick | Screen-space disc on body centers — not terrain/mesh graph |
| Mesh-gen (Mode B) | `executeMeshGen` for preview; collision/export planned, not wired |
| WebGPUToy | Mesh preview orbit; no graph pick |
| CPU runtime | `runtime-cpu` tagline mentions picking; no pick consumer |
| Host egress | Preview polls RAF/`refreshEpoch`; no `signal<SpatialHit>` |

Authors cannot click a displaced procedural mesh in the graph editor and get a stable hit
with world position/normal from the **same** `position`/`normal` ports used for preview.

## Design fit

| Concern | Graph expression |
|---------|------------------|
| Pointer / camera | `host-input` (`interaction`: `pointer.ray`, `camera.*`) |
| Same math as render | Pick consumer slices **same** `PortRef`s as `target.mesh` / vertex kernel |
| Mode A (vertex procedural) | `spatial.rayField` on same `PortRef`s as render, or GPU pick pass |
| Mode B (stored mesh) | `spatial.ray` on BVH from `spatial.buildBvh` + mesh buffers |
| Click / hover | `signal<SpatialHit>` (`latest` for hover; `interaction` context drain) |
| Async GPU readback | `future<SpatialHit>` → `signal<SpatialHit>` |
| Walk / slide | `spatial.buildHeightfield` → block tile; `spatial.sampleHeight` at `(x,z)` |
| Field rebake | `signal<ResourceRevision>` → nav / UI |
| Discrete contacts | `stream<ContactEvent>` (gameplay; optional) |

Relation to elemental surface model ([elemental-webgpu-architecture-review.md](./elemental-webgpu-architecture-review.md)):
stored mesh generation, CPU sampling, bounds, and collision are **compositions** over the
same mapping subgraph — not separate engine subsystems.

## Mode A vs Mode B

| | Mode A — vertex procedural | Mode B — mesh generation |
|--|---------------------------|--------------------------|
| **Planet / patches** | Instance grid + vertex kernel | Optional bake for export |
| **WebGPUToy preview** | GPU field / fragment path | `target.mesh` + `executeMeshGen` ✅ |
| **Pick** | `spatial.rayField` (CPU analytic march) or GPU pick pass | `spatial.ray` on BVH from `executeMeshGen` |
| **Continuous collision** | Sample planet kernel or local heightfield bake from same graph | `spatial.sampleHeight` on baked heightfield |

Do not mix pick math across modes without documenting which `position` source is authoritative.

## Result types

Canonical struct: **`SpatialHit`** ([cpu-elemental-model.md](./cpu-elemental-model.md) struct catalog).

```ts
SpatialHit {
  hit: bool
  worldPos: vec3f
  normal: vec3f
  depth: f32
  uv: vec2f
  faceId: u32      // cube-face sweep, patch id, etc.
  triangleId: u32   // Mode B
  materialId: u32  // optional
}

ContactEvent {  // alias: SpatialContact in ADR index
  bodyId: u32
  point: vec3f
  normal: vec3f
  penetration: f32
}
```

`PickResult` is deprecated — codegen may alias one release.

Semantics tags: `semantics: ['pick:hit']`, `['collision:contact']`.

## Consumers

### Pick event consumer (`ConsumerProfile: pick.event`)

Wires **Mode-specific spatial primitive** — not a separate `pick.mesh` primitive kind.

| Mode | Primitive | Required inputs |
|------|-----------|-----------------|
| **A** (field / procedural) | `spatial.rayField` | `PortRef` position (+ optional normal), `host-input` ray |
| **B** (mesh-gen) | `spatial.ray` | `spatial.bvh` from `spatial.buildBvh`, `host-input` ray |

**Mode B inputs:**

| Port / binding | Source |
|----------------|--------|
| `bvh` | `spatial.bvh` from `spatial.buildBvh` on mesh `revision` |
| `ray.origin`, `ray.direction` | `host-input` `interaction` |

**Mode A inputs:**

| Port / binding | Source |
|----------------|--------|
| `position` | `PortRef` — same as mesh preview / vertex kernel |
| `normal` | optional `PortRef` |
| `ray.origin`, `ray.direction` | `host-input` `interaction` |
| `tessellation` | grid size for analytic march resolution |

**Outputs:**

| Port | Type | Egress |
|------|------|--------|
| `hit` | `SpatialHit` struct | `signal.emit` on pointer up or throttled hover |
| `hits` (optional) | `stream<SpatialHit>` | brush / multi-select tools |

**CPU analytic path (Mode A):** `spatial.rayField` — ray march + bisect on scalar field / position
along ray (same agreement rule as colorlab `picking.ts` vs renderer). Headless-testable.

**GPU path (Mode A/B):** offscreen pass encoding linear depth + ids; readback → `future<SpatialHit>` →
`signal<SpatialHit>` (see deferred `RenderBackend.renderPickingPass`).

### Heightfield (`spatial.buildHeightfield`)

Compute/event consumer — writes a **block resource** `buffer<f32>` (or `texture`) tile:

- R: height meters
- G/B: normal xz or material id (packing TBD)

Params: `center`, `sizeMeters`, `resolution`, `updateThreshold`.

On successful bake → `signal<ResourceRevision>`.

### Height sample (`spatial.sampleHeight`)

Sync sample at world `(x, z)` from `spatial.heightfield` → height + normal.
Used every simulation step for walking — **not** streamed. Runs under block or event executor
depending on wiring.

## Host integration

### WebGPUToy / graph-editor

```
pointer down/up on MeshPreviewPanel
  → bind host.pointer ray from preview camera
  → pick.event consumer → spatial.rayField (Mode A) or spatial.ray (Mode B)
  → signal<SpatialHit> key 'pick'  (interaction context: immediate / latest)
  → inspector shows hit uv / world pos; optional gizmo
```

Works with [preview-monitors.md](./preview-monitors.md): monitor `hit` port or subscribe
to `pick` signal — no `target.*` ghost node.

### Scene editor (`/scene`)

- Short term: keep orbit body disc pick for solar-system bodies.
- Terrain/mesh graph pick: embed pick consumer over planet surface subgraph when Mode A/B
  graphs are scene-bound ([editor-and-scene-integration.md](./editor-and-scene-integration.md)).
- Walk collision: `spatial.buildHeightfield` + `spatial.sampleHeight` — aligns with architecture
  plan §11.2; async readback acceptable for pick, **not** for per-frame foot placement.

## Egress patterns

| Need | Abstraction |
|------|-------------|
| Click select | `signal<SpatialHit>` on pointer up |
| Hover highlight | `signal<SpatialHit>` mode `latest` + throttle |
| GPU readback latency | `async.spawn(readback)` → `await` → `signal` |
| Nav mesh rebuild | `signal<ResourceRevision>` |
| Physics manifold | `stream<ContactEvent>` |
| Per-frame foot IK | **block sample** via `spatial.sampleHeight` — not stream |

Do **not** stream tessellated triangles; mesh stays typed `geometry.mesh` resource / GPU buffers.

## Packages

| Package | Role |
|---------|------|
| `graph` | `SpatialHit` struct, spatial primitive registration |
| `runtime-cpu` | CPU ray march pick, heightfield sample |
| `runtime-webgpu` | GPU pick pass, mesh buffer pick, heightfield compute bake |
| `graph-editor` | Mesh preview click → pick consumer; `HostSignalSubscription` |
| `apps/scene-editor` | Planet pick + walk collision integration (later wave) |

## Non-goals (this spec)

- Replacing orbit body picking for distant spheres (separate concern)
- Streaming every height sample per frame
- Pick without graph/renderer parity (different subgraph than render)
- Full physics engine in the graph (only contact **events** as optional stream egress)

## Phased delivery

Requires ADR **E0** accepted, then **E1→E3→E5** for types, executors, spatial primitives.

### Phase A — CPU pick on mesh-gen (WebGPUToy, Mode B)

- `spatial.buildBvh` + `spatial.ray` over `executeMeshGen` buffers (Mode B)
- `host.pointer` bindings in mesh preview
- `signal<SpatialHit>` → inspector readout
- Headless: ray hits known sphere mesh → expected `SpatialHit`

### Phase B — Field / analytic pick + hover (Mode A)

- `spatial.rayField` on scalar/position field (field graphs)
- Throttled hover `signal` mode `latest` (`interaction` context)
- Integrate `sink.host` from stream-graphs Phase C

### Phase C — GPU pick pass (planet)

- Implement `renderPickingPass` encoding ids + depth
- `future` readback → `signal<SpatialHit>`
- Patch/face id decoding

### Phase D — Heightfield collision tile

- `spatial.buildHeightfield` compute consumer
- `spatial.sampleHeight` + `signal<ResourceRevision>`
- Scene-editor walk sampler (deferred rendering gate per `AGENTS.md`)

## Test gates

1. Headless: pick ray → known `SpatialHit` on synthetic mesh-gen graph
2. Pick uses same `position` port as `target.mesh` preview (regression)
3. Miss returns `hit: false` without throw
4. `signal` handler fires once per click (interaction drain), not per RAF poll
5. `spatial.sampleHeight` rejects `spatial.bvh` at plan time; `spatial.ray` rejects unwired BVH
6. `check` + `test` green for touched packages

## Related docs

- [cpu-elemental-model.md](./cpu-elemental-model.md) — typed spatial primitives, signal runtime, executors
- [spec-consolidation-2026-07.md](./spec-consolidation-2026-07.md) — before→after mapping
- [stream-graphs.md](./stream-graphs.md) — `signal<T>`, `sink.host`, subscriptions
- [preview-monitors.md](./preview-monitors.md) — debug observe pick port
- [briefs/M-mesh-gen-consumer.md](./briefs/M-mesh-gen-consumer.md) — Mode B scope (preview/collision/export)
- [inputs-cpu-and-resources.md](./inputs-cpu-and-resources.md) — CPU runtime services
- [`virtual_planet_architecture_plan.md`](../../specs/virtual_planet_architecture_plan.md) §10–11 — GPU passes, pick, heightfield

## Open questions

1. **Pick on Mode A GPU mesh preview** before full pick pass: CPU tessellate at pick resolution only?
2. **Double precision** planet picks: ECEF pick in CPU only for scene scale?
3. **Promote pick result** to graph output vs ephemeral signal only?
4. **Heightfield format** shared with vegetation coverage masks?
