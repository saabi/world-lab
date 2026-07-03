# Foundation 1 — freeze the elemental contracts: implementation plan

**Status:** proposed implementation plan, not yet approved · **Parent:**
[elemental-webgpu-architecture-review.md](./elemental-webgpu-architecture-review.md) (Foundation 1
of 4) · **Depends on:** nothing — this can start immediately · **Blocks:** Foundation 2 (generic
resources/frame execution), Foundation 3 (generic kernels), Foundation 4 (command graph), and any
follow-on brief for generic compute-dispatch, generic feedback, or graph-authorable instancing.

## Why this document exists

The architecture review correctly diagnoses five structural problems and proposes fixes, but
states them as recommendations ("adopt the primitive implementation union...") without a
migration sequence, without file-level evidence of blast radius, and without test gates — the
same rigor [implementation-plan.md](./implementation-plan.md) gives the M0–M17 spine. This
document supplies that rigor for Foundation 1 specifically, grounded in direct investigation of
the current code (three parallel research passes plus personal verification), not assumption.

**Explicit goal restated, since it shapes every sequencing decision below:** this project's
purpose was never "ship planet rendering" or "ship particle rendering" fast — it's building the
best possible system for authoring WebGPU compute/vertex/shader code through a graph editor. That
means correctness and migration safety take priority over speed here. Every sub-milestone below
is sequenced so the live planet renderer (`apps/scene-editor`, gated per `AGENTS.md`) and every
already-shipped, already-tested graph-editor feature keep working throughout, not just at the end.

## Sequencing rationale

The five sub-problems have materially different migration risk, verified by direct investigation,
not estimated:

| Sub-problem | Verified blast radius | Risk |
|---|---|---|
| F1.1 static/runtime collection split (`list<T>`) | **Zero production primitives use it today** (exhaustive grep) | Lowest — free redesign |
| F1.2 open semantic spaces (`CoordinateSpace`) | 30 port declarations, 1 conversion primitive, editor already treats it as an opaque string | Low |
| F1.3 primitive-implementation union (`NodePrimitive`) | Dispatch logic concentrated in exactly 3 files; touches registration shape of 138 primitives (mechanical, not logical, change) | Medium |
| F1.4 unified execution roots (`outputs`/`consumers`/role-detection) | 6+ files depend on `GraphDocument.consumers`; `PipelineGraphPlan` hardcodes a fixed node-search chain; depends on F1.3 for a clean implementation | High |
| F1.5 structural `TypeRef` (`DataType`) | 5 exhaustiveness-checked functions, a promotion rule copy-pasted identically in 3 files, needs real design for types that don't exist yet (matrix, integer, parameterized buffer/texture) | Highest |

Sequence: **F1.1 → F1.2 → F1.3 → F1.4 → F1.5** — lowest-risk, most-isolated wins first, building
confidence and shared vocabulary before the two changes that touch the widest surface. F1.3 is
placed before F1.4 deliberately: once structural nodes carry a real `kind` tag, "kernel/pass/sink
nodes are the only execution roots" becomes a direct check on that tag, not another string-based
role convention layered on top of the ones being retired.

---

## F1.1 — Split static collections from runtime buffers

**Goal:** stop conflating "unroll N statically-wired edges at compile time" with "loop over a
runtime GPU storage buffer" — two different lifetime/indexing/codegen semantics currently
selected by an *implicit* signal (edge count), not an explicit type.

**Verified current state:**
- `ListDataType = 'list<f32>' | 'list<vec2f>' | 'list<vec3f>' | 'list<vec4f>'` — a closed,
  non-parameterized set (`packages/graph/src/types.ts:18`).
- Two lowering strategies already exist and are dispatched by *edge count*, not type:
  multiple edges → static unroll into a WGSL `array<T, N>` constructor
  (`packages/compiler/src/groupCodegen.ts:341-354`, `packages/runtime-webgpu/src/emitGraphEval.ts:359-372`);
  a single edge from a `storageBuffer` port → a runtime `for` loop over `arrayLength(&buffer)`
  (`groupCodegen.ts:328-338,406-414`, `emitGraphEval.ts:346-356,411-424`). If N>1 edges happen to
  include a storage-buffer source, it still unrolls — the dynamic path only triggers on exactly
  one edge.
