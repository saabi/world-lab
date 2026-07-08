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

- **F3.6.4 — vertex kernel invocation model** (fourth milestone of F3.6; spans both packages, no
  manual/visual gate — see brief's Context, including a real coercion-gap finding surfaced during
  contract drafting, honestly scoped out rather than silently designed around)
  Brief: `_docs/architecture/procedural-graph/briefs/F3.6.4-vertex-kernel-invocation-model.md`
  Owns: `packages/graph/src/primitives/host/vertexIndex.ts` (new),
  `packages/graph/src/primitives/host/instanceIndex.ts` (new),
  `packages/graph/src/primitives/host/index.ts`, `packages/runtime-webgpu/src/emitGraphEval.ts`,
  `packages/runtime-webgpu/src/emitGraphEval.test.ts`,
  `packages/runtime-webgpu/src/vertexKernelPosition.ts` (new),
  `packages/runtime-webgpu/src/vertexKernelPosition.test.ts` (new),
  `packages/runtime-webgpu/src/index.ts`
  Claimed by: · Status: · Recommended executor: Cursor or Codex

Outstanding (not blocking): F1.4a's two new bundled samples (`migration-default-preview`,
`migration-fullscreen-fragment`) still need a human browser check per its own gate item 3.

## Done (recent)

- **F3.6.3 — fragment-kernel primitive with document-derived bindings** — `a26d8fb` · Third
  milestone of F3.6, spanning both packages. Registers a real, additive `stage.fragmentKernel`
  primitive (`bindings: []`) and generalizes `assembleFullscreenFragmentModuleAsync`'s existing
  by-hand `usesShaderToyHost`/`usedChannels`/`hasGraphParams` derivation into `deriveChannelBindingDecls`/
  `buildChannelBindGroupEntries`, shared by both the ShaderToy and kernel-fragment paths. Diff
  matches the contract and all three of its pre-routing-review fixes exactly:
  `buildKernelGraphEvalFn`'s `tint[0]` multiply is gone (`return ${resultExpr};`, confirmed via the
  landed test's own `expect(assembly.code).not.toContain('tint[0]')`); `PipelineGraphExecutor.execute`'s
  guard now only requires `kernelFragmentBindings` when `fragmentImpl.bindings.length > 0`,
  synthesizing empty maps otherwise; Gate item 7's binding-order proof is assembly-only (calls
  `assembleKernelFragmentModuleAsync` directly, no device, no real render of an unused declared
  binding) exactly as corrected, asserting the full four-way order (tint@0, u@1, params@2,
  channel@3-4) in one test. The real-device proof samples a live channel texture with a known solid
  color through `stage.fragmentKernel` (zero kernel-declared bindings) via `device.queue.writeTexture`,
  confirming the derived binding actually affects rendered output. A `'shares channel binding
  derivation with the fullscreen fragment path'` test directly compares
  `kernelAssembly.channelBindings`/`fullscreenAssembly.channelBindings` for identical input —
  proving the extraction is genuinely shared, not independently drifting. `stage.vertex`/
  `stage.fragment` confirmed byte-identical (own registration test). Independently re-verified, not
  diff-only: `check`/`test`/`build` re-run clean after clearing every `packages/*/dist`
  (`runtime-webgpu` 178/8-skip, up from F3.6.2's 174/8-skip; `graph` clean; full workspace `check`
  clean across all 12 packages + both apps, `build --workspaces` then app build both clean); the two
  new/changed real-device tests (`samples a live channel texture through stage.fragmentKernel`,
  `throws when a referenced channel target is missing`) independently re-run scoped to their own
  package with `--reporter=verbose`, confirmed to execute (88ms/8ms, real adapter/device warnings
  logged) not skip.
  Brief: `_docs/architecture/procedural-graph/briefs/F3.6.3-fragment-kernel-derived-bindings.md`

