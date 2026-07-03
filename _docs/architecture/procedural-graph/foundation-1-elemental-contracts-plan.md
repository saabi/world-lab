# Foundation 1 — freeze the elemental contracts: implementation plan

**Status:** proposed implementation plan, not yet approved · **Revision:** 7 (2026-07-03) —
incorporates six rounds of verified external review; see [Revision history](#revision-history) ·
**Parent:**
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

**Revision 7** incorporates a sixth verified external review, of revision 6. Every finding was
verified by directly triggering the exact code path in question:

- **`SinkInvocation` still had no field for the resolved dependency.** The prose claimed
  `deriveInvocation` "resolves the referenced output name... and that resolved port is what feeds
  slicing," but `SinkInvocation<T>` only had `{ sinkKind, nodeId, payload }` — generic compiler code
  can't reach a resolved port without interpreting a sink-specific, opaque `payload`. Added an
  explicit `dependencies: PortRef[]` field so slicing can consume it generically.
- **Per-node compatibility data (`{ type, stage, outputs }`) has no serialized home, and the
  obvious guess is wrong.** `SinkDefinition` is *static* primitive metadata (part of
  `PrimitiveImplementation`, registered once per primitive kind) — it cannot hold per-node data
  that differs across every `legacy.consumerSink`/`preview.fieldSink` instance. Worse, verified
  directly: `packages/graph-editor/src/irAdapter.ts:77-103`'s `replaceNodePrimitive` rebuilds
  `node.params` by copying only keys declared in the primitive's TypeBox `params` schema — any data
  stashed in `node.params` outside a real, declared schema is silently dropped on any primitive
  swap/resync. Fixed by requiring `legacy.consumerSink`/`preview.fieldSink` to declare a concrete
  TypeBox `params` schema for `type`/`stage`/`outputs`, storing this data in `node.params` like any
  other primitive parameter — not implied to live somewhere in `SinkDefinition`.
- **Calling `compileConsumers` once per legacy sink loses cross-consumer behavior, verified
  directly.** `compileGraph`'s `moduleUseCount`/`sharedSeen`/`sharedModuleIds`
  (`packages/compiler/src/compileGraph.ts:37-65`) are accumulated across *all* consumers within one
  call — a module used by two different legacy sinks would never be detected as shared if each sink
  triggers its own separate `compileConsumers(doc, [descriptor], resolver)` call. Fixed: collect
  every legacy invocation across the whole document first, then call `compileConsumers` once with
  the complete descriptor list, exactly matching today's batched behavior.
- **The v1/v2 document boundary was never actually typed, and `deserializeGraph` doesn't migrate.**
  Verified `deserializeGraph` (`packages/graph/src/serialize.ts:24-27`) is a bare
  `JSON.parse(json) as GraphDocument` — an unchecked cast, no version awareness, no migration. A
  single `GraphDocument` type cannot accurately describe both "requires `consumers`" (v1) and
  "`consumers` removed" (v2). Defined `GraphDocumentV1`/`GraphDocumentV2` explicitly;
  `deserializeGraph` now parses as `unknown`, branches on `version`, and returns a normalized,
  always-v2 result — migration is not a function bolted on the side, it's in the actual load path.
- **Output deletion must maintain compatibility-sink references, verified directly as an existing
  mechanism that will silently break.** `pruneOutputsAndConsumers`
  (`packages/graph-editor/src/irAdapter.ts:105-114`) already prunes `doc.consumers` entries
  referencing a deleted output today — post-migration this exact mechanism needs an equivalent for
  `preview.fieldSink`/`legacy.consumerSink` *nodes*, or routine node/port edits silently leave
  broken execution roots. Added to F1.4a's fix and gate explicitly.
- **Handler registration was asserted, never contracted.** "Runtime handlers are registered by
  `sinkKind`" appeared three times with no interface, registry, collision policy, or injection
  point ever defined. Defined a concrete `SinkHandlerRegistry`, and split it explicitly:
  compiler-side sink adapters (translate a `SinkInvocation` into a compile descriptor, live in
  `packages/compiler`) are a different registration from `runtime-webgpu` execution handlers
  (actually draw/dispatch) — conflating them was part of why this stayed vague.
- **The novel-sink-kind test contradicted F1.4a's own declared scope.** `PipelineGraphPlan` is
  explicitly scoped (by this plan's own prior revisions) to *only* understand the one fixed
  display-pipeline chain — it cannot "plan" an unfamiliar topology by design. Testing a novel sink
  kind against it was self-contradictory. Introduced an explicit, generic `discoverExecutionRoots`
  function (find every `kind: 'sink'` node, full stop) as the correctly-scoped target for that test;
  `PipelineGraphPlan` keeps its narrower, already-correct job.
- Added a requirement for an exhaustive `DataType → TypeRef` table (every value, including F1.1's
  renamed tuple types and pipeline-resource aliases) rather than leaving "real structural shape for
  everything else" as a vague aspiration implementers could fill in inconsistently.

**Revision 6** incorporates a fifth verified external review, of revision 5. The two high findings
are genuine architectural gaps in how the new sink-based execution model actually reconciles with
today's dependency-walking and compilation code — not documentation fixes:

- **`legacy.consumerSink`/`preview.fieldSink` have no edge-based dependency representation, verified
  directly.** `sliceGraph` (`packages/compiler/src/slice.ts:13-37`) walks backward from a resolved
  output's *port*, via edges (`edge.to.node === nodeId` → add `edge.from.node`) — it does not walk
  backward "from a sink node." A node whose only dependency information is a `payload.outputs`
  array of *string names* (no incoming edges at all) is invisible to that walk; "walk backward from
  every reachable sink node" doesn't hold for these two sink kinds as stated. Also true of
  `preview.fieldSink` accepting "any type" — primitives have statically-typed ports, there's no
  such thing as a port that accepts every type. Fixed by explicitly defining these two as
  **compatibility sinks**: non-edge roots whose `SinkDefinition.deriveInvocation` resolves the
  stored `GraphOutput` name references directly (the same resolution `sliceGraph` already does for
  `consumer.outputs` today), rather than relying on incoming edges like ordinary sinks.
- **The `legacy.consumerSink` → `compileGraph` bridge had no defined ownership or call path, and
  risked recursion.** `compileGraph` (`packages/compiler/src/compileGraph.ts:32-55`) *itself*
  reads `doc.consumers` directly and is one of the six files this plan already schedules to migrate
  onto sink-based discovery. If it becomes sink-discovery-based and its own legacy-sink handling
  tries to "call `compileGraph`," that's the same function calling itself. Also, a handler living
  in `packages/graph` cannot import `compileGraph` from `packages/compiler` without reversing that
  dependency. Fixed by extracting the actual per-consumer compilation work into a standalone,
  lower-level `compileConsumers(doc, descriptors, resolver)` operation in `packages/compiler`; the
  legacy-sink adapter (also in `compiler`, not `graph`) translates a resolved invocation into a
  descriptor and calls that operation directly — no self-reference, no reversed dependency.
- **`DataType → TypeRef` isn't actually total for underparameterized resource types.**
  `storageBuffer` carries no element/access/usage information at all
  (`packages/graph/src/types.ts:5-19`), but the review's own structural buffer type requires them
  (`elemental-webgpu-architecture-review.md:110`). There's no way to derive a properly-populated
  structural `TypeRef` from a bare string with none of that encoded. Added an explicit
  `{ kind: 'legacy'; alias: DataType }` escape-hatch variant so the mapping stays honestly total —
  every `DataType` gets *some* `TypeRef`, but underparameterized resource types get a passthrough
  placeholder, not a fabricated structural description. Real parametrization is Foundation 2's job.
- `PortSpecInput` (as written) only had `type`/`dataType` fields — every real registration also
  provides `name` and often `space`/`metadata`/`default`, which would cause excess-property errors
  against the type as literally specified. Fixed by intersecting with `Omit<PortSpec, 'type' | 'dataType'>`.
- **The all-or-nothing "document already has a real sink node, drop `consumers`" check was a real
  bug**, not just imprecise wording: a document can have a real `target.display` sink for one
  consumer entry *and* a separate, unrelated `'veg-compute'`-style entry with no matching real node
  at all. Checking "does this document contain any real sink node" and dropping the whole
  `consumers` array on a match would silently discard that second entry. Fixed to process each
  `consumers` entry independently — only entries with an already-existing matching sink are
  skipped; every other entry still gets migrated (structurally or via `legacy.consumerSink`).
- **`DEFAULT_PIPELINE_GEOMETRY_PARAMS` is `runtime-webgpu`-owned** (`packages/runtime-webgpu/src/pipelineVertex.ts:18`),
  but migration must run from `graph`, `compiler`, and `mcp-server`, none of which can depend on
  `runtime-webgpu` without inverting the dependency graph. Same shape of fix as the ID-minting
  relocation two rounds ago: define the canonical default in `packages/graph` (or a graph-owned
  constructor); `runtime-webgpu` references that constant instead of migration importing it.
- **`registerPrimitive`'s normalization wasn't the only registration entry point.** `replacePrimitive`
  (`packages/graph/src/registry.ts:6`) takes a fully-normalized `NodePrimitive` directly, bypassing
  the `NodePrimitiveInput` normalization added last round. Fixed to accept `NodePrimitiveInput` too,
  normalizing through the same shared function `registerPrimitive` uses.
- Defined `ShaderStage = 'vertex' | 'fragment' | 'compute'` explicitly (F1.3's `HostBinding.stages`
  referenced it without a definition) — deliberately distinct from the legacy `PipelineStage`, which
  also has the `'mesh-gen'` pseudo-stage this whole exercise is retiring.

**Revision 5** incorporates a fourth verified external review, of revision 4. The core correction
narrows F1.4a substantially — a real, welcome simplification, not just a fix:

- **Revision 4's migration registry proposed structurally synthesizing real pipeline nodes for
  consumer shapes that are not type-valid for those nodes, verified directly.** `stage.vertex`
  requires a `geometry`-typed `mesh` input (`packages/graph/src/primitives/pipeline/index.ts:26-28`);
  `target.mesh` requires *two* separate `vec3f` inputs, `position` and `normal`
  (`pipeline/index.ts:71-76`); no compute-stage primitive exists in the pipeline primitives at all.
  But `compileGraph.test.ts:42-47`'s `'vertex-pass'`/`'veg-compute'`/`'fragment-pass'` fixtures wire
  plain scalar `f32` outputs (`cg.height`/`cg.peaks`/`cg.albedo`, all `dataType: 'f32'`) — and
  `graph.test.ts`/`mcp-server`'s `'terrain-mesh'` fixture has exactly one `f32` output, not two
  `vec3f` ones. None of these can be wired into the real primitives without a type error or a
  silent behavior change. **Independently re-verified the one case revision 4 got right:**
  `effect.cosinePalette` (the actual value wired into `fullscreenFragment.test.ts`'s `'image'`
  consumer) genuinely outputs `vec4f` (`packages/graph/src/primitives/effect/cosinePalette.ts:14`),
  matching `stage.fragment`'s real `color: vec4f` port exactly — `'image'`/`'fragment'` *is* safely
  representable, when the wired output is actually `vec4f`. This also revealed that
  `ProceduralConsumer`'s compile-as-a-stage mechanism is inherently more type-permissive than the
  pipeline *primitives* — `compileGraph` will happily compile any output as any stage's entry point
  regardless of whether a real `stage.vertex`/`target.mesh` node could accept that type. Foundation
  1 should not paper over that gap with a coercion or a silent type change.
- **F1.4a's scope is now conservative, per the reviewed recommendation:** only `'preview'` (any
  type) and `'image'`/`'fragment'` (only when the wired output is verified `vec4f` at migration
  time, checked per-document, not assumed uniformly) get real structural node synthesis. Every
  other consumer shape — `'vertex-pass'`, `'fragment-pass'` with a non-`vec4f` output, `'veg-compute'`,
  `'terrain-mesh'`, and any future unknown type — becomes `legacy.consumerSink`, concretely defined
  as a thin bridge that delegates to the *existing*, already-working `compileGraph` consumer-
  compilation path (proven by `compileGraph.test.ts` today) rather than inventing new compilation
  logic. Canonical migration of these to real kernel/pass primitives is Foundation 3's job, once
  those primitives can actually represent arbitrary-typed stage entry points.
- `LegacyConsumerMigration`'s return type was `Node[]` — insufficient for the `'image'` migration,
  which needs nodes, the edges wiring them together, and potentially new `outputs` entries. Changed
  to return a `GraphMigrationPatch { nodes, edges, outputs? }`.
- **Migration needs a shared ID-minting facility outside `graph-editor`.** Deterministic node/edge
  ID generation (`mintNodeId`/`collectNodeIds`/`collectEdgeIds`) currently lives in
  `packages/graph-editor/src/graphIds.ts:12` — but migration must also run from `compiler` and
  `mcp-server` entry points, neither of which depends on `graph-editor` (verified: no
  `@world-lab/graph-editor` dependency in either package.json). Moved the canonical facility to
  `packages/graph`, which every consumer already depends on; `graph-editor` re-exports it for its
  existing call sites rather than owning a second copy.
- Added `NodePrimitiveInput` (F1.5) alongside `PortSpecInput` — without it, `registerPrimitive`'s
  own parameter type still required fully-normalized `PortSpec[]`, leaving the intended
  compatibility documentation-only at the actual TypeScript boundary.
- Strengthened F1.5's GPU acceptance gate — it claimed "runs on GPU" in the Fix section but the
  Test gate only required WGSL text generation and CPU evaluation, not an actual device compile.
  This is exactly the "green but not really" gap `execution-and-delegation.md`'s own gate-hardening
  rules exist to catch. Added a required device-level compile (matching the existing
  `wgslCompile.test.ts` pattern) for the new integer/matrix-typed test primitives.
- Moved `semantics` deduplication/canonical-ordering from a migration-time-only concern (F1.4a) to
  a general invariant of the field itself (F1.2) — a freshly-authored or MCP-imported v2 document
  needs the same guarantee, not just documents that happened to pass through v1→v2 migration.

**Revision 4** incorporates a third verified external review, of revision 3. Two findings
required correcting a claim this document had made — and repeated — incorrectly:

- **The consumer-type inventory claim was wrong, for the second time.** Revisions 2 and 3 both
  asserted, after a grep, that only `'preview'` and `'image'` consumer types exist anywhere in the
  codebase. This was false: `packages/compiler/src/compileGraph.test.ts:31-47` has
  `'vertex-pass'`/`'fragment-pass'`/`'veg-compute'` consumers (spanning `stage: 'vertex'`,
  `'fragment'`, and `'compute'` — all three `PipelineStage` values this document previously claimed
  were unused); `packages/graph/src/graph.test.ts:31` and `packages/mcp-server/src/index.test.ts:33`
  both have `type: 'terrain-mesh'`. At least **six** distinct consumer shapes exist, not two. Given
  this document's own research has now been wrong about this exact question twice, F1.4a's fix no
  longer treats "the registry enumerates every known type" as a safe assumption — the
  never-silently-discard fallback is the load-bearing safety net, not a backstop for hypotheticals.
- **Migrating an `image` consumer to just `stage.fragment` + `target.display` would not satisfy
  `PipelineGraphPlan` as it exists today.** Verified directly: `planPipelineGraph`
  (`packages/runtime-webgpu/src/pipelineGraph.ts:206-224`) unconditionally calls
  `findNode(doc, 'buffer.persist')` (line 215, throws if absent) and requires a geometry source
  wired to it, regardless of how the display/fragment target itself was resolved. But this doesn't
  mean today's consumer-only image fixtures are actually broken — `fullscreenFragment.ts`'s
  `resolveVertexAssembly` (lines 76-92) calls `planPipelineGraph` inside a `try/catch` specifically
  *because* "minimal fragment-only graphs still draw via the default 2×2 plane grid" (its own
  comment), falling back to `DEFAULT_PIPELINE_GEOMETRY_PARAMS` when the full chain isn't present.
  Migration needs to make this implicit runtime fallback an explicit, synthesized part of the v2
  document — not leave the gap for `PipelineGraphPlan`'s new kind-tag-based discovery to fall into.
- Added `PortSpecInput` (F1.5) so making `type: TypeRef` canonical doesn't require every existing
  `dataType`-only registration to fail type-checking before normalization can run.
- Generalized `HostBinding` (F1.3) from a closed ShaderToy-specific enum to a generic
  `{ context, key, stages? }` shape — the closed version repeated exactly the anti-pattern F1.2
  exists to fix elsewhere (baking domain-specific names into the core union instead of registering
  them as standard-library values), and conflated four genuinely different binding contexts
  (stage builtin, invocation-domain input, playback context, write-target context) into one shape.
- Corrected "kernel/pass/sink nodes are execution roots" (F1.4a) — `pass` is not a kind in F1.3's
  union and never was; only `sink` is a real, concrete execution-root kind during Foundation 1.
  `kernel` isn't either, yet — `stage.vertex`/`stage.fragment` stay `wgsl-function`/
  `legacy-structural` through Foundation 1, not `kernel`, which doesn't get a real shape until
  Foundation 3. The phrase now says what's actually true: sinks are Foundation 1's execution roots.
- Defined `SinkInvocation` concretely (F1.3) — it was referenced as `SinkDefinition`'s return type
  but never given a shape. Used a generic `{ sinkKind, nodeId, payload: T }` rather than another
  closed union, matching the same discipline just applied to `HostBinding`.
- Added migration determinism/idempotence requirements to F1.4a's test gate: identical output on
  repeated migration of the same document, a no-op on re-migrating an already-v2 document,
  collision-free synthesized IDs, and canonical/deduplicated `semantics` ordering.

**Revision 3** incorporates a second verified external review, of revision 2. Every finding was
independently re-checked against the plan text and the live code — including re-deriving the
reviewer's own citations from scratch — before acceptance:

- **F1.4a's deletion claim was wrong.** `deriveMeshTargets` (`packages/graph/src/meshTarget.ts:24-49`)
  extracts a *specific* shape — position/normal edges plus `gridSize`/`faceCount` params — that a
  generic `kind: 'sink'` tag cannot reproduce by itself; the same is true of
  `derivePipelinePresentations`'s image-pipeline shape. F1.3 now defines a concrete
  `SinkDefinition` interface (`deriveInvocation(doc, node): SinkInvocation | null`) so each sink
  *kind* supplies its own extraction logic; F1.4a's fix/gate no longer claims blanket deletion —
  these functions' logic is **rehomed** as `SinkDefinition` implementations, not deleted.
- **The v1→v2 migration needed a registry, not a single case.** Verified: the reviewer's specific
  citation ("existing fixtures include vertex, fragment, compute and terrain-mesh consumers") does
  not hold up — exhaustive grep found only two live consumer shapes, `type: 'preview'`
  (`graphBuilders.ts`'s `defaultPreviewGraph`) and `type: 'image', stage: 'fragment'`
  (`fullscreenFragment.test.ts`) — no vertex/compute/terrain-mesh consumer exists in the codebase
  today. But the underlying gap was still real: the `image`/`fragment` fixture is **also**
  sink-node-free, just like the preview case, and revision 2 only handled the preview shape by
  name. Replaced with a migration **registry** keyed by consumer `type`, covering both verified
  shapes, with unknown types preserved via a generic `legacy.consumerSink` (never silently
  discarded) rather than a single hardcoded special case.
- **F1.3 omitted an entire primitive category.** `host.fragCoord`/`host.iTime`/`host.iResolution`/
  `procedural.uv`/`procedural.metricPosition` are special-cased by literal primitive-id string
  check in `packages/runtime-webgpu/src/emitGraphEval.ts:234-260`, and `host.fragCoord`'s
  registered WGSL module is a verified placeholder (`packages/procedural-wgsl/src/modules/host/fragCoord.ts`:
  `return vec2f(0.0);`, a comment reading "the runtime injects fragment coordinates"). These are
  neither real `wgsl-function` primitives nor comment-only structural sinks — they're exactly the
  `host-input` kind F1.3 already proposed but treated as a deferred stub. `HostBinding` is now
  concretely defined and these five primitives are migrated to `kind: 'host-input'` as part of
  F1.3 itself, retiring the string-based dispatch instead of leaving it in place.
- **Structural nodes shouldn't be forced into `sink`/`command` before those kinds have a real
  shape.** `buffer.persist`, `stage.fragment`, and `geometry.fullscreenPlane` aren't presentation
  sinks (nothing is exported/shown) or GPU commands (they don't draw/dispatch) — calling them
  either asserts false final semantics ahead of Foundation 2/3's real resource/pass model. They now
  get an explicit, honestly-transitional `kind: 'legacy-structural'` instead. `target.display`/
  `target.mesh` **do** get real `kind: 'sink'` classifications, now that `SinkDefinition` gives
  them a concrete way to carry their existing derivation logic forward.
- **Group-registry ownership, pinned.** Adopted a `GroupResolver` interface in `packages/graph`
  with the standard-library implementation in `procedural-wgsl`, injected into compiler/editor
  contexts — verified this exactly mirrors the existing `WgslModuleResolver`/
  `createStandardLibraryResolver` pattern already in production
  (`packages/procedural-wgsl/src/resolver.ts`), rather than inventing a new convention.
- **F1.5 didn't say where `TypeRef` is stored.** Pinned an explicit contract: `PortSpec`/`Port`
  gain a `type: TypeRef` field; `dataType` becomes a deprecated authoring alias; v2 documents
  serialize canonical `TypeRef`.
- **Promotion consolidation was mis-specified as "one function."** Verified the three current
  implementations have genuinely different signatures — `promoteExpr(expr: string, ...): string`
  (WGSL text, in `compiler`/`runtime-webgpu`) versus `coerceInputValue(value: CpuValue, ...): CpuValue`
  (actual runtime values, in `runtime-cpu`) — these cannot literally merge into one function. Split
  into a shared `resolveCoercion(from, to): CoercionPlan` decision plus backend-specific
  `emitCoercion`/`applyCoercion` appliers.
- **F1.2's affected surfaces were undercounted.** `space`/`dataType` appear on four type
  definitions, not one: `Port` (`types.ts:33-41`), `PortSpec` (`primitive.ts:34-41`),
  `GroupInputMapping`, and `GroupOutputMapping` (`types.ts:96-114`) — plus node-port
  synchronization, serialization, and self-describing WGSL frontmatter metadata
  (`primitiveSources.ts`). F1.2's fix and gate now cover all of these, with an explicit round-trip
  test.

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
already being in place, so "sink nodes are execution roots" is a direct tag check, not another
string-based convention layered on the ones being retired.

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
- **`space`/`dataType` appear on four type definitions, not one** (verified by grep across
  `types.ts`/`primitive.ts`): the runtime `Port` instance type (`types.ts:33-41`), the primitive
  `PortSpec` template (`primitive.ts:34-41`), `GroupInputMapping`, and `GroupOutputMapping`
  (`types.ts:96-114`). `PortSpec` is a template; `Port` instances are derived from it when a node
  is created — all four need the same field change together, or `Port` instances desync from the
  `PortSpec` templates they're generated from. `space` is also rendered into self-describing WGSL
  frontmatter YAML (`primitiveSources.ts`) for documentation/inspection.

**Fix:**
1. Replace `CoordinateSpace` with two separate fields, applied consistently to **all four** type
   definitions above (`Port`, `PortSpec`, `GroupInputMapping`, `GroupOutputMapping`):
   - `space?: SpaceId` (`SpaceId = string`) — still singular, open instead of closed. A port is in
     exactly one coordinate frame; this stays a discriminant, not a set.
   - `semantics?: SemanticTag[]` (`SemanticTag = string`) — plural, for orthogonal properties
     (e.g. `"unit:m"`, `"color:linear-srgb"`) that can co-occur with a space or with each other.
     **Deduplicated and canonically (e.g. lexicographically) ordered whenever set** — this is a
     general invariant of the field itself, enforced at every write path (registration, node
     creation, deserialization, MCP-authored documents), not just a one-time migration-time cleanup
     for documents that happen to pass through v1→v2 migration.
2. Keep the exact-match-or-`'none'` validation rule for `space` unchanged initially — this
   sub-milestone is about openness, not a conversion graph. `semantics` starts unvalidated
   (informational/display-only) until a real need for semantic-tag validation surfaces.
3. Move the 8 existing planet-specific `space` values out of core registration and into
   library-registered constants (a `terrain`/`planet` module the terrain primitives import from).
4. **Decide the `contract.ts` question explicitly:** keep `space` in the swap-family contract
   string as today (preserves current swap behavior exactly); revisit only if a concrete need for
   cross-space swapping surfaces. `semantics` does not participate in swap-family contracts at all
   initially (it's additive metadata, not a mechanical-compatibility signal).
5. Update node-port synchronization (wherever a `Port` instance is created/rehydrated from its
   primitive's `PortSpec` — the node-creation and any node-repair/resync path) to copy both
   `space` and `semantics` across, not just `dataType`.
6. Update serialization (v1/v2 `GraphDocument` save/load) and the self-describing WGSL frontmatter
   parser/renderer (`primitiveSources.ts`) to read/write `semantics` alongside `space`.

**Test gate:**
1. All 30 existing `space` port declarations produce identical validation results on existing
   graphs (parity category 2: identical validation outcomes, not just "doesn't crash").
2. A new test registers a non-terrain `space` value (e.g. a hypothetical audio-domain frame) from
   outside `packages/graph`'s core and proves the core validates it correctly without knowing what
   it means.
3. A new test attaches `semantics: ['color:linear-srgb']` to a port alongside a `space` value on
   the *same* port, proving the two are independent and co-occur cleanly — the actual proof this
   is no longer a single collapsed tag.
4. **Round-trip gate:** a port's `space` and `semantics` survive node creation (`PortSpec` →
   `Port` sync), a full save→load cycle, and an explicit port-resynchronization pass, proving the
   fields propagate through every location identified above, not just `PortSpec` in isolation.
5. A test sets `semantics` with duplicate and out-of-order entries (e.g.
   `['unit:m', 'color:linear-srgb', 'unit:m']`) through each write path (registration, node
   creation, deserialization) and asserts the stored/serialized result is always deduplicated and
   canonically ordered — proving this is a standing invariant, not a migration-only cleanup.
6. `check` and `test` green for `graph`, `graph-editor`, full workspace.

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
- **`DataType → TypeRef` is not actually total for underparameterized resource types, verified.**
  `storageBuffer` (and similarly `texture`) carry no element type, access mode, or usage flags at
  all in the current `DataType` union (`packages/graph/src/types.ts:5-19`), but the parent review's
  own structural buffer type requires exactly that information
  (`elemental-webgpu-architecture-review.md:110`). There is no way to derive a properly-populated
  structural `TypeRef` from a bare string carrying none of it.
- **Where canonical `TypeRef` lives, previously unspecified:** `PortSpec` and `Port` gain a
  `type: TypeRef` field; `dataType: DataType` becomes a deprecated authoring alias, not a second
  source of truth. v2 `GraphDocument`s serialize canonical `TypeRef`; authoring APIs and
  compatibility helpers may continue accepting `dataType` and derive `type` from it via the F1.5
  mapping.
- **The three promotion implementations have genuinely different signatures, not just duplicated
  logic:** `promoteExpr(expr: string, fromType, toType): string` (`compiler/groupCodegen.ts`,
  `runtime-webgpu/emitGraphEval.ts`) transforms a **WGSL expression string** at codegen time;
  `coerceInputValue(value: CpuValue, fromType, toType): CpuValue` (`runtime-cpu/evalGraph.ts`)
  transforms an **actual runtime value**. These cannot literally be merged into one function — the
  codegen backends operate on text, the CPU evaluator operates on values.

**Fix:**
1. Introduce `TypeRef` as the parent review specifies (scalar/vector/matrix/array/struct/buffer/
   texture/sampler/mesh/command discriminated union), **alongside** `DataType`, not replacing it —
   plus one addition the review doesn't need but this migration does: a `{ kind: 'legacy'; alias:
   DataType }` escape-hatch variant, so `storageBuffer`/`texture` and any other underparameterized
   resource `DataType` still get *some* `TypeRef` without fabricating element/access/usage
   information that doesn't exist yet. Real structural parametrization of these is Foundation 2's
   job; `legacy` keeps the F1.5 mapping honestly total in the meantime.
2. Add a **one-directional-total, one-directional-partial** mapping, not a general bidirectional
   one: `DataType → TypeRef` is total (every existing `DataType` value has a canonical `TypeRef` —
   `legacy` for underparameterized resource types, a real structural shape for everything else) —
   **pin this as an exhaustive table, every one of the 20+ `DataType` values (including F1.1's
   renamed `tuple<T>` variants) named explicitly**, not "a real structural shape for everything
   else" left as a description implementers fill in independently and inconsistently;
   `TypeRef → DataType` is a **partial, optional** "display alias" lookup that only succeeds for
   `TypeRef` values that happen to correspond to an existing `DataType` (a `TypeRef` describing an
   arbitrary struct, a parameterized buffer, or a specific texture format has no legacy string to
   map back to, and must not be forced into one).
3. Add `type: TypeRef` to `PortSpec` and `Port` as the canonical, always-populated field — but not
   as a field every call site must provide directly. Making `type` required immediately would fail
   every one of the 138 existing `dataType`-only registrations before normalization can run. Split
   the authoring/storage shapes — and intersect with the rest of `PortSpec`'s fields, not just
   `type`/`dataType`, since every real registration also provides `name` and often
   `space`/`metadata`/`default`:
   ```ts
   type PortSpecInput = Omit<PortSpec, 'type' | 'dataType'> &
     ({ type: TypeRef; dataType?: DataType } | { type?: never; dataType: DataType });

   interface PortSpec {
     type: TypeRef; // canonical, always present after normalization
     dataType?: DataType; // deprecated authoring alias
   }
   ```
   This alone isn't sufficient at the actual registration boundary — `registerPrimitive`'s own
   parameter type must accept the input shape too, or callers providing bare `dataType`-only
   literals still fail type-checking against a `NodePrimitive` whose `inputs`/`outputs` are typed
   as fully-normalized `PortSpec[]`. `replacePrimitive` (`packages/graph/src/registry.ts`) is a
   second registration entry point that must go through the same normalization, not just
   `registerPrimitive`:
   ```ts
   interface NodePrimitiveInput extends Omit<NodePrimitive, 'inputs' | 'outputs'> {
     inputs: PortSpecInput[];
     outputs: PortSpecInput[];
   }

   function normalizePrimitiveInput(input: NodePrimitiveInput): NodePrimitive; // shared

   function registerPrimitive(input: NodePrimitiveInput): void; // calls normalizePrimitiveInput
   function replacePrimitive(input: NodePrimitiveInput): void; // calls normalizePrimitiveInput too
   ```
   Both `registerPrimitive` and `replacePrimitive` accept `NodePrimitiveInput` and normalize through
   the same shared `normalizePrimitiveInput` (deriving `type` from `dataType` via the F1.5 mapping
   when only `dataType` was given) — not two independently-maintained normalization paths. Existing
   primitives need no source changes; new primitives may declare `type` directly. Serialized v2
   `Port` instances always contain `type`.
4. Split promotion into a shared decision plus backend-specific appliers, not one function:
   - `resolveCoercion(from: TypeRef, to: TypeRef): CoercionPlan | null` — the single, shared
     decision of *whether* a promotion is legal and *what* it means (e.g. "pad with a zero Z
     component"), used by all three call sites.
   - `emitCoercion(plan: CoercionPlan, expr: string): string` — the WGSL-text applier, replacing
     both `promoteExpr()` copies.
   - `applyCoercion(plan: CoercionPlan, value: CpuValue): CpuValue` — the runtime-value applier,
     replacing `coerceInputValue()`.
5. Migrate the 5 exhaustive-switch files last, once `TypeRef` is proven via new primitives.
6. Prove one new primitive using an integer port and one using a matrix type end-to-end (compiles,
   evaluates on CPU, runs on GPU) as the acceptance bar for "the closed type system is actually
   fixed," not just "the union got bigger."
7. Add the narrow TypeBox-compatible conversion (scalar/vector/struct value schemas only) as a
   separate, explicitly-scoped helper — not a general bridge, per the resolved question above.

**Test gate:**
1. All 138 existing primitive registrations validate and compile identically via the
   `DataType → TypeRef` mapping and the derived `type` field (parity category 1/2 as applicable) —
   zero behavior change.
2. `resolveCoercion` + `emitCoercion` produce identical WGSL text to both current `promoteExpr()`
   copies for every existing promotion case; `resolveCoercion` + `applyCoercion` produce identical
   values to `coerceInputValue()` for the same cases — proving the split is behavior-preserving on
   both backends, not just one.
3. A new test primitive using an integer port and one using a matrix type both round-trip through
   `evalCPU`, compile to correct WGSL, **and pass an actual device-level compile** (the
   `wgslCompile.test.ts` pattern this package already uses elsewhere) — WGSL text generation and a
   green CPU eval alone are not sufficient; invalid generated WGSL passes both and fails only on
   GPU, exactly the gap `execution-and-delegation.md`'s own gate-hardening rules exist to catch.
4. A test proves `TypeRef → DataType` correctly returns "no alias" for a `TypeRef` shape that has
   no legacy equivalent (e.g. a struct type), rather than throwing or guessing.
5. A test proves `storageBuffer`/`texture` map to `{ kind: 'legacy', alias: ... }` rather than a
   fabricated structural shape, and that this round-trips back through the partial `TypeRef →
   DataType` alias lookup correctly.
6. A test proves `replacePrimitive` normalizes a `dataType`-only `NodePrimitiveInput` identically
   to `registerPrimitive` — both call the same `normalizePrimitiveInput`, not two copies.
7. An exhaustiveness test (`_exhaustive: never`-style) fails to compile if any current or future
   `DataType` value is missing from the `DataType → TypeRef` table — proving it's a real, checked
   mapping, not documentation implementers can drift from.
8. `check` and `test` green for every package, full workspace.

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
- **`buffer.persist`, `stage.fragment`, and `geometry.fullscreenPlane` don't fit `sink` or
  `command` either** — none of them present/export anything (not sinks) or issue a GPU draw/dispatch
  (not commands). Asserting either classification now would assign false final semantics ahead of
  Foundation 2/3's real resource/pass model. `target.display`/`target.mesh` **are** genuine
  presentation sinks and get `kind: 'sink'` — see the `SinkDefinition` design below for how they
  keep their existing derivation logic.
- **A fourth, previously-unaddressed category: host/procedural primitives dispatched by string
  ID.** `host.fragCoord`, `host.iTime`, `host.iResolution`, `procedural.uv`, and
  `procedural.metricPosition` are each special-cased by literal `node.primitive === '...'` checks
  in `packages/runtime-webgpu/src/emitGraphEval.ts:234-260`, bypassing normal WGSL dispatch to
  inject a host-provided runtime value (e.g. `body.push(... opts.fragCoordExpr ?? 'position.xy' ...)`).
  Their registered WGSL modules are **verified placeholders**, not real functions:
  `packages/procedural-wgsl/src/modules/host/fragCoord.ts`'s entire body is
  `fn frag_coord() -> vec2f { return vec2f(0.0); }`, with its own comment reading "the runtime
  injects fragment coordinates." These are exactly the `host-input` kind already proposed in the
  union below — they must not be left as a deferred stub while their string-based dispatch
  survives untouched.
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
- **Existing precedent for exactly this kind of registry, verified:** `packages/procedural-wgsl/src/resolver.ts`
  already implements `WgslModuleResolver` (`{ resolve(moduleId): Promise<WgslModule> }`, defined in
  `packages/compiler`) via `createStandardLibraryResolver`, injected into `compiler`, `graph-editor`,
  and `runtime-webgpu` call sites. A `GroupResolver` following the identical shape is not a new
  convention, just the same one applied to groups.
- **`target.mesh`'s sink-invocation shape, verified:** `deriveMeshTargets`
  (`packages/graph/src/meshTarget.ts:24-49`) extracts wired `position`/`normal` input edges plus
  `gridSize`/`faceCount` node params into a `MeshTargetDescriptor` — a shape specific to mesh
  preview, not derivable from "this node is a sink" alone. Any generic sink model needs a place for
  this kind of per-sink-kind extraction logic to live.
- 138 `registerPrimitive` calls across ~91 files — each is a small, mechanical registration.

**Fix:**
1. Introduce the discriminated union:
   ```ts
   type PrimitiveImplementation =
     | { kind: 'wgsl-function'; moduleId: string; entry: string }
     | { kind: 'group'; groupId: string }
     | { kind: 'host-input'; binding: HostBinding }
     | { kind: 'legacy-structural'; marker: string }
     | { kind: 'sink'; sink: SinkDefinition }
     | { kind: 'resource'; descriptor: ResourceDescriptor }
     | { kind: 'kernel'; stage: 'vertex' | 'fragment' | 'compute' }
     | { kind: 'command'; command: GpuCommandKind };
   ```
   Note `{ kind: 'group'; groupId: string }` — a reference, not an embedded `GroupDefinition`.
   `ResourceDescriptor`/`GpuCommandKind` are placeholders (Foundations 2–4 define their real
   shapes, now informed by `TypeRef` from F1.5); `wgsl-function`, `group`, `host-input`,
   `legacy-structural`, and `sink` need concrete definitions now, since they cover every primitive
   that exists today.
2. Define `HostBinding` concretely, but **generically** — not as a closed enum of ShaderToy-specific
   names, which would bake domain-specific vocabulary into the core union exactly the way `F1.2`
   is removing planet-specific vocabulary from `CoordinateSpace`. The five current bindings span
   four genuinely different binding *contexts* — `fragCoord` is a shader-stage builtin, `iTime` is
   playback/frame-clock context, `iResolution` is write-target context, and `procedural.uv`/
   `metricPosition` are invocation-domain inputs — a flat `{source: 'fragCoord' | 'iTime' | ...}`
   union would flatten that structure away:
   ```ts
   // Distinct from legacy PipelineStage ('compute' | 'vertex' | 'fragment' | 'mesh-gen') — no
   // 'mesh-gen' pseudo-stage here; that conflation is exactly what F1.4a retires.
   type ShaderStage = 'vertex' | 'fragment' | 'compute';

   interface HostBinding {
     context: 'invocation' | 'stage-builtin' | 'playback' | 'write-target' | 'read-resource' |
       'interaction' | 'session';
     key: string;
     stages?: ShaderStage[];
   }
   ```
   The five current bindings become **standard-library-registered values** of this generic shape
   (e.g. `{ context: 'stage-builtin', key: 'fragCoord', stages: ['fragment'] }` for `host.fragCoord`,
   `{ context: 'playback', key: 'iTime' }` for `host.iTime`), not permanent core enum members —
   consistent with F1.2's own resolution of the same category of problem. Migrate `host.fragCoord`,
   `host.iTime`, `host.iResolution`, `procedural.uv`, and `procedural.metricPosition` to
   `kind: 'host-input'` with the matching `binding`. Their placeholder WGSL modules are removed once
   `emitGraphEval.ts` dispatches on `implementation.kind === 'host-input'` and `binding.context`/
   `binding.key` instead of `node.primitive === '...'` string checks — this retires the string-based
   dispatch finding 3 (of the second review round) identified, not just adds a new enum alongside it.
3. Define `SinkDefinition` and `SinkInvocation` concretely, so generic sink *discovery* (via
   `kind: 'sink'`) can coexist with per-sink-kind *invocation extraction* (which is genuinely
   different per sink, as `deriveMeshTargets` vs. the image pipeline's presentation derivation
   shows) without display and mesh invocations forcing yet another closed union:
   ```ts
   interface SinkInvocation<T = unknown> {
     sinkKind: string;
     nodeId: string;
     dependencies: PortRef[]; // generic — what this invocation needs, resolvable without
                              // interpreting `payload`
     payload: T; // shape owned by whichever handler is registered for sinkKind
   }

   interface SinkDefinition {
     kind: string; // e.g. 'display', 'meshPreview'
     deriveInvocation(doc: GraphDocument, node: Node): SinkInvocation | null;
   }
   ```
   `dependencies` is the fix for a real gap: without it, generic code (slicing, compilation) would
   need to interpret a sink-specific, opaque `payload` just to find out what a sink depends on,
   defeating the point of a common `SinkInvocation` shape. `deriveInvocation` always populates it,
   whether the dependency comes from a real incoming edge (ordinary sinks) or a resolved output-name
   reference (compatibility sinks, below) — callers needing "what does this feed on" never touch
   `payload` at all; only the registered handler for that `sinkKind` does.

   **`SinkDefinition` is static, per-primitive metadata — it cannot hold per-node data, verified as
   a real gap, not just a wording one.** `SinkDefinition` lives on `PrimitiveImplementation`,
   registered once per primitive kind, exactly like `WgslSourceRef` today. `{ type, stage, outputs }`
   (F1.4a's compatibility-sink payload) is different *per node instance* — it cannot live in
   `SinkDefinition` at all. It must be **node-instance data**, stored in `node.params` like any
   other primitive parameter, and — critically — declared through a **real TypeBox `params`
   schema** for `preview.fieldSink`/`legacy.consumerSink`, not ad-hoc untyped keys. Verified why
   this matters: `packages/graph-editor/src/irAdapter.ts:77-103`'s `replaceNodePrimitive` rebuilds
   `node.params` by copying only keys present in the (possibly new) primitive's declared TypeBox
   schema (`paramKeys(primitive.params)`) — anything stored outside a declared schema key is
   silently dropped on any primitive swap or resync. `deriveInvocation` reads this data from
   `node.params` (via the schema), not from anywhere in `SinkDefinition`.
   
   Migrate `target.display` to `kind: 'sink'` with a `SinkDefinition` whose `deriveInvocation` is
   `derivePipelinePresentations`'s per-node logic, ported (not reimplemented), with `payload`
   carrying today's presentation shape; migrate `target.mesh` the same way, porting
   `deriveMeshTargets`'s existing position/normal/gridSize/faceCount extraction into its
   `deriveInvocation`'s `payload`. Generic code walks `implementation.kind === 'sink'` to *find*
   sink nodes; each sink's own `deriveInvocation` still supplies its specific payload shape and
   populates `dependencies`.

   **Ordinary sinks vs. compatibility sinks — two different dependency-discovery mechanisms, not
   one.** `target.display`/`target.mesh` have real, statically-typed input *ports*; their
   dependency subgraph is found the normal way, by following incoming *edges* (the same backward
   walk `sliceGraph` already does — `packages/compiler/src/slice.ts:13-37` — from a resolved port),
   and `deriveInvocation` populates `dependencies` from those edges. `preview.fieldSink` and
   `legacy.consumerSink` (F1.4a) are different: their `node.params` (per the schema above) carries
   an output name reference, with no incoming edge at all — there's no such thing as a port that
   "accepts any type," which is what a real, edge-wired input on these sinks would need to be.
   These two are **compatibility sinks**: their `deriveInvocation` resolves the referenced output
   name directly (the same name-to-port resolution `sliceGraph` already performs for
   `consumer.outputs` today), populating `dependencies` with the resolved port rather than reading
   it off an edge. Root discovery still starts from `implementation.kind === 'sink'`; which
   mechanism `deriveInvocation` uses to populate `dependencies` (edge-walk vs. params-based
   name-resolution) is sink-kind-specific and invisible to generic callers.
4. Define a concrete **sink-handler registration contract** — "handlers are registered by
   `sinkKind`" was previously asserted with no interface, registry, collision policy, or injection
   point. Split by concern, since compiling a sink's WGSL and actually executing/rendering it are
   different responsibilities living in different packages:
   ```ts
   interface SinkCompilerAdapter {
     sinkKind: string;
     toConsumerDescriptor(invocation: SinkInvocation): ProceduralConsumer; // compiler-side
   }
   interface SinkHandlerRegistry<TAdapter> {
     register(adapter: TAdapter): void; // throws on duplicate sinkKind, matching
                                         // registerPrimitive's existing collision behavior
     get(sinkKind: string): TAdapter | undefined;
   }
   ```
   `SinkCompilerAdapter`s (compiler-side, in `packages/compiler`) translate a `SinkInvocation` into
   a `ProceduralConsumer` descriptor for `compileConsumers` (F1.4a) — this is what
   `legacy.consumerSink`'s bridge actually is. Runtime execution handlers (`runtime-webgpu`,
   actually drawing/dispatching a resolved sink) are a *separate* registry, not the same mechanism —
   conflating "compile this" and "execute this" under one registration was part of why this stayed
   vague.
5. Give `buffer.persist`, `stage.fragment`, and `geometry.fullscreenPlane` the explicit
   `kind: 'legacy-structural'` marker instead of forcing them into `sink` or `command` — these
   three don't have a well-defined final kind until Foundation 2/3's resource/pass model exists.
   `stage.vertex` stays `kind: 'wgsl-function'` (excluded from this group, per the verified-state
   note above).
6. Add a **`GroupResolver`** interface in `packages/graph`, mirroring the existing
   `WgslModuleResolver`/`createStandardLibraryResolver` pattern (`packages/procedural-wgsl/src/resolver.ts`)
   exactly:
   ```ts
   interface GroupResolver {
     resolve(groupId: string): Promise<GroupDefinition>;
   }
   ```
   Implement `createStandardLibraryGroupResolver` in `packages/procedural-wgsl`, populated from the
   compiled group values already produced there (e.g. `TRANSFORM_SPHERIFY_GROUP`). Inject the
   resolver into compiler/editor contexts exactly as `WgslModuleResolver` already is — no global
   startup-order dependence, no new dependency direction (`graph` still doesn't import
   `procedural-wgsl`; `procedural-wgsl` implements `graph`'s interface, same as today).
7. Add `NodePrimitive.implementation: PrimitiveImplementation` alongside the existing `wgsl` field
   — do not remove `wgsl` yet. Make it optional and derive it from `implementation` for
   `wgsl-function`/`group` kinds, so the 3 dispatch files migrate one at a time.
8. Migrate `codegen.ts`, `groupCodegen.ts`, `emitGraphEval.ts` to branch on `implementation.kind`.

**Test gate:**
1. Every existing `wgsl-function` and `group`-backed primitive compiles to byte-identical WGSL
   before and after (parity category 1).
2. `buffer.persist`/`stage.fragment`/`geometry.fullscreenPlane` carry `kind: 'legacy-structural'`
   and no longer have a registered WGSL module; `target.display`/`target.mesh` carry `kind: 'sink'`
   with a working `SinkDefinition.deriveInvocation` that reproduces today's
   `derivePipelinePresentations`/`deriveMeshTargets` output exactly; `stage.vertex` keeps its real
   WGSL module and is unaffected; the five `host-input` primitives no longer have a placeholder
   WGSL module and no longer require a primitive-id string check in `emitGraphEval.ts`.
3. A new test proves the compiler's dispatch skips non-function/non-group kinds without
   attempting to link/resolve a WGSL module for them.
4. A new test proves the group registry resolves `groupId` correctly for the editor's "expand
   group" path without `packages/graph` importing `packages/procedural-wgsl` — check this via a
   dependency-direction assertion (e.g. a lint/import-graph check), not just behavior.
5. A new test proves `SinkDefinition.deriveInvocation` for `target.mesh` produces identical
   `MeshTargetDescriptor` output to today's `deriveMeshTargets` on every bundled mesh sample.
6. A test proves `deriveInvocation` always populates `SinkInvocation.dependencies` — for an
   ordinary sink (`target.display`) from its real incoming edge, for a compatibility sink from its
   resolved output-name reference — and that generic slicing code consumes `dependencies` directly
   without ever inspecting `payload`.
7. A test proves `preview.fieldSink`/`legacy.consumerSink` declare a real TypeBox `params` schema
   for their `{ type, stage, outputs }` data, and that `replaceNodePrimitive`-style resync
   (`packages/graph-editor/src/irAdapter.ts`) preserves this data across a primitive swap — the
   concrete regression case for the static-`SinkDefinition`-vs-per-node-data fix above.
8. A test proves `SinkHandlerRegistry.register` throws on a duplicate `sinkKind`, matching
   `registerPrimitive`'s existing collision behavior, and that compiler-side `SinkCompilerAdapter`
   registration is independent of any `runtime-webgpu` execution-handler registration.
9. `check` and `test` green for `graph`, `compiler`, `procedural-wgsl`, `runtime-webgpu`, full
   workspace.

**Out of scope:** designing `ResourceDescriptor`/`GpuCommandKind`/real kernel semantics
(Foundation 2/3/4). Migrating `stage.vertex`/`stage.fragment`/the `legacy-structural` nodes to
their final Foundation 2/3 kind.

---

## F1.4a — Unify execution roots + migrate legacy documents

**Goal:** replace `GraphDocument.outputs` + `GraphDocument.consumers` + role-metadata node
detection with one rule — exports name reusable values, **sink** nodes (per F1.3's `kind` tag) are
the only execution roots during Foundation 1 — **and** ship a real `GraphDocument` schema migration
so no existing saved graph silently loses its execution roots. (Not "kernel/pass/sink": `pass` is
not a kind in F1.3's union, and `kernel` doesn't get a real shape until Foundation 3 —
`stage.vertex`/`stage.fragment` stay `wgsl-function`/`legacy-structural` throughout Foundation 1.
Only `sink` is a concrete execution-root kind right now.) Root *discovery* is uniform (find every
`kind: 'sink'` node); dependency *resolution* is not — ordinary sinks resolve via incoming edges,
the two compatibility sinks this milestone introduces (`preview.fieldSink`, `legacy.consumerSink`,
per F1.3's compatibility-sink distinction) resolve via `deriveInvocation` name lookups instead, per
F1.3. This is **not** Foundation 4: it does not build a generic resource/hazard-validation planner,
only generic *root discovery* for today's one pipeline shape.

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
- **Legacy documents with no sink/kernel node at all — at least six distinct shapes, corrected
  after being wrong twice.** Revisions 2 and 3 both claimed, after a grep, that only `'preview'`
  and `'image'` consumer types exist. Verified wrong: `packages/compiler/src/compileGraph.test.ts:31-47`
  has three more — `'vertex-pass'` (`stage: 'vertex'`), `'fragment-pass'` (`stage: 'fragment'`),
  `'veg-compute'` (`stage: 'compute'`) — and `packages/graph/src/graph.test.ts:31` plus
  `packages/mcp-server/src/index.test.ts:33` both have `type: 'terrain-mesh'`. That's six confirmed
  shapes across all three `PipelineStage` values this document previously claimed were unused, on
  top of `defaultPreviewGraph()` (`packages/graph-editor/src/graphBuilders.ts:131-158`, `'preview'`,
  zero sink nodes) and `fullscreenFragment.test.ts:65-86` (`'image'`/`'fragment'`, also zero sink
  nodes). Given this document's own research has been incomplete on this exact question twice, the
  migration cannot rely on "the registry enumerates every known type" — the never-silently-discard
  fallback is the actual safety net, not a backstop for hypothetical future types only.
- **Migrating a sink-node-free `image`/`fragment` consumer to just `stage.fragment` +
  `target.display` would not satisfy `PipelineGraphPlan` as it exists today, verified directly.**
  `planPipelineGraph` (`packages/runtime-webgpu/src/pipelineGraph.ts:206-224`) unconditionally calls
  `findNode(doc, 'buffer.persist')` (throws if absent) and requires a geometry source wired to it —
  regardless of how the display/fragment target itself was resolved. This isn't a hypothetical
  break, though: `fullscreenFragment.ts`'s `resolveVertexAssembly` (lines 76-92) already calls
  `planPipelineGraph` inside a `try/catch`, whose own comment says why — *"minimal fragment-only
  graphs still draw via the default 2×2 plane grid"* — falling back to
  `DEFAULT_PIPELINE_GEOMETRY_PARAMS` when the full chain isn't present. Today's behavior for these
  graphs is already "no explicit geometry chain, use an implicit default" — migration needs to make
  that implicit default an **explicit, synthesized** part of the v2 document, not leave a gap for
  the new kind-tag-based discovery to fall into.
- **Most of the six confirmed consumer shapes are not type-valid for real pipeline nodes, verified
  directly — this narrows what Foundation 1 can safely synthesize.** `stage.vertex` requires a
  `geometry`-typed `mesh` input (`packages/graph/src/primitives/pipeline/index.ts:26-28`);
  `target.mesh` requires two separate `vec3f` inputs, `position` and `normal` (`index.ts:71-76`);
  no compute-stage primitive exists in the pipeline primitives at all. But
  `compileGraph.test.ts:31-47`'s `'vertex-pass'`/`'veg-compute'`/`'fragment-pass'` fixtures wire
  plain scalar `f32` outputs, and the `'terrain-mesh'` fixture has exactly one `f32` output, not
  two `vec3f` ones — none of these can be wired into the real nodes without a type error or a
  silent behavior change. **Independently re-verified the one case that does work:**
  `effect.cosinePalette` (the value actually wired into `fullscreenFragment.test.ts`'s `'image'`
  consumer) genuinely outputs `vec4f` (`packages/graph/src/primitives/effect/cosinePalette.ts:14`),
  matching `stage.fragment`'s real `color: vec4f` port exactly. `ProceduralConsumer`'s
  compile-as-a-stage mechanism is inherently more type-permissive than the pipeline primitives —
  `compileGraph` will compile any output as any stage's entry point regardless of whether a real
  `stage.vertex`/`target.mesh` node could accept that type. Foundation 1 must not paper over that
  gap with a coercion or a silent type change.
- **Deterministic ID minting lives in the wrong package for migration to use it everywhere
  migration needs to run.** `mintNodeId`/`collectNodeIds`/`collectEdgeIds`
  (`packages/graph-editor/src/graphIds.ts:12`) currently live in `graph-editor`, but migration must
  also run from `compiler` and `mcp-server` entry points — neither depends on `graph-editor`
  (verified: no `@world-lab/graph-editor` dependency in either package.json), and adding one would
  be backwards (editor is a consumer of these packages, not a peer utility provider).
- **`compileGraph` reads `doc.consumers` directly and is one of the six files scheduled to migrate
  onto sink-based discovery — the legacy-sink bridge cannot just "call `compileGraph`" without
  risking self-reference.** Verified directly: `compileGraph`
  (`packages/compiler/src/compileGraph.ts:32-55`) reads `opts.consumers ?? doc.consumers`, then
  per-consumer calls `sliceGraph` + `generateWgsl` inline — there is no standalone, callable
  "compile this one descriptor" operation today, only the whole-document entry point. If that same
  entry point becomes sink-discovery-based and its own legacy-sink handling invokes itself, that's
  recursive self-reference. Also, a handler living in `packages/graph` cannot import from
  `packages/compiler` without reversing the dependency graph.
- **`DEFAULT_PIPELINE_GEOMETRY_PARAMS` has the same package-boundary problem as ID minting, one
  level deeper.** It's defined in `packages/runtime-webgpu/src/pipelineVertex.ts:18`, but the
  `'image'` migration (below) needs to reference it when synthesizing a default `geometry.plane`
  node, from `graph`/`compiler`/`mcp-server` contexts that cannot depend on `runtime-webgpu`.
- **The v1/v2 document boundary has never actually been typed, and today's load path doesn't
  migrate anything, verified directly.** `deserializeGraph`
  (`packages/graph/src/serialize.ts:24-27`) is `JSON.parse(json) as GraphDocument` — an unchecked
  cast with no version branching. A single `GraphDocument` TypeScript type cannot accurately
  describe both "requires `consumers`" (v1) and "`consumers` removed" (v2) at once.
- **Output deletion already has a pruning mechanism today that must be extended, not just
  replaced.** `pruneOutputsAndConsumers` (`packages/graph-editor/src/irAdapter.ts:105-114`) already
  removes `doc.consumers` entries referencing a deleted output whenever a node's ports change.
  Once `consumers` is retired, this exact editor mutation path needs an equivalent for
  `preview.fieldSink`/`legacy.consumerSink` *nodes* — otherwise routine node/port edits silently
  leave broken execution roots referencing a since-deleted output.

**Fix:**
1. Define the rule: **exports** (`GraphDocument.outputs`, unchanged) name reusable values.
   **Sink nodes** (via F1.3's `implementation.kind === 'sink'`) are the only execution roots during
   Foundation 1 — runtime execution derives from walking backward from every reachable sink node.
   (`kernel` and `pass` become additional root kinds once Foundations 3 and 4 respectively give
   them real shapes; neither exists as a concrete kind yet.)
2. Move the canonical, deterministic ID-minting facility (`mintNodeId`/`collectNodeIds`/
   `collectEdgeIds`, or a re-derived equivalent) into `packages/graph`, which every consumer
   already depends on. `graph-editor` re-exports it for its existing call sites rather than owning
   a second copy — migration code (wherever it's homed) and every other package uses this one
   facility, not a duplicate. Do the same for a canonical default geometry constant: define it (or
   a graph-owned constructor producing it) in `packages/graph`; `runtime-webgpu`'s
   `DEFAULT_PIPELINE_GEOMETRY_PARAMS` references that canonical value instead of migration needing
   to import from `runtime-webgpu`.
3. **Extract a standalone `compileConsumers` operation in `packages/compiler`, so the
   `legacy.consumerSink` bridge has something to call that isn't `compileGraph` calling itself:**
   ```ts
   export async function compileConsumers(
     doc: GraphDocument,
     descriptors: ProceduralConsumer[],
     resolver: WgslModuleResolver
   ): Promise<GraphCompileResult>; // the per-descriptor sliceGraph + generateWgsl loop, extracted
   ```
   `compileGraph` (kept temporarily for pre-migration `doc.consumers` compatibility) becomes a thin
   wrapper: `compileConsumers(doc, opts.consumers ?? doc.consumers, resolver)`. The
   `legacy.consumerSink` compiler adapter (`SinkCompilerAdapter`, per F1.3) — living in
   `packages/compiler`, not `packages/graph`, so the dependency direction never reverses —
   translates each resolved `SinkInvocation`'s preserved `{ type, stage, outputs }` payload into a
   `ProceduralConsumer` descriptor. **Critically, this collection happens once across the whole
   document before compiling anything:** discover every `legacy.consumerSink`/`preview.fieldSink`
   node, resolve each to a descriptor, collect them into one list, and call
   `compileConsumers(doc, allDescriptors, resolver)` a single time — not once per sink. Calling it
   per-sink would reset `compileConsumers`' shared-module bookkeeping (`moduleUseCount`/
   `sharedModuleIds`) on every call, so a module used by two different legacy sinks would never be
   detected as shared, a real behavioral regression from today's batched-all-consumers-together
   `compileGraph`. Both the legacy `doc.consumers` path and the new sink-based path delegate to the
   same underlying batched operation; neither calls the other.
4. **Type the v1/v2 boundary explicitly — a single `GraphDocument` cannot describe both:**
   ```ts
   interface GraphDocumentV1 extends /* today's shape */ { version: '1'; consumers: ProceduralConsumer[] }
   interface GraphDocumentV2 extends /* new shape */ { version: '2' } // no consumers field
   type GraphDocument = GraphDocumentV2; // the canonical, forward-looking alias

   function migrateGraphDocument(doc: GraphDocumentV1 | GraphDocumentV2): GraphDocumentV2;
   ```
   `deserializeGraph` stops being a bare cast — it parses as `unknown`, checks `version`, and
   returns `migrateGraphDocument`'s normalized result:
   ```ts
   function deserializeGraph(json: string): GraphDocumentV2 {
     const parsed = JSON.parse(json) as GraphDocumentV1 | GraphDocumentV2; // still needs runtime
                                                                            // shape validation,
                                                                            // not just a cast —
                                                                            // out of scope here,
                                                                            // tracked as existing debt
     return migrateGraphDocument(parsed);
   }
   ```
   Migration is in the actual load path now, not a function that exists but nothing calls.
5. **Introduce `GraphDocument` schema version 2** and an explicit v1→v2 migration function.
   Migrations return a patch, not bare nodes — a single node is insufficient for shapes needing
   wiring between multiple synthesized nodes:
   ```ts
   interface GraphMigrationPatch {
     nodes: Node[];
     edges: Edge[];
     outputs?: GraphOutput[];
   }
   type LegacyConsumerMigration = (consumer: ProceduralConsumer, doc: GraphDocument) => GraphMigrationPatch;
   ```
   **Scope the registry conservatively — only synthesize real structural nodes where the wired
   type is actually valid for them, checked per-document, not assumed uniformly:**
   ```ts
   const LEGACY_CONSUMER_MIGRATIONS: Record<string, LegacyConsumerMigration> = {
     preview: /* synthesize a preview.fieldSink node wired from consumer.outputs[0] — any type is
              valid for a generic field-preview sink */,
     image: /* only if the wired output's type is verified vec4f: synthesize the full chain —
              geometry.plane (using the canonical graph-owned default geometry from step 2 above,
              not runtime-webgpu's DEFAULT_PIPELINE_GEOMETRY_PARAMS directly) -> buffer.persist ->
              stage.vertex -> stage.fragment -> target.display, wired from consumer.outputs. This makes today's
              runtime fallback (resolveVertexAssembly's try/catch default) an explicit, permanent
              part of the migrated document. If the wired type is NOT vec4f (a malformed/synthetic
              edge case), fall through to the legacy.consumerSink path below instead of forcing it. */
   };
   ```
   Every other consumer type — `'vertex-pass'`, `'fragment-pass'` when its output isn't `vec4f`,
   `'veg-compute'`, `'terrain-mesh'`, and any type not in the registry at all — migrates to a
   generic **`legacy.consumerSink`** node (`kind: 'sink'`, per F1.3) carrying `{ type, stage,
   outputs }` verbatim as its `SinkDefinition`'s `payload`. Its runtime handler is the thin
   `compileConsumers`-calling bridge from step 3 above — it does not invent new compilation logic,
   it re-homes the existing, proven mechanism behind the new sink-based root-discovery model.
   Canonical migration of these shapes to real kernel/pass primitives is Foundation 3's job, once
   those primitives can represent arbitrary-typed stage entry points — not Foundation 1's.
   - **Unknown consumer types are never silently discarded — this is the primary safety net, not a
     backstop, given this document's own consumer-type research has been wrong twice.** Any
     `consumers` entry whose `type` isn't specifically handled above becomes `legacy.consumerSink`
     too, by the same mechanism. Failing the migration outright is not an acceptable alternative —
     it would turn any consumer type this plan's own research missed (already twice) into a hard
     failure for real user documents.
   - **Process every `consumers` entry independently — not "does this document contain any real
     sink node."** A document can have a real `target.display` sink satisfying one entry (e.g. an
     `'image'`-shaped one) *and* a separate, unrelated entry (e.g. `'veg-compute'`) with no matching
     real node at all. Checking "does the document already have a real sink node" once and, if so,
     dropping the entire `consumers` array would silently discard that second entry. Migration
     checks each entry for an already-existing matching sink individually: only entries that
     already have one are skipped; every other entry is migrated (structurally or via
     `legacy.consumerSink`) regardless of what the document's other entries look like. The
     `consumers` array as a whole is only dropped once every one of its entries has been accounted
     for, either by an existing node or a migration result.
   - Keep graph-schema versioning (`GraphDocument.version`) and artifact/serialization-format
     versioning as separate concerns — a schema-version bump does not imply every serialized
     artifact (e.g. exported markup) changes shape for unrelated reasons.
6. **Extend output-deletion pruning to compatibility-sink nodes.** `pruneOutputsAndConsumers`
   (`packages/graph-editor/src/irAdapter.ts:105-114`) already prunes `doc.consumers` entries
   referencing a deleted output whenever a node's ports change. Add the v2 equivalent to the same
   mutation path: when an output a `preview.fieldSink`/`legacy.consumerSink` node's `params`
   references is deleted, either update that node's reference (if a replacement is unambiguous) or
   remove the node — never leave it silently referencing a name that no longer resolves. This is a
   routine editor operation (deleting a port, swapping a primitive), not just a migration-time
   concern; it must work correctly going forward, on every v2 document.
7. Build a **fixture corpus** covering: every bundled sample graph in `graphBuilders.ts`;
   `'preview'` and genuinely-`vec4f` `'image'`/`'fragment'` (both get real structural synthesis);
   `'vertex-pass'`, non-`vec4f` `'fragment-pass'`, `'veg-compute'`, `'terrain-mesh'` (all get
   `legacy.consumerSink`); and at least one hand-written document with a deliberately-unknown
   consumer `type` (also `legacy.consumerSink`). Migrate each through v1→v2 and assert: for the
   structurally-synthesized shapes, the same rendered/compiled output as before migration (and for
   `image`/`fragment` specifically, that `PipelineGraphPlan` succeeds on the migrated document
   *without* relying on `resolveVertexAssembly`'s try/catch fallback); for the `legacy.consumerSink`
   shapes, that `compileConsumers` (via the `legacy.consumerSink` bridge) still executes them
   identically to today's `compileGraph`.
8. Retire `GraphDocument.consumers`/`ProceduralConsumer` as a live authoring field once migration
   is proven — new documents are always v2, authored without `consumers`.
9. Update the 6 files reading `.consumers` (including `compileGraph` itself, now a thin wrapper
   over `compileConsumers` per step 3) to read post-migration v2 documents instead, one file at a
   time, with a parity test per file.
10. Add an explicit, generic **`discoverExecutionRoots(doc: GraphDocument): Node[]`** function —
    find every `kind: 'sink'` node, full stop, independent of what pipeline shape (if any) they
    participate in. This is deliberately separate from `PipelineGraphPlan`.
11. Narrow planner change only: teach `PipelineGraphPlan` to discover today's fixed pipeline shape
    (geometry → persist → vertex → fragment → display) by walking `implementation.kind` tags
    instead of hardcoded primitive-id strings — using `discoverExecutionRoots` for the sink-finding
    part, then applying its own, still-fixed-shape logic on top. **Do not** attempt to generalize
    `PipelineGraphPlan` beyond this one shape — a planner for arbitrary sink/kernel topologies needs
    the resource/hazard model Foundation 2/3 don't provide yet; that generalization is Foundation 4.
    `discoverExecutionRoots` itself is already fully generic — it's `PipelineGraphPlan`'s *planning*
    step, not root discovery, that stays scoped to the one known shape.

**Test gate:**
1. Every already-shipped feature depending on `consumers`/`outputs`/role-detection — image-pipeline
   preview, mesh-gen preview, compiled-WGSL view, markup export, graph validation, undo/redo
   compile-signature caching — matches its **appropriate** parity category per the taxonomy above:
   byte-identical WGSL for compiled shader text; pixel-equivalent for rendered previews; canonical
   v2 serialization (not byte-identical v1 text) for markup export; a browser visual gate for the
   bundled samples. Not one blanket "byte-identical" claim across all of these.
2. The full fixture corpus migrates v1→v2 with no silent loss of execution roots: the
   structurally-synthesized shapes (`'preview'`, `vec4f`-`'image'`) produce identical output to
   before migration; the `legacy.consumerSink`-routed shapes (`'vertex-pass'`, non-`vec4f`
   `'fragment-pass'`, `'veg-compute'`, `'terrain-mesh'`, unknown types) still execute correctly via
   the bridge to `compileConsumers`; the `image`/`fragment` fixture specifically proves
   `PipelineGraphPlan` succeeds without needing `resolveVertexAssembly`'s try/catch fallback.
3. A test with at least two `legacy.consumerSink`-routed entries sharing a common upstream module
   proves that module is correctly detected as shared (`sharedModuleIds`) after migration — the
   concrete regression case for the batched-`compileConsumers` fix above; calling it per-sink would
   fail this test.
4. A test proves `compileGraph` (pre-migration `doc.consumers` path) and the `legacy.consumerSink`
   bridge (post-migration sink-based path, called once with the complete descriptor list) both call
   `compileConsumers` and produce identical `GraphCompileResult`s for the same descriptor set —
   proving the extraction removed the recursion risk without changing either path's behavior.
5. A test proves a document with a real `target.display` sink *and* a separate, unrelated
   `legacy.consumerSink`-routed entry migrates both correctly — neither entry is dropped because
   the other's real node already existed, the concrete regression case for the per-entry-processing
   fix above.
6. A test proves `deserializeGraph` correctly branches on `version` and returns a normalized
   `GraphDocumentV2` for both v1 and v2 input, and that `GraphDocumentV1`/`GraphDocumentV2` are
   distinct enough at the type level that code assuming v2's shape (no `consumers`) doesn't
   type-check against a v1 value without going through `migrateGraphDocument` first.
7. A test proves deleting an output referenced by a `preview.fieldSink`/`legacy.consumerSink`
   node's `params` updates or removes that node (mirroring `pruneOutputsAndConsumers`'s existing
   behavior for `doc.consumers`) rather than leaving a dangling reference — exercised as a routine
   editor mutation, not just a migration-time concern.
8. `effectiveOutputs`/`effectiveConsumers`/`derivePipelineConsumers`/`deriveMeshTargets` are
   **rehomed**, not deleted outright — their logic now lives inside the corresponding
   `SinkDefinition.deriveInvocation` implementations from F1.3 (`deriveMeshTargets`'s exact
   position/normal/gridSize/faceCount extraction becomes `target.mesh`'s `deriveInvocation`), and
   the standalone reconciliation functions are removed once nothing calls them directly anymore.
9. A new test wires a novel sink kind (invented for the test, with its own trivial
   `SinkDefinition`) and proves **`discoverExecutionRoots`** finds it via `implementation.kind`
   alone — not `PipelineGraphPlan`, which by its own declared scope only understands the one fixed
   display-pipeline shape and cannot "plan" an unfamiliar topology. This proves root *discovery* is
   generic without asking the fixed-shape planner to do something outside its scope.
10. Loading an old v1 saved document still opens and behaves identically after migration.
11. **Migration determinism and idempotence:** migrating the same v1 document twice (independently,
    not caching the first result) produces identical node/edge IDs and identical serialized output
    both times; migrating an already-v2 document is a no-op (byte-identical output); synthesized
    node/edge IDs are proven collision-free against every existing ID in the document being
    migrated (using the relocated `packages/graph` ID facility from step 2 above).
12. `check` and `test` green for every package, full workspace, with special attention to
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