- **Confirmed by exhaustive grep: zero registered production primitives declare a `list<T>`
  input port.** The only users are test fixtures (`packages/graph/src/validateMultipleInputs.test.ts:82`,
  `packages/runtime-webgpu/src/emitGraphEval.test.ts`). This is wired infrastructure with no real
  caller — the lowest-risk possible migration target.
- `flow.forEach`/`flow.map`/`flow.reduce` container nodes: zero code exists, purely aspirational
  (`primitive-library.md` lists them "💭 discussed (not yet pinned)").
- Vegetation candidate generation (`packages/runtime-cpu/src/vegetation.ts::generateVegetationCandidates`)
  has no graph-level exposure at all today — confirms this is genuinely greenfield, not a hidden
  dependency.

**Fix:**
1. Introduce `tuple<T>` (or `staticList<T>`) as the explicit compile-time-unroll type — same
   codegen as today's static-unroll path, just an honest name instead of an overloaded `list<T>`.
2. For the runtime case, don't invent a parallel `buffer<T>`/`span<T>` type from scratch — the
   `storageBuffer` `DataType` already exists and the dynamic-loop codegen already keys off it.
   The actual gap is that `storageBuffer` carries no *element type* parameter today. Add one
   (e.g. `{ kind: 'buffer', element: TypeRef, access, usages }` once F1.5 lands, or a narrower
   `storageBuffer<T>` string-parameterized interim if F1.5 hasn't landed yet — decide this when
   F1.5's design is concrete, don't block F1.1 on it).
3. Retire the 4 hardcoded `list<f32/vec2f/vec3f/vec4f>` literals once `tuple<T>` exists and the
   codegen paths key off the new, explicit types instead of edge-count inference.
4. Migrate the existing test fixtures (`test.listSum` etc.) to the new types — this is the entire
   compatibility surface, since nothing else references `list<T>`.

**Test gate:**
1. `tuple<T>` compiles to the same static-unroll WGSL as today's multi-edge `list<T>` case
   (string-identical output for the existing test graphs, just re-typed).
2. The runtime storage-buffer loop path is reachable via an *explicit* type declaration, not edge
   counting — a test with exactly one edge from a non-buffer source must NOT silently take the
   loop path (today it can't either, but make this a named invariant, not an accident of the
   current edge-count check).
3. `check` and `test` green for `graph`, `compiler`, `runtime-webgpu`, full workspace.
4. No behavior change for any shipped feature (there are none using `list<T>` to regress).

**Out of scope:** actually building `flow.forEach`/`map`/`reduce` container nodes — that's
Foundation 3/4 territory (needs the generic kernel and command-graph work first). This
sub-milestone only fixes the *type* split; container nodes are a separate, later brief.

---

## F1.2 — Open semantic/coordinate spaces

**Goal:** stop hardcoding planet-specific space names into the generic `packages/graph` core;
make spaces open, library-registered identifiers.

**Verified current state:**
- `CoordinateSpace` is a closed union of exactly 8 values, **100% planet/terrain-specific**
  (`packages/graph/src/types.ts:22-31`): `'none' | 'world_dir' | 'body_dir' | 'world_pos' |
  'body_pos' | 'ideal_fragment_body_dir' | 'height_meters' | 'world_radius_meters' | 'scale_ctx'`.
- Only **30 port declarations** across the entire codebase use a non-default space — 21 in
  terrain primitives, 6 in surface primitives, 2 generic (`space: 'none'`, explicit). Zero
  color/audio/other-domain primitives use this mechanism at all.
- Validation (`packages/graph/src/validate.ts:98-102`) is a simple rule: if either port's space
  is `'none'`, the edge is allowed; if both are non-`'none'`, they must match exactly. No
  conversion graph exists.
- Exactly **one** conversion primitive exists in the whole codebase:
  `terrain.worldNormal` (`packages/graph/src/primitives/terrain/worldNormal.ts`), converting
  `body_dir → world_dir`.
- The graph-editor already treats `space` as an opaque string for display/validation-reporting
  purposes (`graphValidation.ts`, `portBindings.ts`, `primitiveSources.ts`) — **no editor UI
  changes are needed** for this migration.
- **Real coupling to watch:** `packages/graph/src/contract.ts:20` folds space into the
  swap-family *contract* string (`` `${dataType}${space ? `@${space}` : ''}` ``) — two primitives
  with the same data type but different spaces currently can't swap for each other unless they
  share an explicit `role` override. This needs an explicit decision (below), not silent carry-over.