- **F3.6.2 — pipeline-stage-aware assembly and execution wiring** — `9183107` (task board's own
  stage commit wrote `Status: DONE` with no hash — filled in here) · Second milestone of F3.6,
  fragment side only. Adds `executeKernelFragment`/`assembleKernelFragmentModuleAsync` (new file
  `consumers/kernelFragment.ts`) and a real branch point in `PipelineGraphExecutor.execute` — a
  `{kind:'kernel', stage:'fragment'}` fragment stage routes into the new path, reusing F3.1/F3.3's
  `resolveKernelBindings`/`buildKernelBindingDecls`/`buildComputeBindGroupEntries` chain end to
  end. Diff matches the contract and all three of its pre-routing-review fixes exactly:
  `assertSupportedKernelFragmentShape` rejects any binding shape other than the one-`tint`-buffer
  scaffold before any WGSL assembly; `nextFreeBindingIndex` (not `.length`) correctly places graph
  params after the highest declared kernel binding index, proven with `tint@binding:1` (the one
  offset that actually collides under the old buggy calculation, not just lands wrong); and
  `host.fragCoord` is confirmed and positively tested as supported (it resolves through the
  `position` parameter, not a ShaderToy uniform), with the rejection wording narrowed to
  `host.iTime`/`host.iResolution`/`host.iMouse` only. The implementer's own split of assembly
  (`assembleKernelFragmentModuleAsync`) from execution (`executeKernelFragment`) is a real
  improvement over the contract's inline sketch — most Gate items (scaffold-shape rejection,
  host-input handling, binding-index placement) are tested without a GPU device at all, only the
  live-tint-buffer proof needs one. Independently re-verified, not diff-only this time (no
  skip-reverification instruction was given): `check`/`test` re-run clean after clearing every
  `packages/*/dist` (`runtime-webgpu` 174/8-skip, full workspace `check` clean across all 12
  packages + both apps); the real-device test (`uses a live tint buffer to affect rendered pixels`)
  independently re-run scoped to its own package with `--reporter=verbose`, confirmed to execute
  (132ms, real adapter/device warnings logged) not skip. `apps/scene-editor`'s `build` failed on
  first attempt after `rm -rf packages/*/dist` — traced to a process gap (app build attempted
  before package `dist`s were rebuilt, so `@world-lab/editor-ui`'s CSS export didn't exist yet),
  not a real regression; `npm run build --workspaces` then the app build both succeeded clean.
  Brief: `_docs/architecture/procedural-graph/briefs/F3.6.2-kernel-fragment-assembly-execution.md`

- **F3.6.1 — role-based pipeline-stage discovery** — `29a3208` (task board's own stage commit wrote
  the wrong hash, `4af9c7d`, which doesn't match any commit in the log — corrected here to the real
  one) · First milestone of F3.6. Adds `PrimitiveMetadata.pipelineStageKind`/`isPipelineStage`;
  three stage-discovery call sites (`fieldOutputForDisplay`, `resolveVertexForFragment`,
  `planPipelineGraph`'s fragment check) move off hardcoded `stage.vertex`/`stage.fragment` id
  checks, `resolvePipelineTarget`'s legacy fallback moves to the already-correct
  `isPipelineTarget`. `role: 'pipelineStage'` and `swapFamily()` grouping untouched. Diff matches
  the contract byte-for-byte, including Gate item 7's deliberately narrow strategy (a disconnected
  alt-id target-role document distinguishing old-vs-new behavior by which specific error message
  is thrown — the contract's own pre-routing review had found the originally-drafted version of
  this gate item unbuildable, and the landed test follows the corrected version exactly: same
  fixture shape, same disconnected-document construction, same two-error-message assertion). All
  fixture primitives use the specified idempotent-registration/unique-id discipline
  (`test.f361*`-prefixed, a `testPrimitive` helper matching the existing
  `typeRefDeviceCompile.test.ts` pattern). Verification for this entry is based on the diff read
  plus the implementer's own reported passing `check`/`test` commands (both workspaces + full
  workspace) — not independently re-run this time, per explicit instruction to skip redundant
  re-verification when the diff read alone gives high confidence. No manual/visual gate applied
  (none required — nothing rendered changes).
  Brief: `_docs/architecture/procedural-graph/briefs/F3.6.1-pipeline-stage-discovery.md`

