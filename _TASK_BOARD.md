# Task board — procedural-graph parallel work

Routable tasks for parallel agents. Each row points at a brief (the contract) and a
disjoint set of owned files so independent tasks run safely in parallel.

Protocol: claim the first UNCLAIMED task by editing its `Claimed by:` line; stay inside
your `Owns:` files; the brief is the contract. **Gate = `check` AND `test`** for every
package you touch (vitest alone is not enough — `tsc`/svelte-check must pass too), keep all
prior tests green, and for WGSL output do a validity check. Commit your task as its own
stage commit (`git add -A` your scope incl. new test files — `git status` must show nothing
untracked in your scope before `DONE`). ⚠ visual tasks: paste a screenshot of the
confirmed behaviour. PATH: `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"`.
Tabs; verbatimModuleSyntax. See `_docs/architecture/procedural-graph/execution-and-delegation.md` §Gate hardening.

**Status/ownership split (no split responsibility on one edit):** `Status: DONE <hash>` is
set **only on this file's row for your task**, in the **same stage commit** as your code —
this file is the single place task status lives. **Never edit a standalone brief `.md` under
`briefs/`** (not even a status line) — those are orchestrator-only, always, including marking
them done; editing one there and not committing it (or vice versa) is exactly the drift this
rule exists to prevent. The orchestrator commits briefs/README/pending_issues.

Coordinate only on shared files (e.g. `GraphEditor.svelte`): note who owns the shared edit.
The critical *dependency chain* stays serialized — never start a task whose prerequisite
is still open.

---

## Active

- **F2.3 — runtime resource realization** (Foundation 2, milestone 3 of 5 — see
  `_docs/architecture/procedural-graph/foundation-2-generic-resources-plan.md` — bind-group layout
  derivation deliberately deferred to Foundation 3, see brief's Context)
  Brief: `_docs/architecture/procedural-graph/briefs/F2.3-runtime-resource-realization.md`
  Owns: `packages/runtime-webgpu/src/frameGraph/realize.ts` (new) and its test file
  Claimed by: · Status: · Recommended executor: Cursor or Codex

Outstanding (not blocking): F1.4a's two new bundled samples (`migration-default-preview`,
`migration-fullscreen-fragment`) still need a human browser check per its own gate item 3.

## Done (recent)