**Fix:**
1. Replace `CoordinateSpace`'s closed union with `type SemanticTag = string` in `packages/graph`'s
   core types.
2. Keep the exact-match-or-`'none'` validation rule unchanged initially (it already works and
   nothing here needs to get smarter yet — this sub-milestone is about *openness*, not about
   building a conversion graph).
3. Move the 8 existing planet-specific values out of core registration and into
   library-registered constants (e.g. a `terrain` or `planet` semantic-tag module that the
   terrain primitives import from, rather than the core type union enumerating them).
4. **Decide the `contract.ts` question explicitly, don't let it default:** either (a) keep space
   in the swap-family contract string as today (simplest, preserves current swap behavior
   exactly), or (b) extract space into a separate compatibility layer so primitives differing
   only by space become swappable when a `role` override already applies. Recommendation: (a) for
   this sub-milestone — preserve current behavior exactly, revisit (b) only if a concrete need
   surfaces, since it's a behavior change beyond "make spaces open."

**Test gate:**
1. All 30 existing port declarations produce identical validation results on existing graphs
   (space-mismatch still fires exactly where it does today, exact-match still passes).
2. A new test registers a non-terrain semantic tag (e.g. a hypothetical `"unit:linear-srgb"` for
   color) from outside `packages/graph`'s core and proves the core validates it correctly without
   knowing what it means — the actual proof that spaces are now open, not just renamed.
3. `check` and `test` green for `graph`, `graph-editor`, full workspace.
4. `terrain.worldNormal` and every terrain/surface primitive using space continue to validate and
   compile identically (parity check against current behavior, not just "doesn't crash").

**Out of scope:** building a general conversion graph between arbitrary spaces (only one
conversion primitive exists today; a real conversion-graph model is speculative until more than
one domain actually needs it). Resolving the `contract.ts` swap-family question beyond the
explicit "preserve current behavior" default above.

---

## F1.3 — Discriminated primitive-implementation union

**Goal:** stop forcing every primitive to declare a `wgsl: WgslSourceRef`, even structural nodes
that have no WGSL function at all.

**Verified current state:**
- `NodePrimitive.wgsl: WgslSourceRef` is a **required** field (`packages/graph/src/primitive.ts:71`)
  — there is no way to register a primitive without one. `evalCPU` is already correctly optional
  (line 74); only `wgsl` has this problem.
- Structural nodes already work around this by registering placeholder WGSL modules whose entire
  body is a comment. The file's own header names the problem directly:
  `packages/procedural-wgsl/src/modules/pipeline/structural.ts:1` — *"Pipeline nodes with no
  standalone WGSL — honest structural markers (no empty fn stubs)."* Every one of
  `buffer.persist`, `stage.fragment`, `target.display`, `target.mesh`,
  `geometry.fullscreenPlane` declares a module whose only content is `// (no WGSL — structural
  node)` (lines 11-38 of that file). This is the concrete, already-visible symptom of the
  conflation, not a hypothetical one.
- `primitive.wgsl.moduleId`/`.entry` is read directly in exactly **3 files**:
  `packages/compiler/src/codegen.ts`, `packages/compiler/src/groupCodegen.ts`,
  `packages/runtime-webgpu/src/emitGraphEval.ts` — the actual dispatch logic is concentrated, not
  scattered, which is good news for this migration.
- Groups (`transform.spherify` etc.) already compile to *real* generated WGSL via
  `buildGroupModule`/`groupToFunction` (`packages/procedural-wgsl/src/groups/`) at build time —
  **this is not a correctness bug**, a group-backed primitive is already indistinguishable from a
  hand-written one by the time it's registered. What's missing is a *type-level* marker
  distinguishing "this primitive's WGSL was authored by hand" from "this primitive's WGSL was
  compiled from a group" — which matters for the already-requested editor capability ("Functions
  representing group nodes must be decomposable into its components and editable upon request,"
  per `pending_issues.md`) — the editor needs to know a node *is* a group to offer "zoom in and
  edit" UX, not just that it happens to have a WGSL module.
- 138 `registerPrimitive` calls across ~91 files (`packages/graph/src/primitives/`) — each is a
  small, mechanical registration; migrating them is low-complexity-per-file, the real work is in
  the 3 dispatch files above and the 5 structural-node registrations that currently fake a module.

