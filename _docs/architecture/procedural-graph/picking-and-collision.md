# Picking and collision (graph consumers)

**Status:** architecture spec (proposed) · **Scope:** procedural mesh/field ray pick, terrain
heightfield collision, and host egress of hit/contact events. Part of the
[Procedural Graph System](./README.md).

## Summary

Picking and collision must use the **same surface/position subgraph** as rendering and
mesh generation — one conceptual terrain function for visible geometry, walk height, and
pick rays ([`virtual_planet_architecture_plan.md`](../../specs/virtual_planet_architecture_plan.md)
§11).

This spec defines:

1. **Consumers** — `pick.mesh`, `collision.bakeHeightfield`, `collision.sample` (CPU and GPU paths)
2. **Host inputs** — pointer ray, camera (`interaction` context on existing `HostBinding`)
3. **Egress** — `signal<PickResult>`, `stream<ContactEvent>`, `signal<HeightfieldUpdated>` via
   [stream-graphs.md](./stream-graphs.md) host egress (not bulk geometry on signals)

Streams/signals carry **hits and invalidation**; continuous foot collision **samples block
buffers** (audio/heightfield scheduling), not per-frame event streams.

## Problem

| Layer | Today |
|-------|--------|
| Planet `RenderBackend` | `renderPickingPass` stub (`pickingPass.ts`) |
| Scene orbit pick | Screen-space disc on body centers — not terrain/mesh graph |
| Mesh-gen (Mode B) | `executeMeshGen` for preview; collision/export planned, not wired |
| WebGPUToy | Mesh preview orbit; no graph pick |
| CPU runtime | `runtime-cpu` tagline mentions picking; no graph pick consumer |
| Host egress | Preview polls RAF/`refreshEpoch`; no `signal<PickResult>` |

Authors cannot click a displaced procedural mesh in the graph editor and get a stable hit
with world position/normal from the **same** `position`/`normal` ports used for preview.

## Design fit

| Concern | Graph expression |
|---------|------------------|
| Pointer / camera | `host-input` (`interaction`: `pointer.ray`, `camera.*`) |
| Same math as render | Pick consumer slices **same** `PortRef`s as `target.mesh` / vertex kernel |
| Mode A (vertex procedural) | GPU pick pass or CPU ray march on field |
| Mode B (stored mesh) | Ray–triangle on `executeMeshGen` buffers |
| Click / hover | `signal<PickResult>` (`latest` for hover) |
| Async GPU readback | `future<PickResult>` → `signal<PickResult>` |
| Walk / slide | `collision.bakeHeightfield` → `buffer` tile; sync `sample` at `(x,z)` |
| Field rebake | `signal<HeightfieldUpdated>` → nav / UI |
| Discrete contacts | `stream<ContactEvent>` (gameplay; optional) |

Relation to elemental surface model ([elemental-webgpu-architecture-review.md](./elemental-webgpu-architecture-review.md)):
stored mesh generation, CPU sampling, bounds, and collision are **compositions** over the
same mapping subgraph — not separate engine subsystems.

## Mode A vs Mode B

| | Mode A — vertex procedural | Mode B — mesh generation |
|--|---------------------------|--------------------------|
| **Planet / patches** | Instance grid + vertex kernel | Optional bake for export |
| **WebGPUToy preview** | GPU field / fragment path | `target.mesh` + `executeMeshGen` ✅ |
| **Pick** | GPU pick pass (id, depth, bary) or CPU analytic march | Ray–mesh on generated `vertexBuffer` / `indexBuffer` |
| **Continuous collision** | Sample planet kernel or local heightfield bake from same graph | Sample baked heightfield from graph |

Do not mix pick math across modes without documenting which `position` source is authoritative.

## Result types (proposed structs)

```ts
// TypeRef structs — ids TBD in graph package
PickResult {
  hit: bool
  worldPos: vec3f
  normal: vec3f
  depth: f32
  uv: vec2f
  faceId: u32      // cube-face sweep, patch id, etc.
  triangleId: u32   // Mode B
  materialId: u32  // optional
}

ContactEvent {
  bodyId: u32
  point: vec3f
  normal: vec3f
  penetration: f32
}

HeightfieldMeta {
  center: vec3f
  sizeMeters: f32
  resolution: u32
  revision: u32
}
```

Semantics tags: `semantics: ['pick:hit']`, `['collision:contact']`.

## Consumers

