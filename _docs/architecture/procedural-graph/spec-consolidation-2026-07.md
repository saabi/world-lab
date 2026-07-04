# Spec consolidation review (2026-07)

**Status:** analysis memo (frozen) · **Date:** 2026-07-03 · **Scope:** duplication findings
and generalization opportunities across CPU/stream/mesh/nav/preview specs written in the
2026-07-03 design session.

> **Do not edit this memo** for ongoing rule changes — update
> [cpu-elemental-model.md](./cpu-elemental-model.md) instead. Add a new dated memo if you
> re-review (`spec-consolidation-YYYY-MM.md`).

## Specs reviewed

| Document | Role |
|----------|------|
| [stream-graphs.md](./stream-graphs.md) | streams, futures, signals, async, host egress |
| [audio-graphs.md](./audio-graphs.md) | block consumer, playback host inputs |
| [preview-monitors.md](./preview-monitors.md) | editor probes, non-execution observation |
| [picking-and-collision.md](./picking-and-collision.md) | pick, heightfield, signals |
| [mesh-geometry-and-navigation.md](./mesh-geometry-and-navigation.md) | mesh ops, accel, decomp, nav A* |

Also considered: multi-window / `PresentationSurface` (discussed, not yet spec'd).

## Canonical ADR created

All extracted patterns live in **[cpu-elemental-model.md](./cpu-elemental-model.md)**.

## Key duplication findings

### 1. Temporal scheduling (five names, one concept)

Specs used: block (audio), stream, sample (`evalGraph`), event (pick), frame (preview),
revision-keyed bake (mesh/nav).

**Resolution:** `ScheduleMode` enum + `ConsumerProfile` registry in ADR.

### 2. Host ingress vs egress

`host-input` existed; egress scattered as `signal`, `sink.host`, ad hoc pick/invalidation.

**Resolution:** symmetric `HostPortBinding` with `direction: 'in' | 'out'`.

### 3. Opaque resource proliferation

Separate proposals: `mesh`, `polygon2d`, `collider`, `accel`, `navGraph`, each with revision.

**Resolution:** `opaque { family }` + shared revision discipline.

### 4. Partition pipeline duplicated (physics + nav)

`mesh.decomposeQuasiConvex` → collider **and** `nav.fromDecomp` + `nav.extractPortals` rebuild
the same adjacency.

**Resolution:** `PartitionResource` + `partition.build` once; `toCollider` / `toNav` views.

### 5. Spatial structures fragmented

`accel.buildBvh`, `accel.buildOctree`, `collision.bakeHeightfield`, `nav.reachability`,
`pick.mesh` as separate silos.

**Resolution:** `spatial.build` + `spatial.query` with op param; pick/nav are query consumers.

### 6. Many executors vs one planner

stream consumer, audio block consumer, pick.mesh, nav.pathQuery, meshGen each described
independently.

**Resolution:** `ConsumerProfile` table; one CPU planner with hazards (F2 lifetime on CPU).

### 7. Sink vs observe vs export

`target.*`, `sink.host`, `sink.preview.table`, monitors, `doc.outputs` — overlapping roles.

**Resolution:** sink **families** (render / egress / export / bind); **observe** = editor chrome only.

### 8. Presentation handles multiplied

`PreviewProbe`, `HostSignalSubscription`, `NavDebugDraw`, future pop-out surfaces.

**Resolution:** `SessionPresentation` in graph-editor (not IR).

### 9. Struct silos

`PickResult`, `NavPortal`, `ContactEvent`, `HeightfieldMeta`, `Progress`, … per spec.

**Resolution:** struct catalog index in ADR; `SpatialHit`, `SpatialPath`, `ResourceRevision`.

## Before → after mapping

| Before (domain spec) | After (elemental) |
|----------------------|-------------------|
| `stream` + `future` + `signal` types | ADR `TypeRef` extensions |
| `async.spawn` / `awaitAll` | ADR async family (unchanged ids) |
| `sink.host` + subscription modes | ADR host ports + `DeliveryPolicy` |
| audio block consumer | `ConsumerProfile: audio.block` |
| stream consumer | `ConsumerProfile: stream.main` |
| `pick.mesh` | `ConsumerProfile: pick.event` + `spatial.query(ray)` |
| `collision.bakeHeightfield` | `spatial.build(heightfield)` |
| `collision.sample` | `spatial.query(sampleHeight)` |
| `accel.buildBvh` / `buildOctree` | `spatial.build(bvh \| octree)` |
| `accel.rayQuery` | `spatial.query(ray)` |
| `mesh.decomposeQuasiConvex` | `partition.build` |
| `collider.compound` | `partition.toCollider` |
| `nav.fromDecomp` + `extractPortals` | `partition.build` (portals inside) + `partition.toNav` |
| `nav.pathQuery` (A*) | `spatial.query(path)` on portal graph |
| `mesh.decimate`, `boolean*`, `hull` | `geometry.transform { op }` |
| `PreviewProbe` | `SessionPresentation.observations` |
| nav debug overlay | `SessionPresentation.overlays` |
| `signal<NavGraphUpdated>` etc. | `signal<ResourceRevision>` or typed alias |

## Domain spec alignment status

| Spec | Status | Notes |
|------|--------|-------|
| [cpu-elemental-model.md](./cpu-elemental-model.md) | **canonical** | implement from here |
| [stream-graphs.md](./stream-graphs.md) | needs-thinning | keep operator catalog; link ADR for types/host |
| [audio-graphs.md](./audio-graphs.md) | aligned | block consumer = profile; link ADR |
| [preview-monitors.md](./preview-monitors.md) | aligned | observe family explicit; link ADR |
| [picking-and-collision.md](./picking-and-collision.md) | needs-thinning | migrate to spatial.query vocabulary |
| [mesh-geometry-and-navigation.md](./mesh-geometry-and-navigation.md) | needs-thinning | migrate to partition + spatial |

## Extraction priority (E1–E8)

See [cpu-elemental-model.md § Extraction roadmap](./cpu-elemental-model.md#extraction-roadmap).

Recommended implementation order: **E1 → E2 → E3** (types, host, planner), then **E4 → E5**
(partition, spatial), then domain vertical slices.

## Open decisions (carried to ADR)

1. `opaque` vs extend F2 GPU `resource` template for CPU handles
2. Nav always a view over `partition` vs standalone `navGraph` bake
3. `flow.forEach` lowering vs `stream.map`
4. Multi-window spec (`PresentationSurface`) — still to write
5. WASM library choice for partition (CoACD vs V-HACD) — domain, not elemental

## Analysis workflow (for later)

1. Read **cpu-elemental-model.md** — rules and E-roadmap
2. Read **this memo** — why merges were chosen
3. Read **domain spec** — phases, test gates, stdlib nodes
4. **pending_issues.md** — what is still unlanded

## Related

- [elemental-webgpu-architecture-review.md](./elemental-webgpu-architecture-review.md) — GPU track + CPU pointer
- [README.md](./README.md) — index

---

## Rev. 2 addendum (2026-07-03 — post-review corrections)

**Do not edit the frozen sections above.** These corrections landed in
[cpu-elemental-model.md](./cpu-elemental-model.md) (ADR status: **accepted, pending implementation**).

### Finding corrections

| # | Original memo resolution | Rev. 2 correction |
|---|-------------------------|-------------------|
| 1 | One `PartitionResource` feeds physics + nav | **Partition kinds:** `solid`, `walkable`, `freeSpace` — shared machinery; `toCollider` only from solid; `toNav` only from walkable/freeSpace |
| 2 | `opaque { family }` | Extend F2 **`resource { schema }`** — unified GPU + CPU identity |
| 3 | `spatial.build` + `spatial.query { op }` | **Typed primitives** (`spatial.ray`, `spatial.sampleHeight`, …) with schema subtyping |
| 4 | One CPU planner | **PlanningCore** + schedule-specific executors; extended `ConsumerProfile` |
| 5 | Stale reads rejected at plan time | Runtime cache `(resourceId, revision)`; plan-time pin opt-in only |
| 6 | Universal rAF signal flush | **Context-specific drain** (ui→rAF, playback→quantum, scene→sim tick) |
| 7 | `observe` sink family | Observation **only** under `SessionPresentation` — not a sink family |
| 8 | `PickResult` per spec | Canonical **`SpatialHit`** in struct catalog |

### Updated before → after (supersedes table above for new work)

| Before | After (rev. 2) |
|--------|----------------|
| `partition.build` (monolithic) | `partition.buildSolid` / `buildWalkable` / `buildFreeSpace` |
| `spatial.query(ray)` | `spatial.ray` |
| `spatial.build(heightfield)` | `spatial.buildHeightfield` |
| `geometry.transform { op }` | `geometry.decimate`, `geometry.booleanUnion`, … |
| `pick.mesh` | `spatial.ray` + `ConsumerProfile: pick.event` |
| `nav.pathQuery` | `spatial.pathPortals` |

### Domain spec alignment (rev. 2)

| Spec | Status |
|------|--------|
| [cpu-elemental-model.md](./cpu-elemental-model.md) | **accepted** — E0 gate before E1 |
| [stream-graphs.md](./stream-graphs.md) | **thinned** |
| [audio-graphs.md](./audio-graphs.md) | **thinned** |
| [preview-monitors.md](./preview-monitors.md) | **thinned** |
| [picking-and-collision.md](./picking-and-collision.md) | **thinned** |
| [mesh-geometry-and-navigation.md](./mesh-geometry-and-navigation.md) | **thinned** |

### Extraction priority (rev. 2)

**E0** (ADR accepted) → **E1** (types) → **E2–E3** (host + PlanningCore/executors) → **E4–E5**
(partition kinds + typed spatial/geometry). See ADR extraction roadmap.

---

## Rev. 3 addendum (2026-07-04 — E1-blocking fixes)

**Do not edit frozen sections or rev. 2 above.** Corrections in
[cpu-elemental-model.md](./cpu-elemental-model.md) and thinned domain specs.

### E1-blocking corrections (findings 1–3)

| # | Issue | Rev. 3 resolution |
|---|-------|-------------------|
| 1 | No `TypeRef { kind: 'resource' }` in F2 | **`cpu-handle`** on port wires; extend **`ResourceShape`** with `{ kind: 'cpu', schema }`; GPU keeps buffer/texture/sampler |
| 2 | Revision pin on TypeRef | **`expectedRevision`** on **`ResourceBinding`** only; `revisionTracked?` on port |
| 3 | `HostPortBinding` dropped GPU contexts | Landed **`HostBinding`** unchanged + new **`HostEgressBinding`** |

### Domain corrections (findings 4–7, not E1-blocking)

| # | Fix |
|---|-----|
| 4 | Fixed primitive contracts: `geometry.convexHullCollider`, `spatial.rayField`, `FrustumHitSet`, `spatial.pathToWaypoints` |
| 5 | `partition.buildFreeSpace` input semantics, `agentRadius`, LOS validation in mesh spec |
| 6 | Mesh spec drift: `partitionPart`, nav overlay source, `SpatialPath`/`BakeProgress` egress |
| 7 | Group round-trip: occurrence `@arg` provenance; R3 merge-by-`@node` |

### E1 gate (rev. 3)

**E1 unblocked** for routing once rev. 3 ADR edits are merged. Implementation:
`cpu-handle`, stream/future/signal, extend `ResourceShape`, `ResourceBinding.expectedRevision`.