**Fix:**
1. Introduce the discriminated union:
   ```ts
   type PrimitiveImplementation =
     | { kind: 'wgsl-function'; moduleId: string; entry: string }
     | { kind: 'group'; definition: GroupDefinition }
     | { kind: 'host-input'; binding: HostBinding }
     | { kind: 'resource'; descriptor: ResourceDescriptor }
     | { kind: 'kernel'; stage: 'vertex' | 'fragment' | 'compute' }
     | { kind: 'command'; command: GpuCommandKind }
     | { kind: 'sink'; sink: PresentationSinkKind };
   ```
   `ResourceDescriptor`/`GpuCommandKind`/`PresentationSinkKind` are placeholders here —
   Foundations 2–4 define their real shapes. For F1.3, only `wgsl-function`, `group`, and `sink`
   need concrete definitions (they cover every primitive that exists today); the others can be
   `never`-typed stubs until their foundation lands, so the union compiles now without
   prematurely designing resource/kernel/command semantics this sub-milestone doesn't own.
2. Add `NodePrimitive.implementation: PrimitiveImplementation` alongside the existing `wgsl`
   field — **do not remove `wgsl` yet.** Make `wgsl` optional and derive it from `implementation`
   for `wgsl-function`/`group` kinds, so the 3 dispatch files can migrate one at a time without a
   flag-day cutover.