### `pick.mesh` / `pick.field` (new)

Sibling to `meshGen` and stream consumer — **not** a value primitive.

**Inputs (host + graph):**

| Port / binding | Source |
|----------------|--------|
| `position` | `PortRef` — same as mesh preview |
| `normal` | optional `PortRef` |
| `ray.origin`, `ray.direction` | `host-input` `interaction` |
| `tessellation` | grid size, face count (Mode B / CPU march) |

**Outputs:**

| Port | Type | Egress |
|------|------|--------|
| `result` | `PickResult` struct | `signal.emit` on pointer up or throttled hover |
| `hits` (optional) | `stream<PickResult>` | brush / multi-select tools |

**CPU analytic path (v1-friendly):** ray march + bisect on scalar field / position along ray
(same agreement rule as colorlab `picking.ts` vs renderer). Headless-testable.

**GPU path:** offscreen pass encoding linear depth + ids; readback → `future<PickResult>` →
`signal<PickResult>` (see deferred `RenderBackend.renderPickingPass`).

### `collision.bakeHeightfield` (compute consumer)

Writes a **block resource** `buffer<f32>` (or `texture`) tile:

- R: height meters
- G/B: normal xz or material id (packing TBD)

Params: `center`, `sizeMeters`, `resolution`, `updateThreshold`.

On successful bake → `signal<HeightfieldUpdated>` with `HeightfieldMeta`.

### `collision.sample` (value or command)

Sync sample at world `(x, z)` from the current heightfield buffer → height + normal.
Used every simulation step for walking — **not** streamed.

## Host integration

### WebGPUToy / graph-editor

```
pointer down/up on MeshPreviewPanel
  → bind host.pointer ray from preview camera
  → pick.mesh consumer (CPU v1)
  → signal<PickResult> key 'pick'
  → inspector shows hit uv / world pos; optional gizmo
```

Works with [preview-monitors.md](./preview-monitors.md): monitor `result` port or subscribe
to `pick` signal — no `target.*` ghost node.

### Scene editor (`/scene`)

- Short term: keep orbit body disc pick for solar-system bodies.
- Terrain/mesh graph pick: embed pick consumer over planet surface subgraph when Mode A/B
  graphs are scene-bound ([editor-and-scene-integration.md](./editor-and-scene-integration.md)).
- Walk collision: local heightfield bake consumer + CPU sample — aligns with architecture
  plan §11.2; async readback acceptable for pick, **not** for per-frame foot placement.

## Egress patterns (from stream-graphs)

| Need | Abstraction |
|------|-------------|
| Click select | `signal<PickResult>` on pointer up |
| Hover highlight | `signal<PickResult>` mode `latest` + throttle |
| GPU readback latency | `async.spawn(readback)` → `await` → `signal` |
| Nav mesh rebuild | `signal<HeightfieldUpdated>` |
| Physics manifold | `stream<ContactEvent>` |
| Per-frame foot IK | **buffer sample** — not stream |

Do **not** stream tessellated triangles; mesh stays `MeshResource` / GPU buffers.

## Packages

| Package | Role |
|---------|------|
| `graph` | `PickResult` structs, `pick.*` / `collision.*` primitive registration |
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

### Phase A — CPU pick on mesh-gen (WebGPUToy)

- `pick.mesh` consumer over `executeMeshGen` buffers (Mode B)
- `host.pointer` bindings in mesh preview
- `signal<PickResult>` → inspector readout
- Headless: ray hits known sphere mesh

### Phase B — Field / analytic pick + hover

- CPU ray march on scalar/position field (field graphs)
- Throttled hover `signal` mode `latest`
- Integrate `sink.host` from stream-graphs Phase C

### Phase C — GPU pick pass (planet)

- Implement `renderPickingPass` encoding ids + depth
- `future` readback → `signal<PickResult>`
- Patch/face id decoding

### Phase D — Heightfield collision tile

- `collision.bakeHeightfield` compute consumer
- `collision.sample` + `signal<HeightfieldUpdated>`
- Scene-editor walk sampler (deferred rendering gate per `AGENTS.md`)

## Test gates

1. Headless: pick ray → known `PickResult` on synthetic mesh-gen graph
2. Pick uses same `position` port as `target.mesh` preview (regression)
3. Miss returns `hit: false` without throw
4. `signal` handler fires once per click, not per RAF poll
5. `check` + `test` green for touched packages

## Related docs

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