- **F2.2 — resource dependency planner** — `397af7f` · `ResourceTarget` generalized to a
  discriminated union (`BufferResourceTarget`/`TextureResourceTarget`, shape/size correlation
  enforced, samplers excluded — all proven via `@ts-expect-error` compile checks in one test);
  `ResourceRead.version` replaces `previousFrame`, newly validated by a new
  `invalid-history-read` issue kind (rejects a `'previous'` read against anything but a
  `history`-lifetime target); `collectFeedbackTargets` corrected to count only `history`-lifetime
  targets (not `persistent`, and no longer auto-including the display target — display retention
  confirmed still handled by `computeLifetimes`'s existing special case, tested directly);
  `resolveBufferSizes` added parallel to `resolveTargetSizes`; `collectResourceInstances`
  materializes `ResourceInstance`s from a real `GraphDocument`, following `executionRoots.ts`'s
  exact pattern; `Pass.bindings` reserved and proven inert. Test suite covers every gate item
  precisely, including the corrected (not merely renamed) chain-graph feedback assertion. Full
  workspace check/test/build green.
  Brief: `_docs/architecture/procedural-graph/briefs/F2.2-resource-dependency-planner.md`

- **F2.1 — generic resource type algebra** — `04f5319` · `ResourceTemplate`/`ResourceInstance`
  (id-less template on the primitive, `id: node.id` only on the materialized instance — fixes
  confirmed via `@ts-expect-error` compile-time tests, not just runtime assertions);
  `ResourceAccess`/`ResourceBinding` with `resolveBufferUsage`/`inferBufferUsage` as the actual
  callable APIs the additive-usage gate needed; real `BufferUsageFlag` union. Test suite covers
  every gate item precisely, including both the excess-property and missing-property
  `@ts-expect-error` proofs for the ownership split. Full workspace check/test/build green.
  Brief: `_docs/architecture/procedural-graph/briefs/F2.1-resource-type-algebra.md`

- **F1.4a — unify execution roots + migrate legacy documents** — `48ea451` · **final
  milestone in Foundation 1.** `discoverExecutionRoots` (sink nodes as the only execution root,
  full stop); real `GraphDocumentV1`/`GraphDocumentV2` typing plus runtime shape validation in
  `deserializeGraph` (stronger than the gate required — a bare unchecked cast was explicitly
  accepted as debt, fixed anyway); `migrateGraphDocument` processes every `consumers` entry
  independently via `consumerAlreadyRepresented` (checks the *actual derived invocation*, not
  just "does any sink exist"), correctly gates `'image'` migration on every referenced output
  being `vec4f` with a `legacyMigration` fallback otherwise; `compileConsumers` extracted from
  `compileGraph` and `legacyConsumerDescriptors` collects every legacy-sink invocation *before*
  one batched compile call — proven by a test reusing the exact historical fixture whose
  shared-module bug the review process found, confirming `sharedModuleIds` still detects
  cross-consumer sharing after migration; `pruneOutputsAndCompatibilitySinks` correctly handles
  both `preview.fieldSink` (whole-node removal) and `legacy.consumerSink` (partial multi-output
  array pruning, full removal only at zero remaining); two new bundled samples
  (`migration-default-preview`, `migration-fullscreen-fragment`) bundle the exact sink-free
  legacy shapes needed to visually re-verify both migration paths, per standing instruction —
  **their browser visual check (the brief's own gate item 3) is still outstanding**, everything
  else (code review + full check/test/build) is verified clean.
  Brief: `_docs/architecture/procedural-graph/briefs/F1.4a-unify-execution-roots.md`

- **F1.3 — discriminated primitive-implementation union + group registry** — `d2db00e` ·
  `PrimitiveImplementation` union with all 8 kinds; removed all ten fake WGSL modules
  (`structural.ts`'s 5 + 5 host/procedural files); `target.display`/`target.mesh` migrated to
  `kind: 'sink'` by genuinely sharing code (`presentationForDisplay`/`meshTargetForNode`
  extracted once, called by both the old and new mechanisms — not reimplemented);
  `SinkHandlerRegistry<TAdapter>` cleanly splits compiler-side `SinkCompilerAdapter` from
  runtime-webgpu's `SinkExecutionHandler`; `GroupResolver`/`createStandardLibraryGroupResolver`
  mirror the existing `WgslModuleResolver` pattern exactly, no new `graph`→`procedural-wgsl`
  dependency; the sequencing gap found during the contract pass (F1.3's own gate referenced
  `preview.fieldSink`/`legacy.consumerSink`, which don't exist until F1.4a) was correctly fixed
  with a test-only `test.compatibilitySink` primitive, proving per-node sink data survives
  `replace-node-primitive` resync and `dependencies` resolves by name rather than by edge.
  Brief: `_docs/architecture/procedural-graph/briefs/F1.3-primitive-implementation-union.md`

- **F1.5 — `TypeRef` compatibility layer** — `129d35e` · exhaustive `dataTypeToTypeRef`
  (total) + partial `typeRefToDataType`, `dataTypeToWgsl` elegantly refactored to route through
  the new machinery rather than staying a parallel system; coercion split into
  `resolveCoercion`(`graph`)/`emitCoercion`(`compiler`)/`applyCoercion`(`runtime-cpu`), each
  backend's `promoteExpr`/`coerceInputValue` correctly replaced; `PortSpecInput`/
  `NodePrimitiveInput` normalize through one shared `normalizePrimitiveInput` that correctly
  subsumes (not duplicates) F1.2's semantics dedup, proven by a test combining both concerns;
  new integer + matrix test primitives round-trip through `evalCPU`, generate correct WGSL, and
  pass a real device compile *and* compute-pipeline creation (`typeRefDeviceCompile.test.ts`,
  stronger than the gate required); narrow TypeBox conversion correctly scoped to
  scalar/vector/struct, confirmed rejecting buffer.
  Brief: `_docs/architecture/procedural-graph/briefs/F1.5-typeref-compatibility-layer.md`

- **F1.2 — open coordinate spaces + add semantic tags** — `3768ae2` · `SpaceId`/`SemanticTag`
  as open strings, `CoordinateSpace` kept as a deprecated alias; `dedupeCanonicalSemantics`
  enforced at every write path (registration, node creation, serialize/deserialize, WGSL
  frontmatter parsing); `PLANET_SPACES` constants module; removed `primitiveLoader.ts`'s
  hardcoded `COORDINATE_SPACES` closed-set gate entirely (a third enforcement point beyond the
  type and `validate.ts`, found during the contract pass); consolidated three independent
  `instantiatePorts` copies (`nodePortUtils.ts`, `primitiveEditor.ts`, `parseGraphMarkup.ts`)
  into one canonical, exported function — beyond the brief's ask, but a real drift-risk fix;
  `contract.ts`'s swap-family string confirmed byte-identical for every registered primitive,
  `semantics` confirmed absent from it.
  Brief: `_docs/architecture/procedural-graph/briefs/F1.2-open-spaces-semantics.md`

- **F1.1 — rename static `list<T>` to `tuple<T>`** — `b36f864` · clean rename across all
  brief-listed files plus two call sites Codex found beyond the brief's own list
  (`validate.ts`'s `multiple-inputs` check, `emitGraphEval.ts`'s `isValueType` guard); slice
  offsets correctly adjusted for the new 6-char prefix; new regression test proves mixed
  storage-buffer + scalar edges into one `tuple<f32>` port still take the static path and
  correctly reject the type mismatch (dispatch behavior unchanged, as required). Zero
  remaining `list<` references confirmed by direct grep.
  Brief: `_docs/architecture/procedural-graph/briefs/F1.1-tuple-rename.md`

- **Extract a reusable instanced-mesh-draw consumer** — `c5a5927` · new
  `renderInstancedMesh` consumer with caller-owned instance buffers + configurable instance
  layout; vegetation preview migrated with no behavior change.
  Brief: `_docs/architecture/procedural-graph/briefs/M-instanced-mesh-draw-extraction.md`

- **Mesh preview UX: wireframe toggle + orbit camera** — `9d1e8e5` · panel-owned
  orbit camera (drag/scroll/pinch) + wireframe toggle; runtime line-list wireframe pass
  with deduped edge indices and cached mesh buffers; default view unchanged until interaction.
  Brief: `_docs/architecture/procedural-graph/briefs/M-mesh-preview-ux.md`

- **Editor accessibility Phase C** — `009f97f` · `tabindex` + `aria-label` on input/output
  ports; Enter/Space opens existing `PortConnectMenu` (same matches as right-click).
  Brief: `_docs/architecture/procedural-graph/briefs/M-editor-a11y-phase-c.md`

- **Fix mesh-gen GPU path silent CPU fallback** — `b16f0aa` · synthetic `graph.outputs` for
  mesh-gen module slicing; dual position/normal subgraph merge; `console.warn` before CPU
  fallback; per-output WGSL entries (`plane_normal`, etc.) for independent normal ports.
  Brief: `_docs/architecture/procedural-graph/briefs/M-mesh-gen-gpu-output-fix.md`

- **Editor accessibility Phase B** — `06e710b` · focus-trap action (Tab wrap, mount focus, restore on destroy);
  applied to DocumentList name/delete dialogs + NodeSwapMenu + PortConnectMenu; Escape wired on
  DocumentList dialogs (previously missing).
  Brief: `_docs/architecture/procedural-graph/briefs/M-editor-a11y-phase-b.md`

- **Geometry transforms, Slice B** — `f56f309` · `transform.translate`/`scale` as vector-op groups;
  `transform.rotate` extracts `planeGridEulerRotate` + WGSL parity; **Mesh — Rotated plane**
  sample for visual gate.
  Brief: `_docs/architecture/procedural-graph/briefs/M-geometry-transforms-slice-b.md`

- **`target.mesh` sink + live graph-driven mesh preview** — `704e1d1` · `target.mesh` primitive
  (`meshTarget` role), `deriveMeshTargets`/`resolveMeshPreviewRequest`, mesh preview pane reads
  the live graph via `MeshGenRequest` (empty state when unwired; legacy surface toggle removed).
  Brief: `_docs/architecture/procedural-graph/briefs/M-mesh-target-sink.md`

- **Graph-driven mesh-gen consumer** — `82f5a8b` · `surface.cubeFace` primitive + `evaluateMeshGenCpu` /
  `executeMeshGen`; `surface.cubeFace → transform.spherify` decomposition matches
  `surface.cubeSphere`; mesh preview uses graph path (cube-sphere tab uses decomposed graph).
  Brief: `_docs/architecture/procedural-graph/briefs/M-mesh-gen-consumer.md`

- **Geometry transforms, Slice A** — `ec84b01` · `math.normalize` atomic primitive +
  `transform.spherify` / `transform.normalDisplace` group-backed transforms; evalCPU +
  WGSL parity tests; plane-grid spherify CPU gate.
  Brief: `_docs/architecture/procedural-graph/briefs/M-geometry-transforms-slice-a.md`

- **Umami analytics for webgputoy** — `d8084a8` · env-gated `injectUmami`/`track` parity
  with scene-editor; zero tracking when `PUBLIC_UMAMI_*` unset (verified on localhost:5173).
  Brief: `_docs/architecture/procedural-graph/briefs/M-webgputoy-umami.md`

- **Toolbar reorg** — `b1c1409` · undo/redo grouped with file actions; header Delete + `»`
  toggle removed; canvas sidebar gains a Selection section with Delete.
  Brief: `_docs/architecture/procedural-graph/briefs/M-toolbar-reorg.md`

- **Colorlab harvest Slice B (`color.chromaticAdapt`)** — `522e31a` · Bradford von Kries
  adaptation primitive with D65/D50 input defaults, evalCPU + WGSL parity vs colorlab.
  Brief: `_docs/architecture/procedural-graph/briefs/M-colorlab-harvest-slice-b.md`

- **Params-as-inputs, remainder** (Parts 3–4: evalCPU + WGSL codegen, editor form/ports) —
  `fa9697d` · promotable params as input ports; edge > literal > default in evalCPU and
  `emitGraphEval`; inspector shows read-only “driven by” for wired params.
  Brief: `_docs/architecture/procedural-graph/briefs/M-params-as-inputs-remainder.md`

- **Preview buffer selection persistence across graph edits** — `80e13f4` · stable `sourceKey`
  per pane; sync only when buffer set changes; selection survives benign graph edits.
  No linked brief (added directly to the board, not through the usual brief-first flow) —
  reviewed independently below.

- **Editor accessibility Phase A** — `5b64448` · skip link + `<main id="main-content">` landmark
  in webgputoy layout; `tabindex="-1"` on swap/connect dialog roots (dialog a11y-lint clean).
  Reviewed independently — clean, matches the brief. Brief:
  `_docs/architecture/procedural-graph/briefs/M-editor-a11y-phase-a.md`


- **Palette drag-and-drop node placement** — `9c758cc` · draggable palette primitives drop onto
  the canvas at the cursor flow position via `screenToFlowPosition`; click-to-add unchanged.
  Brief: `_docs/architecture/procedural-graph/briefs/M-palette-drag-drop.md`

- **Divider visual polish** — `4debfee` · axis-aligned hover/active bar, `active` prop while dragging.
  Brief: `_docs/architecture/procedural-graph/briefs/M-divider-visual-polish.md`

- **User-facing node names** — `c2eb302` · optional `Node.name`; inspector rename field;
  canvas label falls back to primitive id; muted primitive id under custom names.
  Brief: `_docs/architecture/procedural-graph/briefs/M-node-naming.md`

- **Primitive help coverage (frontmatter-based, all nodes)** — `af69aef` · unified
  `formatBuiltinSource` + inspector fallback; backfilled `help` across noise/math/color/
  terrain/surface/SDF/host/effect primitives (62 blank → 0; 9 → 71/112 authored); guard test
  ensures no blank tooltips.
  Brief: `_docs/architecture/procedural-graph/briefs/M-primitive-help-coverage.md`

- **`geometry.plane` orientation + dimensions** — `a55b8c2` · width/height + Euler XYZ rotation;
  WGSL + evalCPU parity; defaults bit-identical fullscreen quad.
  Brief: `_docs/architecture/procedural-graph/briefs/M-plane-orientation-dimensions.md`

## Ready to route

- **Shared preview clock (synced uniforms)** — **SUPERSEDED** by `M-single-loop-preview.md`
  (✅ landed `4a7f43d`, fixed `c8dcceb`). Brief kept for history:
  `_docs/architecture/procedural-graph/briefs/M-shared-preview-clock.md`

### Architecture direction (near-term; sequences existing briefs)

- **Unified preview execution** — Phase 1 (single-loop, independent outputs) ✅ landed
  (`4a7f43d` + key fix `c8dcceb`) — panes are views of one GraphFrameExecutor loop, shared
  uniforms, visually confirmed synced. **Remaining:** Part 3 — cross-target reads (render-target-
  as-texture GPU binding) + previous-frame ping-pong feedback — brief when a graph actually wires
  one output into another.
  Brief: `_docs/architecture/procedural-graph/briefs/M-unified-preview-execution.md`

params-as-inputs editor+codegen follow-on · Tier 2 (frame-graph GPU executor, resource GPU
binds, mesh-gen consumer, node-swap/groups/tooltips UX) · Tier 3 (transforms, colorlab
remainder, vegetation/terrain nodes) · Tier 4 (S0.5, planet PoC). See `work-plan.md`.

---

## Deferred — needs orchestrator review

- **Save pane layout with each graph + load toggle** — **DEFERRED → SUPERSEDED** by unified document
  system (`M-document-system.md`, landed). Original brief retained for history only.
  Brief: `_docs/architecture/procedural-graph/briefs/M-per-graph-layout.md`  ·  Claimed by: SUPERSEDED

---

## Archive — landed

- **Folded in from the retired nested board** (`_docs/architecture/procedural-graph/TASK_BOARD.md`,
  2026-06-29–era Codex coordination doc, unified into this one 2026-07-03 — see that file's
  header for the retirement note):
  - Node-model decomposition fix — restored `math.remap`/`sdf.opSubtract` as real group-backed
    decompositions (not the atomic correctness fallback) — `a29b4cc`
  - Noise-functions harvest — six 2D noise primitives ported from `noise-functions.glsl` — `b0f9fd9`
  - Colorlab harvest, slice A — 14 fixed-D65 colour-space primitives (adaptation/CVD deferred,
    tracked in `pending_issues.md`'s "colorlab harvest remainder") — `9fbc58a`
  - Pipeline nodes S0 (rebased) — geometry/buffer/stage/target nodes exposing the graph as a
    full pipeline — `5af0b80`
- **Tier 1 — trustworthy editor pipeline** (all reviewed green, visual-confirmed):
  - T-A compiled-WGSL view — `63e2ea9`
  - T-B incomplete/invalid-graph flagging (editor surfacing) — `b1761ae`
  - T-C reliable recompile + honest node source — `a8d758f`
  - T-D 🔴 real geometry + vertex codegen (replaced pipeline stubs; no-stub guard) — `07f0ba5`
- **Pipeline output reconciliation** — `target.display` as implicit sink; stale output cleanup on delete — `3a2b6bd`
- **Pipeline consumer derivation** — derive implicit fragment image consumer + synthetic outputs for compile/preview when doc metadata is empty — `bbf649f`
- **Format-adaptive preview buffer list** — enumerate graph output buffers by family; buffer selector replaces backend tabs — `c65912c`
- **Node palette organization** — search + section/contract/both grouping with collapsible groups — `8e358e1`
- **Preview effective doc fix** — preview panels and compile path use `effectiveGraphDocument` — `e1cd183`
- **Palette collapsed by default** — opt-in `expandedByMode` per grouping mode; search still auto-expands — `f1de8b1`
- **Fullscreen-fragment params binding** — declare and bind `GraphParams` in image consumer — `aa309e9`
- **Node swap by contract** — title-click searchable swap menu + `replace-node-primitive` edit intent — `cf23086`
- **Canonical data types + port defaults** — `canonicalDataType`/`dataTypeToWgsl` + unconnected input defaults (vector vec4f w=1) — `1f1bee4`
- **Graph editor default layout v2** — palette \| canvas+code \| inspector/validation/preview; layout key bumped to `:v2` — `bc5640e`
- **Same-named port direction fix** — xyflow handle ids (`in:`/`out:`) + direction-aware port lookup in validate/codegen — `cb6fa21`
- **Animated Worley pipeline sample** — replaces Noise field (scalar); default/New graph uses it — `b23b9a1`
- **Swap menu closes on click-outside** — capture-phase pointerdown dismisses NodeSwapMenu — `f92b052`
- **Vector combine/append primitives** — vec2f+scalar→vec3f/vec4f, vec3f+w→vec4f (w default 1) — `3e5961b`
- **Single fan-in on non-list inputs** — add-edge replaces occupied input; validateGraph `multiple-inputs` — `9e46041`
- **Preview multi-target buffer list** — one buffer per display sink; fixes duplicate `pipeline_image` keys — `f858fe4`
- **Port quick-connect** — right-click port → searchable compatible-node menu; add-connected-node intent — `f82bf92`
- **Device-compile test hardening** — Node `webgpu` binding + consumer device-compile coverage; fixes GPU-rejected WGSL — `94d0629`
- **Image preview opaque RGB** — previously fixed (2026-06-27): blank preview resolved; unconnected vec4f `w` defaults to 1 (`1f1bee4`) — dedicated `putImageData` alpha-forcing brief was superseded
- **Unique node/edge ids** — doc-aware minting (`graphIds.ts`), dedupe-on-load, `duplicate-id` validation error — `fb12ee4`
- **Multi-target consumer/output derivation** — unique per-sink pipeline output/consumer names; fixes preview collapse on the effective doc — `b49d897`
- **Node color-coding by category/contract** — tint nodes by category or contract; toolbar toggle persisted in chrome — `61b6359`
- **Unified graph document system** — `GraphArtifact` wrapper, named save/load/list, samples in document list, layout in artifact + load toggle — `7cf7d0a`
- **Independent output buffer per preview pane** — Subdivide passes pane id to zone snippets; `PreviewZone.svelte` + per-pane chrome (`previewBuffersByPane`) — `b73e6b3`
- **Effect preview renders the selected output** — target-aware `planPipelineGraph` + `EffectPreviewPanel` forwards `output` — `628da75`
- **Help/usage tooltips + drop SDF alias primitives** — inspector help/usage surfacing; removed `sdf.opUnion`/`opIntersect` — `5a17295`
- **Single-loop preview (panes as views)** — `GraphFrameExecutor` + shared preview rAF loop; effect panes display frame textures — `4a7f43d`