3. Migrate the 5 structural-node registrations (`buffer.persist`, `stage.vertex`,
   `stage.fragment`, `target.display`, `target.mesh`) to `kind: 'sink'` or a temporary
   `kind: 'command'` placeholder (whichever fits better per-node — `target.display`/`target.mesh`
   are sinks; `stage.vertex`/`stage.fragment` are more naturally kernels, but since `kernel`'s real
   shape is Foundation 3's job, park them as an explicit `kind: 'unmigrated-stage'` placeholder
   rather than guessing Foundation 3's design here). Delete their fake WGSL modules
   (`structural.ts`'s comment-only bodies) once nothing reads `.wgsl` for these nodes anymore.
4. Migrate `codegen.ts`, `groupCodegen.ts`, `emitGraphEval.ts` to branch on
   `implementation.kind` instead of assuming `.wgsl` exists — for `wgsl-function`/`group` kinds
   this is a direct rename of the existing code path; for `sink`/placeholder kinds, the dispatch
   should skip WGSL generation entirely (today it presumably already special-cases these via
   role metadata elsewhere — replace that special-casing with the direct `kind` check).

**Test gate:**
1. Every existing `wgsl-function` and `group`-backed primitive compiles to byte-identical WGSL
   before and after (this is a structural/type-level change, not a codegen behavior change).
2. The 5 structural nodes no longer have a registered WGSL module at all (confirm via a test that
   `getPrimitive('target.mesh').wgsl` is undefined, not a placeholder).
3. A new test proves the compiler's dispatch skips non-function/non-group kinds without
   attempting to link/resolve a WGSL module for them (this is the actual bug the fake-module
   workaround was hiding — today, does anything break if a structural node's placeholder module
   accidentally *were* linked? Verify this explicitly, since it's exactly the kind of silent
   failure the review is warning about).
4. `check` and `test` green for `graph`, `compiler`, `procedural-wgsl`, `runtime-webgpu`, full
   workspace.

**Out of scope:** designing `ResourceDescriptor`/`GpuCommandKind`/real kernel semantics (Foundation
2/3/4's job). Migrating `stage.vertex`/`stage.fragment` to a final `kind: 'kernel'` shape (parked
as a placeholder until Foundation 3 defines what a kernel actually is).

---

## F1.4 — Unify execution roots

**Goal:** replace `GraphDocument.outputs` + `GraphDocument.consumers` + role-metadata node
detection — three overlapping, already-reconciled-by-hand mechanisms — with one rule: exports
name reusable values, kernel/pass/sink nodes (per F1.3's `kind` tag) are the only execution roots.

**Verified current state:**
- `GraphDocument` has both `outputs: GraphOutput[]` and `consumers: ProceduralConsumer[]` as
  separate top-level fields (`packages/graph/src/types.ts:87-94`).
- `ProceduralConsumer.outputs: string[]` references `GraphOutput.name` by string — `consumers`
  already depends on `outputs` existing, which is itself a sign these were never truly
  independent concepts.
- **Direct, damning evidence of the conflation:** `PipelineStage = 'compute' | 'vertex' |
  'fragment' | 'mesh-gen'` (`packages/graph/src/types.ts:71`) — `'mesh-gen'` is listed as a
  pipeline *stage*, when it's actually a compute-kernel role or standard-library group, exactly
  matching the review's complaint verbatim. This isn't a hypothetical smell, it's a literal type
  definition in the shipped code.
- A *third*, parallel execution-root mechanism already exists: `isPipelineTarget`/`isMeshTarget`
  detect sink nodes via `metadata.role === 'pipelineTarget' | 'meshTarget'`
  (`packages/graph/src/pipeline.ts`, `packages/graph/src/meshTarget.ts`) — string-tag role
  detection, independent of both `outputs` and `consumers`.
- The project has *already* had to build reconciliation logic to paper over the drift between
  these three sources: `effectiveOutputs`/`effectiveConsumers`/`derivePipelineConsumers`
  (`packages/graph/src/pipeline.ts`) exist specifically because `outputs`/`consumers` can go
  stale relative to what's actually wired in the graph. I personally had to add a fourth,
  near-duplicate mechanism (`deriveMeshTargets`, parallel to `derivePipelinePresentations`) this
  session for `target.mesh`, and a local `augmentGraphForMeshGen` step to synthesize `outputs`
  entries on the fly because `sliceGraph` demands named outputs that `deriveMeshTargets` doesn't
  produce automatically — this sub-milestone is the fix for the exact friction I hit directly.
- `GraphDocument.consumers` is read in 6 files:
  `compiler/src/compileGraph.ts`, `graph/src/pipeline.ts`, `graph-editor/src/compiledWgsl.ts`,
  `graph-editor/src/irAdapter.ts`, `graph-editor/src/markup/printGraph.ts`,
  `graph-editor/src/graphCompileSignature.ts` — every one of the editor's major surfaces
  (compiled-WGSL view, IR adapter, markup export, compile-signature/caching) touches this, making
  this the **highest-stakes regression surface in the whole Foundation 1 plan.**
- `PipelineGraphPlan` hardcodes a fixed-chain node search: `findNode(doc, 'target.display')`,
  `findNode(doc, 'buffer.persist')` (`packages/runtime-webgpu/src/pipelineGraph.ts:189,215`),
  plus direct `.primitive !== 'stage.vertex'`/`'stage.fragment'` string checks — this can only
  ever recognize the one pipeline shape it was written for.

**Fix:**
1. Define the rule precisely: **exports** (`GraphDocument.outputs`, unchanged) name reusable
   values for APIs/groups/tests/external consumers. **Kernel/pass/sink nodes** (identified by
   F1.3's `implementation.kind`, not role-metadata strings) are the *only* execution roots —
   runtime execution is derived by walking backward from every reachable kernel/pass/sink node,
   full stop.
2. Retire `GraphDocument.consumers`/`ProceduralConsumer` as a *document-level* field. Anything it
   currently encodes (which pipeline stage consumes which output) is already derivable from the
   graph's own wiring once sink/kernel nodes carry their real `kind` — don't re-invent a parallel
   metadata channel, derive it.
3. Rewrite `PipelineGraphPlan`'s hardcoded search into the generic planner the review specifies:
   find sink/pass roots → derive ordered commands within each pass → derive resource read/write
   sets → validate hazards/stage constraints → topologically order passes → allocate resources →
   compile only reachable kernels → encode commands. No branch may reference `'target.display'`,
   `'buffer.persist'`, `'stage.vertex'`, `'stage.fragment'`, `'target.mesh'`, or any other specific
   primitive id by name — it should work for any current or future sink/kernel primitive purely
   from `implementation.kind` and graph wiring.
4. Update all 6 files reading `.consumers` to derive the same information from reachable
   kernel/pass/sink nodes instead — this is the actual migration work, one file at a time, with a
   parity test per file before moving to the next.
5. Provide a compatibility read path for existing serialized documents that still have a
   `consumers` array on disk (old saved graphs/samples) — parse and discard it, or fold it
   forward into the derived model once on load, so no user's saved work breaks.

**Test gate:**
1. **The highest-priority gate in this entire plan:** every already-shipped feature that
   currently depends on `consumers`/`outputs`/role-detection — image-pipeline preview, mesh-gen
   preview, compiled-WGSL view, markup export, graph validation, undo/redo compile-signature
   caching — produces **byte-identical output** on every existing bundled sample graph, before
   and after this migration. Not "looks right" — diffed against captured baseline output.
2. `effectiveOutputs`/`effectiveConsumers`/`derivePipelineConsumers`/`deriveMeshTargets` and their
   ilk are deleted, not just superseded — if the new unified model still needs a reconciliation
   step, that's a sign the unification isn't actually done.
3. A new test wires an entirely novel sink kind (invented for the test, not `target.display` or
   `target.mesh`) and proves the generic planner finds and executes it with zero code changes to
   the planner itself — the actual proof "no planner branch knows about planes, cube faces,
   vegetation, particles, or ShaderToy," per the review's own acceptance bar.
4. Loading an old saved document (pre-migration serialization, with a `consumers` array) still
   opens and behaves identically in the editor.
5. `check` and `test` green for every package, full workspace, with special attention to
   `graph-editor`'s test suite given it's the widest-touched consumer.

**Out of scope:** the generic resource/pass/hazard-validation model itself (Foundation 2) — this
sub-milestone only needs *enough* of a generic planner to replace the hardcoded chain-search, not
the full resource-lifetime/hazard model the review describes for Foundation 2.

---

## F1.5 — Structural `TypeRef`

**Goal:** replace the closed 20-value `DataType` string union with a structural type algebra
capable of integers, matrices, parameterized buffers/textures, and struct types — without
breaking any of the 138 currently-registered primitives.

**Verified current state:**
- `DataType` is a flat union of exactly 20 literal values across four categories:
  `ValueDataType` (`f32`/`vec2f`/`vec3f`/`vec4f`/`bool`), `ResourceDataType`
  (`image`/`mesh`/`audio`), `PipelineResourceType` (`geometry`/`varyings`/`texture`/
  `vertexBuffer`/`indexBuffer`/`renderTarget`/`bindGroup`/`storageBuffer`), and `ListDataType`
  (superseded by F1.1) — `packages/graph/src/types.ts:5-19`.
- **No integer types exist at all.** `packages/compiler/src/groupCodegen.ts` explicitly throws
  `'Group param mappings do not support integer schemas (i32 graph ports are out of scope)'` —
  this was a deliberate, acknowledged deferral, not an oversight.
- **No matrix types exist at all** — not even as an internal representation.
- Vectors are three separate hardcoded literals (`vec2f`/`vec3f`/`vec4f`), no width
  parameterization; the only "promotion" rule is a hardcoded vec2f→vec3f case, and — worth
  fixing regardless of the type-system question — **this exact rule is copy-pasted identically
  in three separate files**: `packages/runtime-webgpu/src/emitGraphEval.ts:108-114`,
  `packages/compiler/src/groupCodegen.ts:32-38`, `packages/runtime-cpu/src/evalGraph.ts:32-38`.
  Three independently-maintained copies of the same rule is a latent bug risk on its own,
  independent of whether `TypeRef` ever lands.
- Exhaustiveness-checked functions that must be updated for any new type value (confirmed via
  `_exhaustive: never` grep, all in `graph-editor`): `previewBuffers.ts::previewFamily()`,
  and via the `DataType`→WGSL mapping: `dataType.ts::dataTypeToWgsl()`. Five files total contain
  exhaustive DataType switches: `irAdapter.ts`, `graphValidation.ts`, `nodePaletteModel.ts`,
  `previewBuffers.ts`, `previewBackend.ts`.
- The WGSL↔DataType mapping is well-isolated in one small table
  (`packages/graph/src/dataType.ts:5-14`, `VALUE_TYPE_ALIASES`) — this is the *good* news: the
  self-describing-WGSL mechanism the review explicitly wants to keep is already a small, clean
  chokepoint, not scattered.
- `packages/schema` (TypeBox-based `TSchema`) is **already** a real, structural, composable type
  system — currently used only for primitive *params*, never for *ports*. This raises an open
  design question worth deciding explicitly rather than defaulting either way: should ports adopt
  the same TypeBox-based representation params already use (one shared structural-type engine),
  or does GPU-facing port typing (buffers, textures, storage access, usage flags) diverge enough
  from author-facing param typing (defaults, ranges, widgets) that they should stay deliberately
  separate systems? **Recommendation: decide this before writing any `TypeRef` code** — it
  materially changes whether F1.5 is "extend TypeBox" or "build a new parallel algebra."
- 138 primitive registrations only declare `dataType: 'f32'`-style port specs — mechanically
  simple to migrate per-file; the real complexity is entirely in the ~37 non-primitive files with
  actual dispatch logic.

**Fix:**
1. **First, resolve the TypeBox-reuse question above** — this is a real architectural fork, not
   a detail, and shouldn't be decided implicitly by whoever writes the first line of code.
2. Introduce `TypeRef` as the review specifies (scalar/vector/matrix/array/struct/buffer/texture/
   sampler/mesh/command discriminated union), **alongside** `DataType`, not replacing it yet. Add
   a canonical `DataType ↔ TypeRef` mapping so every existing primitive keeps working unchanged
   through a compatibility shim while new primitives can opt into the richer surface.
3. Consolidate the triplicated `promoteExpr()`/`coerceInputValue()` copies into one shared,
   `TypeRef`-aware promotion function used by all three call sites — this is worth doing even in
   isolation, since three drifting copies of the same rule is already a bug risk today.
4. Migrate the 5 exhaustive-switch files last, once `TypeRef` is proven via new primitives (don't
   touch working, shipped exhaustiveness checks until the new type surface has real test coverage
   behind it).
5. Decide integer and matrix support scope now that it's unblocked: at minimum, prove one new
   primitive using an integer port and one using a matrix type end-to-end (compiles, evaluates on
   CPU, runs on GPU) as the acceptance bar for "the closed type system problem is actually fixed,"
   not just "the union got bigger."

**Test gate:**
1. All 138 existing primitive registrations validate and compile identically via the
   `DataType ↔ TypeRef` compatibility shim — zero behavior change for anything that exists today.
2. The consolidated promotion function produces identical output to all three current copies for
   every existing promotion case (vec2f→vec3f), proving the consolidation is behavior-preserving,
   not just a refactor with new bugs.
3. A new test primitive using an integer port and a new test primitive using a matrix type both
   round-trip through evalCPU and compile to correct WGSL — the actual proof the closed-type
   problem is fixed.
4. The 5 exhaustiveness-check files compile with the new type surface present, with no behavior
   change for any existing `DataType` value.
5. `check` and `test` green for every package, full workspace — this sub-milestone touches the
   most files, so this is the widest gate in the plan.

**Out of scope:** designing the full WebGPU capability/validation model (adapter feature
negotiation, limits) — that's Foundation 2. Storage/texture *usage-flag inference from edges* —
Foundation 2 territory once resources are generic. Removing `DataType` entirely — it stays as a
convenience alias layer indefinitely, per the review's own "editor may display short aliases...
without storing the alias as the semantic type."

---

## Definition of done for Foundation 1

All five sub-milestones' test gates pass, plus:

- Every already-shipped, already-tested feature (image pipeline, mesh-gen preview, vegetation
  preview, geometry transforms, params-as-inputs, undo/redo, document save/load) produces
  identical behavior on its existing test suite and bundled sample graphs — verified by full
  `check`/`test`/`build` across the workspace, not spot-checked.
- The live planet renderer (`apps/scene-editor`) is never touched by this plan except through
  `CoordinateSpace`'s generalization (F1.2) — and even there, the 8 planet-specific values move
  to library registration with identical validation behavior, not a rewrite. If any change here
  risks `/scene`'s live rendering gates, stop and treat it as its own reviewed decision, per
  `AGENTS.md`.
- No new primitive/consumer/feature work lands in the *old* shape while this is in progress —
  every new primitive or consumer added during Foundation 1 should use the *new* contracts as
  they land, so the migration surface doesn't keep growing underneath the plan.
- A follow-up document exists (not written yet, deliberately — premature before Foundation 1
  proves the approach) sequencing Foundation 2 (generic resources/frame execution) the same way.

## What this document deliberately does not do

It does not propose starting Foundation 2, 3, or 4 — those depend on F1.3's primitive-kind tagging
and F1.4's unified execution roots landing first, per the dependency chain in the parent review.
It does not resolve the TypeBox-reuse question for you — that's flagged as a decision this plan
surfaces, not one it makes. It does not estimate calendar time — per this project's stated
priority, the gate is correctness and migration safety, not speed.