- **F3.4 — first real graph-authored compute kernel, wired into `GraphFrameExecutor`** — `0b397003`
  · Fourth milestone of Foundation 3, rescoped after pre-drafting research, then revised again after
  a pre-routing review found the editor preview-loop/UI wiring was missing (see the brief's own two
  review rounds). Registers `target.computeBuffer` (one fixed buffer binding), role-based structural
  discovery mirroring `target.bufferFeedback`'s exact pattern, and a `ComputeBufferExecutor`
  (mirrors `BufferFeedbackExecutor`'s shape) wiring the full F3.1→F3.3 chain through a real
  `ResourceRealizer`-managed buffer into `GraphFrameExecutor.execute`, plus the `previewFrameLoop.ts`
  guard/snapshot-field fix, `enumeratePreviewBuffers` block, `'buffer'` preview family/renderer, and
  `DataBufferPreviewPanel` needed to make the result actually dispatch and become visible in the
  editor. Purely additive — zero changes to `stage.vertex`/`stage.fragment`/`pipelineVertex.ts`/
  `fullscreenFragment.ts`/any existing sample graph. Independently re-verified as part of closing
  F3.5 immediately below (diff/gate re-check covered both landings together, since F3.5 confirmed
  F3.4's landing already satisfied every one of its own "confirm or restore" Fix steps) rather than
  as its own separate review pass — noted here for the record, since this entry was missing until
  F3.6.1 was drafted.
  Brief: `_docs/architecture/procedural-graph/briefs/F3.4-compute-buffer-target.md`

- **F3.5 — generic compute-kernel proof closure** — `899e56f` (+ `ebf6cd9` for an SSR fix and a
  second, previously-missed preview-loop guard) · Fifth milestone of Foundation 3, briefed and
  implemented by Codex directly (a deviation from this project's usual contract-first workflow,
  independently reviewed after the fact rather than before routing). Landed as pure test/task-board
  additions — no production code needed for the "confirm or restore" Fix steps, since F3.4's actual
  landing (`0b397003`) already satisfied every one of them (`target.computeBuffer` registration,
  the `'buffer'` preview family, `layoutStorage.ts` round-trip coverage, `inferDefaultPreviewBuffer`
  selection). The real, non-redundant work: a real-device (`it.skipIf(!hasWebGPU)`) test proving a
  compute-only document produces `computeBuffers` through `GraphFrameExecutor.execute()`'s own top
  level (not just through `ComputeBufferExecutor` directly or a mocked spy, the only coverage F3.4
  had), plus preview-routing/default-selection test coverage. A real gap this brief didn't catch
  was found via the manual visual-gate check and fixed in `ebf6cd9`: `GraphEditor.svelte` has its
  own separate copy of the "should the preview loop run" early-exit guard, independent of
  `previewFrameLoop.ts`'s own (already fixed by F3.4) — never updated for
  `deriveComputeBufferTarget`, so the bundled sample would not have actually run in the real editor
  UI despite everything else being correct. Independently re-verified: `check`/`test`/`build`
  re-run clean after clearing `packages/*/dist` (`graph` 217/217, `runtime-webgpu` 164/8-skip,
  `graph-editor` 222/222, both apps' `check` clean); the new real-device test independently re-run
  scoped to its own package with `--reporter=verbose` to confirm it executes and passes. Manual
  browser visual-gate check (sample pickable, buffer panel visible, values changing across frames)
  confirmed directly by the user. **Foundation 3's static compute-kernel path is closed.**
  Brief: `_docs/architecture/procedural-graph/briefs/F3.5-generic-kernel-proof.md`

- **F3.3 — compute kernels and dispatch domains** — `2dc6009` · Third milestone of Foundation 3.
  Fixes `assembleStageEntry`'s compute template (`@workgroupSize` → valid `@workgroup_size`, its
  own test was asserting the wrong string) and gives F3.1's `KernelBindingTemplate`/
  `resolveKernelBindings`/`bindingDeclKindForTemplate` (zero consumers since landing) their first
  real GPU caller: `buildKernelBindingDecls`/`buildComputeBindGroupEntries`/`resolveDispatchDomain`/
  `executeComputeKernel`, a plain runtime function (mirrors `BufferFeedbackExecutor.execute`, no
  persistent state needed). Two blocking issues from a pre-routing review were folded in before
  routing: `executeComputeKernel` rejects a non-compute `shader.stage` before any GPU call, and
  `resolveDispatchDomain` requires positive integers for `workgroupSize`/explicit dispatch
  tuples/buffer `elementCount`/texture `width`&`height`. The real-device test dispatches a doubling
  kernel against a 20-element buffer with an 8-wide workgroup (non-multiple, `arrayLength`-guarded)
  to prove the bounds-check pattern, not just documentation. Independently re-verified: diff
  matches every Fix step (plus one implementer-caught, correctly-documented fix to this brief's own
  draft — the example device-test WGSL had hand-written a `cs_main` that contradicted
  `executeComputeKernel`'s actual design, since `cs_main` is generated by `assembleStageEntry`
  itself); all 20 Gate items covered; `check`/`test`/`build` re-run clean after clearing
  `packages/*/dist` (`compiler` 58/58, `runtime-webgpu` 154/8-skip — up from F3.2's 143/8 baseline,
  the new tests); the device test independently re-run scoped to its own package with
  `--reporter=verbose` to confirm it actually executes and passes. Also corrected a wrong claim in
  the Foundation 3 plan doc found while researching this milestone: F3.3 is not the first
  `GPUComputePipeline`/`dispatchWorkgroups` in the package (three hand-rolled ones already exist) —
  it's the first one built through the generic binding-template model.
  Brief: `_docs/architecture/procedural-graph/briefs/F3.3-compute-kernels-dispatch.md`

- **F3.2 — typed varyings (vertex → fragment)** — `0c4b7d8` · Second milestone of Foundation 3,
  compiler-internals only. `VaryingDecl`/`varyingsStructWgsl` give `assembleStageEntry`'s vertex/
  fragment templates a shared, typed struct beyond `position`; `assertVaryingsMatch` is the single
  clear rejection point for a mismatched pair (F2.5's strict-equality precedent). Two blocking
  issues from a pre-routing review were folded in before routing: every varying name and struct
  name is now WGSL-identifier/reserved-keyword validated on both the vertex-declaring and
  fragment-referencing sides (mirroring F3.1's `kernelBinding.ts` discipline), and the new
  `runtime-webgpu` device test proves the pair actually **links** as a `GPURenderPipeline`
  (`createRenderPipelineAsync` with `vs_main`/`fs_main` paired), not just that each entry point
  parses in isolation. Independently re-verified: diff matches every Fix step byte-for-byte; all 19
  Gate items covered; `check`/`test`/`build` re-run clean after clearing `packages/*/dist`
  (`compiler` 58/58, `runtime-webgpu` 143/8-skip — exactly one more pass than F3.1's baseline, the
  new device test); that device test independently re-run scoped to its own package with
  `--reporter=verbose` to confirm it actually executes (not silently skipped — the repo-root vitest
  invocation lacks the package's WebGPU setup file and would show it skipped, an artifact of how
  the check is run, not of the implementation). `fullscreenFragment.ts`, `pipelineVertex.ts`,
  `packages/graph`, and the pre-existing `@workgroupSize` bug confirmed untouched, exactly as
  scoped.
  Brief: `_docs/architecture/procedural-graph/briefs/F3.2-typed-varyings.md`

- **F3.1 — kernel & binding type algebra** — `4c28431` · First milestone of Foundation 3. Gives
  `{kind:'kernel', stage}` a real declared shape: `KernelBindingTemplate`/`ResolvedKernelBinding`
  (`implementation.ts`), `validateKernelBindingTemplates`/`isBindingVisibleInStage`/
  `resolveKernelBindings` (new `kernelBinding.ts`), registration-time enforcement (`registry.ts`),
  and `BindingDecl.kind`'s new `storage-read-write` variant + `bindingDeclKindForTemplate`
  (`stageEntry.ts`). Two blocking issues from a second pre-routing review round were folded into
  the contract before routing: `resolveKernelBindings` returns identity-preserving
  `ResolvedKernelBinding[]` (not bare `ResourceBinding[]`), and every binding's declared stage
  visibility is checked against its owning kernel's own `stage`. Independently re-verified:
  diff matches the contract's Fix steps exactly (plus one implementer-documented addition, a WGSL
  reserved-keyword rejection, folded into the brief in the same commit); all 17 Gate items covered
  by tests; `check`/`test`/`build` re-run clean across the full workspace after clearing
  `packages/*/dist` (`graph` 209/209, `compiler` 48/48, `runtime-webgpu` 142/8-skip — same baseline
  as F2.5-followup, no regressions). The `@workgroupSize`/`@workgroup_size` WGSL bug found during
  review was correctly left untouched, deferred to F3.3 per the contract.
  Brief: `_docs/architecture/procedural-graph/briefs/F3.1-kernel-binding-type-algebra.md`

- **F2.5-followup — dispose-cascade test** — `984bfcb` · Adds the one test gate item 10's dispose
  half was missing: `BufferFeedbackExecutor.prototype.dispose` spied directly, asserted called once
  by `GraphFrameExecutor.dispose()`. No production code touched (verified via diff — only
  `graphFrameExecutor.test.ts` and this file changed). Independently re-verified: `check` clean for
  `runtime-webgpu`/`graph`/`graph-editor`, full `runtime-webgpu` suite re-run (142 passed, 8 skipped,
  no regressions), new test confirmed passing. **Foundation 2 (F2.1–F2.5) is now fully closed.**
  Brief: `_docs/architecture/procedural-graph/briefs/F2.5-foundation-2-proof.md`

- **F2.5 — Foundation 2 proof** — `35a75fb` · **fifth and final Foundation 2 milestone, all fixes
  from three pre-implementation review rounds verified landed.** New `input.channel` host-input
  primitive + `emitHostInput` branch (self-contained, depends only on `position`, no `uv`);
  `resolveChannelDependencies`/`buildPassGraphWithChannelReads` resolve cross-pass reads via
  `derivePipelinePresentations`'s `displayNodeId ↔ outputName` pairing (not string equality), with
  same-channel/different-source conflicts rejected; `GraphFrameExecutor` respects `buildPassOrder`
  for real cross-pass consequence, verified on a real device (pass B's output visibly incorporates
  pass A's texture). Buffer-feedback sample driven by a fully independent, persistent
  `BufferFeedbackExecutor` (own `ResourceRealizer`, presentation texture, seed state, fingerprint) —
  confirmed it never shares or collides with `GraphFrameExecutor`'s own realizer; `target.bufferFeedback`
  sink + `deriveBufferFeedbackTarget` wired through `previewFrameLoop.ts`, `GraphEditor.svelte`, and
  `enumeratePreviewBuffers` so the buffer-only document actually dispatches and is selectable, not
  just typechecks; strict `gridWidth === input.width` contract rejects mismatches clearly. Full
  workspace `check`/`test`/`build` re-run clean from a fresh `dist` clear; both
  `it.skipIf(!hasWebGPU)` proof tests confirmed to actually execute (not skip) on a real device.
  **One gap found in independent review:** gate item 10's dispose half (`GraphFrameExecutor.dispose()`
  cascading into `BufferFeedbackExecutor.dispose()`) is correct in code but untested — routed as
  **F2.5-followup** below, a single test, no production code change. Foundation 2 is fully closed
  once that lands.
  Brief: `_docs/architecture/procedural-graph/briefs/F2.5-foundation-2-proof.md`

- **F2.4 — generic frame executor** — `37f496a` · **final milestone landed in Foundation 2.**
  `GraphFrameExecutor` routes every frame through `buildPassOrder` + a persistent, device-keyed
  `ResourceRealizer`, replacing per-frame texture allocate/destroy; `consumerId → writeTarget →
  GraphFramePass` resolved explicitly, with a dedicated test proving it throws (not silently skips)
  on an inconsistent plan — verified by directly reading the mocked-`buildIndependentPassGraph`
  test that constructs exactly that scenario; the blocking multi-target `COPY_SRC` gap is fixed via
  the additive `PassGraph.readbackTargets` field, proven both at the unit level
  (`graphFramePlan.test.ts`, reusing the existing `dualDisplayGraph` fixture) and via a new
  real-device multi-target test (`dualTargetPipelineGraph`) neither prior test could catch;
  `executeFullscreenFragment`/`PipelineGraphExecutor` take a caller-owned `target` texture, no
  internal allocation; `dispose()` wired into `previewFrameLoop.ts`'s teardown. Test suite covers
  every gate item from both revision rounds. Full workspace check/test/build green.
  Brief: `_docs/architecture/procedural-graph/briefs/F2.4-generic-frame-executor.md`

- **F2.3 — runtime resource realization** — `f355221` · `ResourceRealizer` allocates real
  `GPUBuffer`/`GPUTexture` per target; cache fingerprint (verified in the actual diff) includes
  full `shape` plus derived usage/size/format, not just size — stronger than the brief's own
  minimum; removed targets destroyed and pruned (tested directly); zero-usage buffers **and**
  textures rejected before allocation; storage textures (`shape.access` set) rejected with a clear
  "deferred" error rather than mis-derived as `RENDER_ATTACHMENT`; `history`-lifetime targets
  double-buffered via a frame-parity flip, with a defensive fallback so single-slot resources never
  index out of bounds after `advanceFrame()`; partial-allocation failure cleans up already-allocated
  slots before rethrowing (a robustness addition beyond the brief). Test suite (`realize.test.ts`,
  442 lines) covers every gate item precisely, including both regression rounds. Full workspace
  check/test/build green, plus the real-device gate test.
  Brief: `_docs/architecture/procedural-graph/briefs/F2.3-runtime-resource-realization.md`

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
