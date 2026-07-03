# Foundation 1 — freeze the elemental contracts: implementation plan

**Status:** proposed implementation plan, not yet approved · **Revision:** 2 (2026-07-03) —
incorporates a verified external review; see [Revision history](#revision-history) · **Parent:**
[elemental-webgpu-architecture-review.md](./elemental-webgpu-architecture-review.md) (Foundation 1
of 4) · **Depends on:** nothing — this can start immediately · **Blocks:** Foundation 2 (generic
resources/frame execution), Foundation 3 (generic kernels), Foundation 4 (generic command/resource
planner), and any follow-on brief for generic compute-dispatch, generic feedback, or
graph-authorable instancing.

## Why this document exists

The architecture review correctly diagnoses five structural problems and proposes fixes, but
states them as recommendations without a migration sequence, without file-level evidence of blast
radius, and without test gates — the same rigor [implementation-plan.md](./implementation-plan.md)
gives the M0–M17 spine. This document supplies that rigor, grounded in direct investigation of the
current code (three parallel research passes, personal verification, and one full external review
pass whose every finding was independently re-verified against the code before acceptance).

**Explicit goal restated, since it shapes every sequencing decision below:** this project's
purpose was never "ship planet rendering" or "ship particle rendering" fast — it's building the
best possible system for authoring WebGPU compute/vertex/shader code through a graph editor. That
means correctness and migration safety take priority over speed here. Every sub-milestone below
is sequenced so the live planet renderer (`apps/scene-editor`, gated per `AGENTS.md`) and every
already-shipped, already-tested graph-editor feature keep working throughout, not just at the end.

## Revision history

**Revision 2** incorporates a verified external review of revision 1. Every finding below was
independently re-checked against the plan text and the live code before acceptance — none were
taken on faith:

- Split what was a single "F1.4" into **F1.4a** (exports/execution-roots + document migration,
  in scope here) and an explicit **Foundation 4** pointer (the generic command/resource/hazard
  planner, out of scope — revision 1 asked F1.4 to build Foundation-2/3/4 machinery while also
  declaring that machinery out of scope, an internal contradiction).
- Changed F1.3's group reference from embedding `GroupDefinition` directly to a `groupId: string`
  plus an external registry — embedding the definition would force `packages/graph` to import
  compiled group values from `packages/procedural-wgsl`, which already depends on `graph`,
  creating a real package cycle (verified against `transform.spherify`'s actual registration).
- Added an explicit v1→v2 `GraphDocument` migration ([F1.4a](#f14a--unify-execution-roots--migrate-legacy-documents)) after finding that
  legacy field-only graphs (e.g. `graphBuilders.ts`'s `defaultPreviewGraph()`) have **no** sink or
  kernel node at all — their only execution-root signal is `consumers`. Revision 1's "parse and
  discard" compatibility note would have silently broken every graph shaped like this.
- Narrowed F1.1 to a pure rename (`list<T>` → `tuple<T>`) and removed the interim
  `storageBuffer<T>` type revision 1 proposed, which would have been deleted the moment F1.5
  landed. Runtime buffer element-typing now belongs to F1.5/Foundation 2 outright.
- Changed the coordinate-space model from a single `SemanticTag = string` field to two concepts —
  `space?: SpaceId` (still singular; a port is in exactly one frame) and `semantics?: SemanticTag[]`
  (plural; orthogonal properties like unit or color-space that can coexist with a space) — matching
  the parent review's own "ports may carry multiple semantic tags" and its own `"color:linear-srgb"`
  example, which revision 1 had collapsed and mislabeled as `"unit:linear-srgb"`.
- Fixed the structural-node migration list: `stage.vertex` has a real, working WGSL function
  (`vertexStage`, confirmed in `packages/procedural-wgsl/src/modules/pipeline/vertexStage.ts`) and
  stays `kind: 'wgsl-function'` until Foundation 3 gives kernels a real shape — revision 1 wrongly
  grouped it with the genuinely-structural nodes. `geometry.fullscreenPlane`, which revision 1's own
  evidence section correctly identified as comment-only, was missing from the fix list — added.
- Corrected the `DataType ↔ TypeRef` mapping from general bidirectional to `DataType → TypeRef`
  (total) plus `TypeRef → optional display alias` (partial) — a `TypeRef` describing a struct,
  parameterized buffer, or texture format has no corresponding legacy string to map back to.
- Resolved the TypeBox-reuse question revision 1 left open: **keep `TypeRef` separate from
  TypeBox**, with a narrow conversion function for the compatible scalar/vector/struct value-schema
  subset. TypeBox describes serializable values and UI schemas; GPU types additionally carry
  address space, access, texture format, usage, and layout semantics TypeBox has no model for.
- Replaced the blanket "byte-identical output" parity claim with four explicit categories (see
  [Parity-gate categories](#parity-gate-categories)), applied per gate item instead of one phrase
  covering WGSL text, rendered pixels, and cache signatures alike.
- Adopted the reviewed sequencing: **F1.1 → F1.2 → F1.5 → F1.3 → F1.4a**, not the original
  numeric order — F1.5 moved earlier because F1.3's resource/kernel placeholder variants and
  F1.1's (now deferred) buffer element-typing both want `TypeRef` to already exist, avoiding a
  second round of placeholder churn.

## Parity-gate categories

Referenced throughout instead of a single "byte-identical" claim, since different artifacts need
different verification:

1. **Byte-identical WGSL** — for compiled shader text, where compilation semantics are unchanged.
2. **Numeric/pixel-equivalent runtime results** — for CPU-evaluated values and GPU-rendered
   output; exact for CPU floats, visually-indistinguishable for rendered pixels.
3. **Canonical v2 serialization after migration** — for saved documents; not byte-identical to
   the old v1 text (the schema is intentionally changing), but round-trips losslessly and is
   itself stable/canonical once migrated.
4. **Browser visual gate** — for existing image/mesh/vegetation samples, a human-verified render
   check, not headless-green alone.

## Sequencing rationale

The five sub-problems have materially different migration risk, verified by direct investigation:

| Sub-problem | Verified blast radius | Risk |
|---|---|---|
| F1.1 rename `list<T>` → `tuple<T>` | **Zero production primitives use it today** (exhaustive grep) | Lowest — free rename |
| F1.2 open semantic spaces | 30 port declarations, 1 conversion primitive, editor already treats space as opaque | Low |
| F1.5 `TypeRef` compatibility layer | Additive alongside `DataType`; no existing primitive changes behavior | Low-medium, but needed early by F1.3/F1.1 |
| F1.3 primitive-implementation union + group registry | Dispatch logic concentrated in exactly 3 files; touches registration shape of 138 primitives (mechanical) | Medium |
| F1.4a unify execution roots + v1→v2 migration | 6+ files depend on `GraphDocument.consumers`; legacy field-only graphs have no other execution-root signal | High |

**Sequence: F1.1 → F1.2 → F1.5 → F1.3 → F1.4a.** F1.5 moved ahead of F1.3 because F1.3's
`resource`/`kernel`/`command` placeholder variants (and F1.1's deferred buffer-element-typing) both
want `TypeRef` to exist first — doing F1.5 later would mean designing those placeholders twice.
F1.4a stays last: it's the highest-blast-radius change and benefits most from F1.3's `kind` tagging
already being in place, so "kernel/pass/sink nodes are execution roots" is a direct tag check, not
another string-based convention layered on the ones being retired.

**Foundation 4** (replacing `PipelineGraphPlan`'s hardcoded chain-search with a fully generic
command/resource/hazard planner) is explicitly **not** part of Foundation 1. F1.4a only teaches the
planner to *discover* today's one pipeline shape generically (via `kind` tags instead of primitive-id
strings); it does not build the resource-lifetime/hazard-validation model a truly generic planner
needs — that model doesn't exist until Foundations 2 and 3 land.

---

## F1.1 — Rename static collections; defer runtime buffers

**Goal:** stop conflating "unroll N statically-wired edges at compile time" with "loop over a
runtime GPU storage buffer." Scope narrowed to the static half only — the runtime half needs a
real element-typed buffer representation, which is F1.5/Foundation 2's job, not this one's.

**Verified current state:**
- `ListDataType = 'list<f32>' | 'list<vec2f>' | 'list<vec3f>' | 'list<vec4f>'` — a closed,
  non-parameterized set (`packages/graph/src/types.ts:18`).
- Two lowering strategies already exist, dispatched by *edge count*, not type: multiple edges →
  static unroll into a WGSL `array<T, N>` constructor (`packages/compiler/src/groupCodegen.ts:341-354`,
  `packages/runtime-webgpu/src/emitGraphEval.ts:359-372`); a single edge from a `storageBuffer`
  port → a runtime `for` loop over `arrayLength(&buffer)` (`groupCodegen.ts:328-338,406-414`,
  `emitGraphEval.ts:346-356,411-424`). If N>1 edges happen to include a storage-buffer source, it
  still unrolls — the dynamic path only triggers on exactly one edge.
- **Confirmed by exhaustive grep: zero registered production primitives declare a `list<T>`
  input port.** The only users are test fixtures (`packages/graph/src/validateMultipleInputs.test.ts:82`,
  `packages/runtime-webgpu/src/emitGraphEval.test.ts`). This is wired infrastructure with no real
  caller — the lowest-risk possible migration target.
- `flow.forEach`/`flow.map`/`flow.reduce` container nodes: zero code exists, purely aspirational.
- Vegetation candidate generation has no graph-level exposure at all today — confirms this is
  genuinely greenfield, not a hidden dependency.

**Fix:**
1. Rename `list<f32>`/`list<vec2f>`/`list<vec3f>`/`list<vec4f>` to `tuple<f32>`/`tuple<vec2f>`/
   `tuple<vec3f>`/`tuple<vec4f>` (or `staticList<T>` — pick one name and use it consistently).
   Codegen is otherwise unchanged: this is the existing static-unroll path, honestly named.
2. **Do not** touch the runtime storage-buffer loop path in this sub-milestone. It keeps working
   exactly as today (single edge from a `storageBuffer` port triggers the loop) — untyped, as it
   already is. Do not invent an interim `storageBuffer<T>` or `buffer<T>` type here; that type
   belongs to F1.5 (once `TypeRef` exists to give it a real element type) or Foundation 2 (once
   resources are generic). An interim type here would just be deleted the moment either lands.
3. Migrate the existing test fixtures (`test.listSum` etc.) to `tuple<T>` — this is the entire
   compatibility surface, since nothing else references `list<T>`.

**Test gate:**
1. `tuple<T>` compiles to the same static-unroll WGSL as today's multi-edge `list<T>` case
   (parity category 1: byte-identical WGSL, just re-typed).
2. The runtime storage-buffer loop path's behavior is unchanged — a regression test pins today's
   exact behavior (single edge, storage-buffer source → loop; anything else → static unroll)
   so a later sub-milestone can't silently change it without a failing test.
3. `check` and `test` green for `graph`, `compiler`, `runtime-webgpu`, full workspace.

**Out of scope:** an explicit runtime buffer/element-type representation (F1.5 or Foundation 2).
Building `flow.forEach`/`map`/`reduce` container nodes (needs Foundation 3/4's kernel and command
model first).

---

## F1.2 — Open coordinate spaces and semantic tags

**Goal:** stop hardcoding planet-specific space names into the generic `packages/graph` core;
make spaces open and separate the singular "which frame is this in" concept from pluralizable
semantic properties like units or color space, which can coexist with a space on the same port.

**Verified current state:**
- `CoordinateSpace` is a closed union of exactly 8 values, **100% planet/terrain-specific**
  (`packages/graph/src/types.ts:22-31`).
- Only **30 port declarations** across the entire codebase use a non-default space — 21 terrain,
  6 surface, 2 generic (`space: 'none'`, explicit). Zero color/audio/other-domain primitives use
  this mechanism at all today.
- Validation (`packages/graph/src/validate.ts:98-102`) is a simple rule: if either port's space
  is `'none'`, the edge is allowed; if both are non-`'none'`, they must match exactly.
- Exactly **one** conversion primitive exists in the whole codebase: `terrain.worldNormal`
  (`body_dir → world_dir`).
- The graph-editor already treats `space` as an opaque string for display/validation-reporting
  (`graphValidation.ts`, `portBindings.ts`, `primitiveSources.ts`) — **no editor UI changes are
  needed** for this migration.
- The parent review's own model is explicit that ports carry *multiple* semantic tags
  simultaneously (`elemental-webgpu-architecture-review.md:139,142`: `"space:world"`, `"unit:m"`,
  `"color:linear-srgb"` as independent, co-occurring tags) — a single `SemanticTag: string` field
  cannot express a port that is simultaneously in `body_pos` space *and* measured in meters *and*
  tagged linear-sRGB. Space (a mutually-exclusive choice of frame) and general semantic tags
  (additive, co-occurring properties) are different shapes and need different fields.
- **Real coupling to watch:** `packages/graph/src/contract.ts:20` folds space into the
  swap-family *contract* string — two primitives with the same data type but different spaces
  currently can't swap for each other unless they share an explicit `role` override.

**Fix:**
1. Replace `CoordinateSpace` with two separate fields on `PortSpec`:
   - `space?: SpaceId` (`SpaceId = string`) — still singular, open instead of closed. A port is in
     exactly one coordinate frame; this stays a discriminant, not a set.
   - `semantics?: SemanticTag[]` (`SemanticTag = string`) — plural, for orthogonal properties
     (e.g. `"unit:m"`, `"color:linear-srgb"`) that can co-occur with a space or with each other.
2. Keep the exact-match-or-`'none'` validation rule for `space` unchanged initially — this
   sub-milestone is about openness, not a conversion graph. `semantics` starts unvalidated
   (informational/display-only) until a real need for semantic-tag validation surfaces.
3. Move the 8 existing planet-specific `space` values out of core registration and into
   library-registered constants (a `terrain`/`planet` module the terrain primitives import from).
4. **Decide the `contract.ts` question explicitly:** keep `space` in the swap-family contract
   string as today (preserves current swap behavior exactly); revisit only if a concrete need for
   cross-space swapping surfaces. `semantics` does not participate in swap-family contracts at all
   initially (it's additive metadata, not a mechanical-compatibility signal).

**Test gate:**
1. All 30 existing `space` port declarations produce identical validation results on existing
   graphs (parity category 2: identical validation outcomes, not just "doesn't crash").
2. A new test registers a non-terrain `space` value (e.g. a hypothetical audio-domain frame) from
   outside `packages/graph`'s core and proves the core validates it correctly without knowing what
   it means.
3. A new test attaches `semantics: ['color:linear-srgb']` to a port alongside a `space` value on
   the *same* port, proving the two are independent and co-occur cleanly — the actual proof this
   is no longer a single collapsed tag.
4. `check` and `test` green for `graph`, `graph-editor`, full workspace.

**Out of scope:** validating `semantics` compatibility on edges (informational only for now).
Building a general conversion graph between arbitrary spaces. Resolving the `contract.ts`
swap-family question beyond the explicit "preserve current behavior" default above.

---

## F1.5 — `TypeRef` compatibility layer

**Goal:** introduce a structural type algebra capable of integers, matrices, parameterized
buffers/textures, and struct types, alongside the existing `DataType`, without breaking any of the
138 currently-registered primitives — moved ahead of F1.3 because F1.3's resource/kernel/command
placeholder variants, and F1.1's deferred buffer element-typing, both want this to exist first.

**Verified current state:**
- `DataType` is a flat union of exactly 20 literal values across four categories (value, external
  resource, pipeline resource, list) — `packages/graph/src/types.ts:5-19`.
- **No integer types exist at all** — `packages/compiler/src/groupCodegen.ts` explicitly throws
  on integer param schemas, a deliberate, acknowledged deferral, not an oversight.
- **No matrix types exist at all.**
- The vec2f→vec3f promotion rule is copy-pasted identically in three files:
  `packages/runtime-webgpu/src/emitGraphEval.ts:108-114`, `packages/compiler/src/groupCodegen.ts:32-38`,
  `packages/runtime-cpu/src/evalGraph.ts:32-38` — a latent bug risk independent of this migration.
- Five files contain exhaustive `DataType` switches (`_exhaustive: never` grep): `irAdapter.ts`,
  `graphValidation.ts`, `nodePaletteModel.ts`, `previewBuffers.ts`, `previewBackend.ts` — all in
  `graph-editor`.
- The WGSL↔DataType mapping is well-isolated in one small table
  (`packages/graph/src/dataType.ts:5-14`) — the self-describing-WGSL mechanism the parent review
  wants to keep is already a clean chokepoint, not scattered.
- **TypeBox decision, resolved:** `packages/schema`'s `TSchema` is already a real, structural,
  composable type system, currently used only for primitive *params*. Keep `TypeRef` **separate**
  from TypeBox rather than extending it for ports. TypeBox describes serializable JSON-like values
  and UI-form schemas; GPU port types additionally need address space, read/write access, texture
  dimension/format/sample-type, storage-texture access, buffer usage flags, and layout/alignment
  semantics — none of which TypeBox has a model for. Forcing GPU resource types into TypeBox would
  mean either bolting on extensive non-standard annotations or building parallel structures anyway,
  defeating the reuse motivation. Provide a narrow, explicit conversion function for the subset that
  *does* overlap cleanly — plain scalar/vector/struct **value** schemas — rather than a general
  TypeBox↔TypeRef bridge.
- 138 primitive registrations only declare `dataType: 'f32'`-style port specs — mechanically
  simple to migrate; the real complexity is in the ~37 non-primitive files with dispatch logic.

**Fix:**
1. Introduce `TypeRef` as the parent review specifies (scalar/vector/matrix/array/struct/buffer/
   texture/sampler/mesh/command discriminated union), **alongside** `DataType`, not replacing it.
2. Add a **one-directional-total, one-directional-partial** mapping, not a general bidirectional
   one: `DataType → TypeRef` is total (every existing `DataType` value has a canonical `TypeRef`);
   `TypeRef → DataType` is a **partial, optional** "display alias" lookup that only succeeds for
   `TypeRef` values that happen to correspond to an existing `DataType` (a `TypeRef` describing an
   arbitrary struct, a parameterized buffer, or a specific texture format has no legacy string to
   map back to, and must not be forced into one).
3. Consolidate the triplicated `promoteExpr()`/`coerceInputValue()` copies into one shared,
   `TypeRef`-aware promotion function used by all three call sites.
4. Migrate the 5 exhaustive-switch files last, once `TypeRef` is proven via new primitives.
5. Prove one new primitive using an integer port and one using a matrix type end-to-end (compiles,
   evaluates on CPU, runs on GPU) as the acceptance bar for "the closed type system is actually
   fixed," not just "the union got bigger."
6. Add the narrow TypeBox-compatible conversion (scalar/vector/struct value schemas only) as a
   separate, explicitly-scoped helper — not a general bridge, per the resolved question above.

**Test gate:**
1. All 138 existing primitive registrations validate and compile identically via the
   `DataType → TypeRef` mapping (parity category 1/2 as applicable) — zero behavior change.
2. The consolidated promotion function produces identical output to all three current copies for
   every existing promotion case.
3. A new test primitive using an integer port and one using a matrix type both round-trip through
   `evalCPU` and compile to correct WGSL.
4. A test proves `TypeRef → DataType` correctly returns "no alias" for a `TypeRef` shape that has
   no legacy equivalent (e.g. a struct type), rather than throwing or guessing.
5. `check` and `test` green for every package, full workspace.

**Out of scope:** the full WebGPU capability/validation model (Foundation 2). Storage/texture
usage-flag inference from edges (Foundation 2). Removing `DataType` — it stays as a convenience
alias layer indefinitely. A general TypeBox↔TypeRef bridge beyond the narrow value-schema subset.

---

## F1.3 — Discriminated primitive-implementation union + external group registry

**Goal:** stop forcing every primitive to declare a `wgsl: WgslSourceRef`, even structural nodes
with no WGSL function at all — without creating a package dependency cycle between `graph` and
`procedural-wgsl`.

**Verified current state:**
- `NodePrimitive.wgsl: WgslSourceRef` is a **required** field (`packages/graph/src/primitive.ts:71`).
  `evalCPU` is already correctly optional; only `wgsl` has this problem.
- Structural nodes work around this by registering placeholder WGSL modules whose entire body is
  a comment. The file's own header names the problem directly:
  `packages/procedural-wgsl/src/modules/pipeline/structural.ts:1` — *"Pipeline nodes with no
  standalone WGSL — honest structural markers (no empty fn stubs)."* This applies to
  `buffer.persist`, `stage.fragment`, `target.display`, `target.mesh`, and
  `geometry.fullscreenPlane` — **five** nodes, verified by reading `structural.ts` directly.
- **`stage.vertex` is different and must not be grouped with the five above:** it has a real,
  working WGSL function (`vertexStage`, in `packages/procedural-wgsl/src/modules/pipeline/vertexStage.ts`,
  an actual identity clip-projection over `plane_grid_position`). It stays `kind: 'wgsl-function'`
  — a transitional classification — until Foundation 3 defines a real kernel shape for it. Do not
  reclassify it as structural and do not remove its module.
- `primitive.wgsl.moduleId`/`.entry` is read directly in exactly **3 files**:
  `packages/compiler/src/codegen.ts`, `packages/compiler/src/groupCodegen.ts`,
  `packages/runtime-webgpu/src/emitGraphEval.ts` — dispatch logic is concentrated, not scattered.
- **Group ownership boundary, verified:** `GroupDefinition` the *type* lives in `packages/graph`,
  but the compiled group *values* (e.g. `TRANSFORM_SPHERIFY_GROUP`) live in `packages/procedural-wgsl`
  (`packages/procedural-wgsl/src/groups/transform.spherify.ts`), which already depends on `graph`
  (confirmed in `procedural-wgsl/package.json`). The actual current primitive registration for
  `transform.spherify` (`packages/graph/src/primitives/transform/spherify.ts`) references its WGSL
  by **string** `moduleId`, not by importing the compiled group value — it does not currently
  import anything from `procedural-wgsl`. Embedding `definition: GroupDefinition` directly in
  `NodePrimitive.implementation` would force that registration file to import the compiled group
  value from `procedural-wgsl`, creating `graph → procedural-wgsl → graph`, a real cycle.
- 138 `registerPrimitive` calls across ~91 files — each is a small, mechanical registration.

**Fix:**
1. Introduce the discriminated union:
   ```ts
   type PrimitiveImplementation =
     | { kind: 'wgsl-function'; moduleId: string; entry: string }
     | { kind: 'group'; groupId: string }
     | { kind: 'host-input'; binding: HostBinding }
     | { kind: 'resource'; descriptor: ResourceDescriptor }
     | { kind: 'kernel'; stage: 'vertex' | 'fragment' | 'compute' }
     | { kind: 'command'; command: GpuCommandKind }
     | { kind: 'sink'; sink: PresentationSinkKind };
   ```
   Note `{ kind: 'group'; groupId: string }` — a reference, not an embedded `GroupDefinition`.
   `ResourceDescriptor`/`GpuCommandKind`/`PresentationSinkKind` are placeholders (Foundations 2–4
   define their real shapes, now informed by `TypeRef` from F1.5); only `wgsl-function`, `group`,
   and `sink` need concrete definitions for F1.3, since they cover every primitive that exists today.
2. Add a **group registry** — a small provider (in `packages/graph`, or its own package if that
   proves cleaner once attempted) mapping `groupId → GroupDefinition`, populated at startup from
   wherever compiled group values are actually produced (today: `procedural-wgsl`). Primitive
   registrations reference groups by `groupId` string, exactly matching the existing pattern of
   referencing WGSL modules by string `moduleId` — no new dependency direction. The editor resolves
   `groupId` through this registry for "zoom in and expand" UX without `graph` importing
   `procedural-wgsl` directly.
3. Add `NodePrimitive.implementation: PrimitiveImplementation` alongside the existing `wgsl` field
   — do not remove `wgsl` yet. Make it optional and derive it from `implementation` for
   `wgsl-function`/`group` kinds, so the 3 dispatch files migrate one at a time.
4. Migrate the structural-node registrations to `kind: 'sink'` or a temporary `kind: 'command'`
   placeholder: `buffer.persist`, `stage.fragment`, `target.display`, `target.mesh`,
   `geometry.fullscreenPlane` — **five nodes, `stage.vertex` excluded** (stays `wgsl-function` per
   the verified-state note above). Delete the fake WGSL modules for the five once nothing reads
   `.wgsl` for them.
5. Migrate `codegen.ts`, `groupCodegen.ts`, `emitGraphEval.ts` to branch on `implementation.kind`.

**Test gate:**
1. Every existing `wgsl-function` and `group`-backed primitive compiles to byte-identical WGSL
   before and after (parity category 1).
2. The five genuinely-structural nodes no longer have a registered WGSL module; `stage.vertex`
   still does and is unaffected.
3. A new test proves the compiler's dispatch skips non-function/non-group kinds without
   attempting to link/resolve a WGSL module for them.
4. A new test proves the group registry resolves `groupId` correctly for the editor's "expand
   group" path without `packages/graph` importing `packages/procedural-wgsl` — check this via a
   dependency-direction assertion (e.g. a lint/import-graph check), not just behavior.
5. `check` and `test` green for `graph`, `compiler`, `procedural-wgsl`, `runtime-webgpu`, full
   workspace.

**Out of scope:** designing `ResourceDescriptor`/`GpuCommandKind`/real kernel semantics
(Foundation 2/3/4). Migrating `stage.vertex`/`stage.fragment` to a final `kind: 'kernel'` shape.

---

## F1.4a — Unify execution roots + migrate legacy documents

**Goal:** replace `GraphDocument.outputs` + `GraphDocument.consumers` + role-metadata node
detection with one rule — exports name reusable values, kernel/pass/sink nodes (per F1.3's `kind`
tag) are the only execution roots — **and** ship a real `GraphDocument` schema migration so no
existing saved graph silently loses its execution roots. This is **not** Foundation 4: it does not
build a generic resource/hazard-validation planner, only generic *root discovery* for today's one
pipeline shape.

**Verified current state:**
- `GraphDocument` has both `outputs: GraphOutput[]` and `consumers: ProceduralConsumer[]` as
  separate top-level fields. `ProceduralConsumer.outputs: string[]` references `GraphOutput.name`
  by string — `consumers` already depends on `outputs` existing.
- **Direct evidence of the conflation:** `PipelineStage = 'compute' | 'vertex' | 'fragment' |
  'mesh-gen'` — `'mesh-gen'` is listed as a pipeline *stage*, when it's a compute-kernel role or
  standard-library group.
- A *third*, parallel execution-root mechanism exists: `isPipelineTarget`/`isMeshTarget` detect
  sink nodes via `metadata.role` string tags, independent of both `outputs` and `consumers`.
- The project already has reconciliation logic (`effectiveOutputs`/`effectiveConsumers`/
  `derivePipelineConsumers`/`deriveMeshTargets`) built specifically to paper over drift between
  these sources.
- `GraphDocument.consumers` is read in 6 files across `compiler` and `graph-editor` — every major
  editor surface (compiled-WGSL view, IR adapter, markup export, compile-signature caching)
  touches this, making it the highest-stakes regression surface in Foundation 1.
- `PipelineGraphPlan` hardcodes fixed-chain node search: `findNode(doc, 'target.display')`,
  `findNode(doc, 'buffer.persist')`, plus direct `.primitive !== 'stage.vertex'` string checks.
- **Legacy documents with no sink/kernel node at all, verified:**
  `packages/graph-editor/src/graphBuilders.ts:131-158`'s `defaultPreviewGraph()` is a pure value
  chain (`procedural.uv → noise.perlin3d → math.remap`) with **zero** `target.*`/`stage.*` nodes.
  Its *only* execution-root declaration is `consumers: [{ type: 'preview', outputs: ['field'] }]`.
  A rule of "only kernel/pass/sink nodes are execution roots" has literally nothing to walk from
  for this graph and any graph shaped like it — a real, not hypothetical, breakage risk.

**Fix:**
1. Define the rule: **exports** (`GraphDocument.outputs`, unchanged) name reusable values.
   **Kernel/pass/sink nodes** (via F1.3's `implementation.kind`) are the only execution roots for
   *rendering/compute execution* — runtime execution derives from walking backward from every
   reachable kernel/pass/sink node.
2. **Introduce `GraphDocument` schema version 2** and an explicit v1→v2 migration function:
   - For documents whose only execution-root signal is a `consumers: [{ type: 'preview', ... }]`
     entry (no sink node present), **synthesize a sink node** on migration (e.g. a
     `preview.fieldSink`-equivalent kind, wired from the referenced output) so the new rule has
     something concrete to walk from. Do not just parse-and-discard `consumers`.
   - For documents that already have real `target.*`/`stage.*` sink nodes, migration drops the
     now-redundant `consumers` array and keeps the nodes as-is.
   - Keep graph-schema versioning (`GraphDocument.version`) and artifact/serialization-format
     versioning as separate concerns — a schema-version bump does not imply every serialized
     artifact (e.g. exported markup) changes shape for unrelated reasons.
3. Build a **fixture corpus** covering every bundled sample graph in `graphBuilders.ts` plus at
   least one hand-written v1 document matching each distinct legacy shape found (sink-bearing,
   consumer-only, mixed) — migrate each through v1→v2 and assert the synthesized/derived result
   still produces the same rendered/compiled output as before migration.
4. Retire `GraphDocument.consumers`/`ProceduralConsumer` as a live authoring field once migration
   is proven — new documents are always v2, authored without `consumers`.
5. Update the 6 files reading `.consumers` to read post-migration v2 documents instead, one file
   at a time, with a parity test per file.
6. Narrow planner change only: teach `PipelineGraphPlan` to discover today's fixed pipeline shape
   (geometry → persist → vertex → fragment → display) by walking `implementation.kind` tags
   instead of hardcoded primitive-id strings. **Do not** attempt to generalize the planner beyond
   this one shape — a planner for arbitrary sink/kernel topologies needs the resource/hazard model
   Foundation 2/3 don't provide yet. That generalization is Foundation 4, explicitly out of scope.

**Test gate:**
1. Every already-shipped feature depending on `consumers`/`outputs`/role-detection — image-pipeline
   preview, mesh-gen preview, compiled-WGSL view, markup export, graph validation, undo/redo
   compile-signature caching — matches its **appropriate** parity category per the taxonomy above:
   byte-identical WGSL for compiled shader text; pixel-equivalent for rendered previews; canonical
   v2 serialization (not byte-identical v1 text) for markup export; a browser visual gate for the
   bundled samples. Not one blanket "byte-identical" claim across all of these.
2. The full fixture corpus (every bundled sample + hand-written legacy-shape documents) migrates
   v1→v2 with no loss of execution roots, verified by the synthesized-sink-node mechanism for
   consumer-only documents specifically.
3. `effectiveOutputs`/`effectiveConsumers`/`derivePipelineConsumers`/`deriveMeshTargets` are
   deleted, not superseded.
4. A new test wires a novel sink kind (invented for the test) and proves `PipelineGraphPlan`'s
   discovery step finds it via `implementation.kind` alone — proving root *discovery* is generic,
   while acknowledging (per scope above) the planner's *shape* is still the one fixed chain.
5. Loading an old v1 saved document still opens and behaves identically after migration.
6. `check` and `test` green for every package, full workspace, with special attention to
   `graph-editor`.

**Out of scope:** the generic resource/pass/hazard-validation model (Foundation 2). Generalizing
`PipelineGraphPlan` beyond discovery of today's one pipeline shape (Foundation 4). Any new sink/
kernel topology beyond what already exists.

---

## Definition of done for Foundation 1

All five sub-milestones' test gates pass (in execution order: F1.1, F1.2, F1.5, F1.3, F1.4a), plus:

- Every already-shipped, already-tested feature produces output matching its correct parity
  category (see [Parity-gate categories](#parity-gate-categories)) on its existing test suite and
  bundled sample graphs — verified by full `check`/`test`/`build`, not spot-checked.
- The live planet renderer (`apps/scene-editor`) is never touched by this plan except through
  F1.2's space generalization, with identical validation behavior, not a rewrite.
- The F1.4a fixture corpus (every bundled sample + hand-written legacy-shape documents) migrates
  v1→v2 with no execution-root loss.
- No new primitive/consumer/feature work lands in the *old* shape while this is in progress.
- A follow-up document sequences Foundation 2 the same way — not written yet, deliberately,
  before Foundation 1 proves the approach.

## What this document deliberately does not do

It does not propose starting Foundation 2, 3, or 4 — Foundation 4 in particular (the generic
command/resource/hazard planner) is explicitly named throughout as out of scope for F1.4a. It does
not estimate calendar time — per this project's stated priority, the gate is correctness and
migration safety, not speed.
