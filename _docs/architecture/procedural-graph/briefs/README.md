# Milestone briefs

> Historical path note: completed briefs preserve the workspace names that existed when
> they were executed, including `fe/` and `apps/graph-editor`. Current paths are
> `apps/scene-editor/` and `apps/webgputoy/`; do not copy commands from completed briefs
> without translating those paths.

Self-contained, routable specs for executing
[implementation-plan.md](../implementation-plan.md) milestones. Each brief is a
**contract a single agent can fulfill**: objective, files, public signatures, the
failing tests that are the acceptance gate, what's out of scope, dependencies, and a
handoff. See [execution-and-delegation.md](../execution-and-delegation.md) for who
runs what.

## Conventions

- **Parallel via task board.** Independent tasks run in parallel when the root
  [`_TASK_BOARD.md`](../../../../_TASK_BOARD.md) assigns **disjoint files/packages**
  (claim-by-edit; see [execution-and-delegation.md](../execution-and-delegation.md)). The
  critical *dependency chain* stays serialized — never start a task whose prerequisite is open.
- **Self-contained.** A brief links the relevant stream doc(s) so a fresh or
  external agent (Cursor / Codex / Gemini Antigravity) needs no other context.
- **Gate = done.** The task is complete when the brief's tests are green and
  `npm run check` / `npm test` pass for the touched package, with **no new public
  API** beyond the brief.
- **Design ADRs.** Policy that spans milestones (e.g.
  [wgsl-parsing-and-codegen.md](../wgsl-parsing-and-codegen.md),
  [editor-and-scene-integration.md](../editor-and-scene-integration.md),
  [parameter-and-form-schema.md](../parameter-and-form-schema.md)) outrank
  stream docs when they conflict; update the ADR before changing dependent briefs.

## Index

| Brief | Milestone | Status | Recommended executor |
|-------|-----------|--------|----------------------|
| [M1-graph-ir.md](./M1-graph-ir.md) | M1 — Graph IR | ✅ landed (5/5 green) | Sonnet (done) |
| [M2-primitives.md](./M2-primitives.md) | M2 — Primitive registration | ✅ landed (10/10 green) | Cursor (done) |
| [M3-self-describing-wgsl.md](./M3-self-describing-wgsl.md) | M3 — self-describing WGSL + TypeBox param convergence | ✅ landed (`eb09625`; schema 18/18, graph 13/13, compiler 26/26) | Codex (done) |
| [M4-slicing.md](./M4-slicing.md) | M4 — Dependency slicing | ✅ landed (`44df2ce`) | Cursor (done) |
| [M5-codegen.md](./M5-codegen.md) | M5 — WGSL gen + module resolver | ✅ landed (`1c8a486`) | Cursor (done) |
| [M6-linker.md](./M6-linker.md) | M6 — ShaderLinker + tree-shake | ✅ landed (`8b19ece`) | Cursor (done) |
| [M7-cpu-runtime.md](./M7-cpu-runtime.md) | M7 — CPU runtime services | ✅ landed (`a579686`, 4/4 green) | Codex (done) |
| [M8-resource-inputs.md](./M8-resource-inputs.md) | M8 — resource inputs + CPU views | ✅ landed (`790a898`; graph 13/13, runtime-cpu 11/11) | Codex (done) |
| [M9-standalone-editor.md](./M9-standalone-editor.md) | M9 — standalone graph editor | ✅ landed (`5d891ea`; graph 13/13, runtime-cpu 14/14, graph-editor 7/7) | Opus/Cursor (done) |
| [M9b-multi-level-editing.md](./M9b-multi-level-editing.md) | M9b — multi-level editing (phased) | ✅ landed (`6f8a3ff`) | Composer (M9b.1–2); Sonnet (M9b.3–4) |
| [M10-runtime-webgpu.md](./M10-runtime-webgpu.md) | M10 — runtime-webgpu (phased) | ✅ landed (`ae7a4cb`; runtime-webgpu 6/6, graph-editor 37/37) | Sonnet (M10.1–2); Composer (M10.3) |
| [M9c-editor-ux-polish.md](./M9c-editor-ux-polish.md) | M9c — delete + duplicate (optional parallel) | ✅ landed (`ca493a4`) | Composer |
| [M11-tessellation.md](./M11-tessellation.md) | M11 — Tessellation primitives (phased) | ✅ landed (`7c4d8b5`) | Cursor (done) |
| [M12-vegetation.md](./M12-vegetation.md) | M12 — vegetation consumer (phased) | ✅ M12.1 landed (`bf999aa`) | Codex (done) |
| [M12.2-vegetation-gpu.md](./M12.2-vegetation-gpu.md) | M12.2 — GPU vegetation compute | ✅ landed (`2c75d96`) | Sonnet (done) |
| [M12.3-vegetation-preview.md](./M12.3-vegetation-preview.md) | M12.3 — editor vegetation preview | ✅ landed (`2d01d44`) | Composer (done) |
| [M9d3-code-highlighting.md](./M9d3-code-highlighting.md) | M9d.3 — syntax highlighting (CodeMirror) | ✅ landed (`ac77b2d`) | Composer (done) |
| [M9d-editor-shell-polish-proposal.md](./M9d-editor-shell-polish-proposal.md) | M9d — editor shell polish (proposal) | ✅ approved → split | Opus (signed off) |
| [M9d1-layout-persistence.md](./M9d1-layout-persistence.md) | M9d.1 — editor layout persistence | ✅ landed (`4d8da96`, Opus-reviewed) | Composer (done) |
| [M9d2-pane-context-menus.md](./M9d2-pane-context-menus.md) | M9d.2 — zone-aware pane menus (subdivide API) | ✅ landed (`7ae1929`) | Composer (done) |
| [M-multi-output-compile.md](./M-multi-output-compile.md) | Multi-output compile driver + consumer-stage model (**audit gap**) | 📌 contract ready | Cursor (Opus-pinned) |
| [M-mesh-gen-consumer.md](./M-mesh-gen-consumer.md) | Graph-driven mesh-gen consumer (tessellation via graph, not hardcoded); `surface.cubeFace → transform.spherify` decomposition proof | ✅ landed (`82f5a8b`) | Cursor (done) |
| [M-mesh-target-sink.md](./M-mesh-target-sink.md) | `target.mesh` sink primitive + wiring `MeshPreviewPanel`/`PreviewZone` to the user's actual graph (the consumer above is graph-driven, but nothing in the editor pointed at it) | 📌 ready to route | Cursor (Opus-pinned) |
| [M-app-extraction.md](./M-app-extraction.md) | Extract standalone editor → `apps/graph-editor` (tech-debt) | 📌 contract ready | Cursor |
| [M-params-as-inputs.md](./M-params-as-inputs.md) | Params promotable to input ports (remap bounds wireable) | 📌 contract ready | Cursor |
| [M-primitive-immutability.md](./M-primitive-immutability.md) | Real WGSL source in CodeView; built-ins read-only; clone-to-edit | 📌 contract ready · fixes stub-source bug | Cursor |
| [M-shadertoy-poc.md](./M-shadertoy-poc.md) | ShaderToy PoC effects: cosine palette (S0) + Game of Life multibuffer (S0.5) | 📌 contract ready · after multi-output + render-target | Cursor |
| [M-pass-graph-executor.md](./M-pass-graph-executor.md) | Render-target / frame-graph executor (per-target res, feedback, ordering) | 📌 contract ready · after multi-output | Cursor |
| [M-planet-primitive-harvest.md](./M-planet-primitive-harvest.md) | Port planet-shader functions → primitives (feeds planet PoC P2; parity by reference) | 📌 contract ready | Cursor |
| [M-usegpu-primitive-harvest.md](./M-usegpu-primitive-harvest.md) | Port Use.GPU WGSL fns (SDF/noise/colour) → primitives (license-verify first) | 📌 contract ready | Cursor |
| [M-colorlab-harvest.md](./M-colorlab-harvest.md) | Port user's colorlab per-pixel colour transforms → `color.*` primitives | ⏳ Slice A pinned; queued after decomposition | Cursor |
| [M-noise-functions-harvest.md](./M-noise-functions-harvest.md) | Port selected documented `noise-functions.glsl` functions → `noise.*` primitives | ⏳ first slice pinned; queued after decomposition | Cursor / Composer |
| [M-multi-output-compile.md](./M-multi-output-compile.md) | Multi-output compile driver (T0) | ✅ landed (`302667f`) | Opus (done) |
| [M-planet-primitive-harvest.md](./M-planet-primitive-harvest.md) | Planet-shader primitive harvest (T1) | ✅ landed (`3c08c80`) | Cursor (done) |
| [M-primitive-immutability.md](./M-primitive-immutability.md) | Real WGSL source + clone (T2) | ✅ landed (`1ec544d`) | Cursor (done) |
| [M-editor-ui-extraction.md](./M-editor-ui-extraction.md) | Extract chrome + controls → `@virtual-planet/editor-ui` (T3) | ✅ landed (`3b54458`) | Cursor (done) |
| [M-pass-graph-executor.md](./M-pass-graph-executor.md) | Frame-graph: pure core landed (T4 `3fc520a`); **GPU executor = round 2** | 🔄 core done; GPU executor pending | Cursor |
| [M-stage-entrypoints.md](./M-stage-entrypoints.md) | Stage entry points + bind-group layout (R2-T0) | ✅ landed (`52334eb`) | Opus (done) |
| [M-shadertoy-s0-runtime.md](./M-shadertoy-s0-runtime.md) | ShaderToy S0: fullscreen-fragment runtime + cosine palette | ✅ landed (`7917bfc`) — but see fix below | Cursor (done) |
| [M-shadertoy-s0-fix.md](./M-shadertoy-s0-fix.md) | **S0 fix:** effect must be the *canvas graph* (loadable sample + preview renders canvas) | ✅ landed (`ed9aabd`) + render fix (`0ba7e29`) | Cursor (done) |
| [M-node-model-foundation.md](./M-node-model-foundation.md) | **Foundation (R1):** resource ports · role/contract swap families · node **groups** (subgraph nodes) · `list<T>` — built in slices | ✅ landed (`3641621`) | Opus/Gemini (done) |
| [M-node-model-decomposition-fix.md](./M-node-model-decomposition-fix.md) | Correctly finish `math.remap` / `sdf.opSubtract` as group-backed decompositions | 🔄 active cleanup | Cursor |
| [M-pipeline-nodes-s0.md](./M-pipeline-nodes-s0.md) | **S0 redo:** graph = full pipeline — geometry/buffer/stage/target **nodes** (consumes the foundation) | ✅ nodes landed (`5af0b80`) — but **WGSL is stubs** (see below) | agent (done) |
| [M-real-geometry-vertex-codegen.md](./M-real-geometry-vertex-codegen.md) | **🔴 gap-fix:** pipeline nodes emit **real** geometry/vertex WGSL (plane grid + `@vertex`); runner uses it, not the hardcoded fullscreen triangle | 📌 contract ready · high priority | browser-capable agent |
| [M-compiled-wgsl-view.md](./M-compiled-wgsl-view.md) | **Tier 1:** final compiled-WGSL view — watch the whole graph's shader output | 📌 contract ready | Cursor |
| [M-graph-validation-flagging.md](./M-graph-validation-flagging.md) | **Tier 1:** flag incomplete/invalid graphs (unconnected inputs, no consumer, unresolved) | 📌 contract ready | Cursor |
| [M-editor-recompile-and-node-source.md](./M-editor-recompile-and-node-source.md) | **Tier 1:** reliable recompile on edit + real source for groups/pipeline nodes | ✅ landed (`a8d758f`) | Cursor (done) |
| [M-real-geometry-vertex-codegen.md](./M-real-geometry-vertex-codegen.md) | **🔴 gap-fix:** real geometry + vertex codegen (replaced pipeline stubs; no-stub guard) | ✅ landed (`07f0ba5`) | Cursor (done) |
| [M-pipeline-output-reconciliation.md](./M-pipeline-output-reconciliation.md) | **gap-fix:** `target.display` is the pipeline terminal — validator roots reachability at pipeline sinks; editor drops stale output refs | 📌 contract ready · next | Cursor |
| [M-pipeline-output-reconciliation.md](./M-pipeline-output-reconciliation.md) | output reconciliation landed | ✅ landed (`3a2b6bd`) | Composer (done) |
| [M-pipeline-consumer-derivation.md](./M-pipeline-consumer-derivation.md) | **gap-fix:** derive implicit image consumer from `stage.fragment → target.display` so a pipeline graph compiles + previews (compile/preview dual of reconciliation) | 📌 contract ready · next · blocks preview-buffer-list | Cursor |
| [M-pipeline-consumer-derivation.md](./M-pipeline-consumer-derivation.md) | consumer derivation landed | ✅ landed (`bbf649f`) | Cursor (done) |
| [M-preview-buffer-list.md](./M-preview-buffer-list.md) | Format-adaptive preview — list output buffers by family; buffer selector replaces backend tabs | ✅ landed (`c65912c`) — but visual render gate unmet (see fix) | Cursor (done) |
| [M-preview-effective-doc-fix.md](./M-preview-effective-doc-fix.md) | **🔴 fix:** preview panels must assemble against `effectiveGraphDocument(doc)`, not the raw doc — closes the buffer-list render gate | 📌 contract ready · next | Cursor |
| [M-node-palette-organization.md](./M-node-palette-organization.md) | Node palette: top search bar + group by section/contract/both with collapsible groups | ✅ landed (`8e358e1`) | Cursor (done) |
| [M-palette-collapsed-default.md](./M-palette-collapsed-default.md) | Palette touch-up: all sections collapsed by default | ✅ landed (`f1de8b1`) | Cursor (done) |
| [M-preview-effective-doc-fix.md](./M-preview-effective-doc-fix.md) | Preview panels assemble against `effectiveGraphDocument` (closed buffer-list render gate) | ✅ landed (`e1cd183`) | Cursor (done) |
| [M-fullscreen-fragment-params-binding.md](./M-fullscreen-fragment-params-binding.md) | **🔴 fix:** image consumer declares/packs/binds the `GraphParams` uniform | ✅ landed | Cursor (done) |
| [M-image-preview-opaque-alpha.md](./M-image-preview-opaque-alpha.md) | Image preview opaque RGB — **previously fixed** (2026-06-27; see `1f1bee4` vec4f w default) | ✅ superseded | — |
| [M-node-swap-by-contract.md](./M-node-swap-by-contract.md) | Node-swap UX: click node title → searchable menu filtered by `listSwapFamily` → `replaceNodePrimitive` in place (preserve edges/params) | ✅ landed (`cf23086`) | Cursor (done) |
| [M-swap-menu-click-outside.md](./M-swap-menu-click-outside.md) | Swap menu closes on outside click | ✅ landed (`f92b052`) | Cursor (done) |
| [M-datatype-canonical-and-port-defaults.md](./M-datatype-canonical-and-port-defaults.md) | **fix+feature:** one `canonicalDataType` (vec2f ≡ vec2<f32>) enforced at every boundary; optional input-port `default` (unconnected → literal) applied to vector components | 📌 contract ready · next | Cursor |
| [M-graph-editor-default-layout-v2.md](./M-graph-editor-default-layout-v2.md) | Graph editor default layout v2 — palette \| canvas+code \| inspector/validation/preview | ✅ landed | Cursor (done) |
| [M-graph-sample-worley-pipeline.md](./M-graph-sample-worley-pipeline.md) | Hard-coded Worley+iTime pipeline sample; replaces Noise field (scalar) | ✅ landed | Cursor (done) |
| [M-vector-combine-primitives.md](./M-vector-combine-primitives.md) | Vector combine/append primitives (vec2f+scalar→vec3f/vec4f) | ✅ landed | Cursor (done) |
| [M-single-input-fan-in.md](./M-single-input-fan-in.md) | Single fan-in on non-list inputs (replace on connect + validation) | ✅ landed | Cursor (done) |
| [M-preview-multi-target.md](./M-preview-multi-target.md) | One preview buffer per pipeline display sink | ✅ landed | Cursor (done) |
| [M-port-quick-connect.md](./M-port-quick-connect.md) | Right-click port → add compatible wired node | ✅ landed | Cursor (done) |
| [M-device-compile-test-hardening.md](./M-device-compile-test-hardening.md) | Device-compile test hardening — Node WebGPU + consumer coverage | ✅ landed | Cursor (done) |
| [M-primitive-help-coverage.md](./M-primitive-help-coverage.md) | Frontmatter-based help for every primitive — 62/112 (55%) resolved blank; unified frontmatter as the source, guaranteed non-empty fallback + guard test, backfilled all categories | ✅ landed (`af69aef`) | Cursor (done) |
| [F1.1-tuple-rename.md](./F1.1-tuple-rename.md) | Foundation 1, milestone 1: rename static `list<T>` → `tuple<T>` (zero production callers, pure rename); defers the runtime storage-buffer path untouched | ✅ landed (`b36f864`) | Codex (done) |
| [F1.2-open-spaces-semantics.md](./F1.2-open-spaces-semantics.md) | Foundation 1, milestone 2: open `CoordinateSpace` → `SpaceId`, add `semantics: SemanticTag[]`; opens a third closed-set gate (`primitiveLoader.ts`'s `COORDINATE_SPACES`) beyond the type itself | ✅ landed (`3768ae2`) | Codex (done) |
| [F1.5-typeref-compatibility-layer.md](./F1.5-typeref-compatibility-layer.md) | Foundation 1, milestone 3: introduce `TypeRef` structural type algebra alongside `DataType`; total forward/partial reverse mapping, `PortSpecInput`/`NodePrimitiveInput` split, split coercion (`resolveCoercion`/`emitCoercion`/`applyCoercion`); proven via new integer + matrix test primitives with a real device compile — widest-touching milestone in Foundation 1 | ✅ landed (`129d35e`) | Codex (done) |
| [F1.3-primitive-implementation-union.md](./F1.3-primitive-implementation-union.md) | Foundation 1, milestone 4: discriminated `PrimitiveImplementation` union (`wgsl-function`/`group`/`host-input`/`legacy-structural`/`sink`), `GroupResolver` (no `graph`→`procedural-wgsl` cycle), `SinkDefinition`/`SinkInvocation` with generic `dependencies`; fixed a sequencing gap in the plan's own gate (referenced `preview.fieldSink`/`legacy.consumerSink`, which don't exist until F1.4a — proven via a test-only primitive instead) | ✅ landed (`d2db00e`) | Codex (done) |
| [F1.4a-unify-execution-roots.md](./F1.4a-unify-execution-roots.md) | Foundation 1, milestone 5 (final): sink nodes as the only execution roots, real v1→v2 `GraphDocument` migration (`legacy.consumerSink`/`preview.fieldSink`, batched `compileConsumers`, per-entry migration), `discoverExecutionRoots`; bundles two new pickable sample graphs so both migration paths are visually re-verifiable, not just headless-tested — highest-blast-radius milestone in Foundation 1 | ✅ landed (`48ea451`), visual browser check outstanding | Codex (done) |
| [F2.1-resource-type-algebra.md](./F2.1-resource-type-algebra.md) | Foundation 2, milestone 1 (rev. 3): id-less `ResourceTemplate`/instance-level `ResourceInstance` split (fixes the same static-vs-per-node mistake F1.3 caught for `SinkDefinition`), explicit `ResourceAccess`/`ResourceBinding` with a real `resolveBufferUsage` API combining declared + inferred usage, `ResourceBinding[]` attaches to planner-level `Pass` (not kernel/command nodes) so F2.2 never circularly depends on Foundation 3 — pure types only, no GPU allocation | ✅ landed (`04f5319`) | Codex (done) |
| [F2.2-resource-dependency-planner.md](./F2.2-resource-dependency-planner.md) | Foundation 2, milestone 2 (rev. 2): generalizes `frameGraph/types.ts` to F2.1's resource union as a discriminated union (`ResourceTarget` pairs buffer shapes only with element-count size, texture shapes only with pixel size; samplers excluded from targets at the type level; `previousFrame`→`version`, newly validated against `history` lifetime), `collectFeedbackTargets` corrected to mean only `history`-lifetime targets (not `persistent`, which is one allocation) with display retention left to `computeLifetimes` where it already lived, parallel `resolveBufferSizes` alongside `resolveTargetSizes`, `collectResourceInstances` materializes `ResourceInstance`s from a real `GraphDocument`, `Pass.bindings` reserved (unconsumed) | ✅ landed (`397af7f`) | Codex (done) |
| [F2.3-runtime-resource-realization.md](./F2.3-runtime-resource-realization.md) | Foundation 2, milestone 3 (rev. 3): `ResourceRealizer` allocates real `GPUBuffer`/`GPUTexture` per target, cache compares a full descriptor fingerprint (kind, slots, resolved size, derived usage, format) not just size, removed targets pruned and destroyed, zero-usage buffers **and textures** rejected explicitly, storage textures (`TypeRef.texture.access` set) rejected rather than mis-derived as `RENDER_ATTACHMENT`; `history`-lifetime targets physically double-buffered via a frame-parity flip; buffer usage via `resolveBufferUsage` over `Pass.bindings` (its first real consumer); bind-group layout derivation, storage textures, and non-scalar/non-2d element/dimension sizing all deliberately deferred (no consumer before Foundation 3) | ✅ landed (`f355221`) | Codex (done) |
| [F2.4-generic-frame-executor.md](./F2.4-generic-frame-executor.md) | Foundation 2, milestone 4 (rev. 2): `GraphFrameExecutor` routes through `buildPassOrder`+a persistent, device-keyed `ResourceRealizer` instead of allocating/destroying a texture every frame, resolving `consumerId → writeTarget → GraphFramePass` explicitly (throws on mismatch, no silent skip); new additive `PassGraph.readbackTargets` field fixes a blocking gap where only the first/`display` target got `COPY_SRC`, failing multi-target readback; `executeFullscreenFragment`/`PipelineGraphExecutor` take a caller-owned `target` texture (no internal creation); `dispose()` added and wired into `previewFrameLoop.ts`'s teardown. Deliberately does not add a channel-read primitive or cross-pass WGSL sampling — flags a real sequencing question for the Foundation 2 proof step that follows | ✅ landed (`37f496a`) | Codex (done) |
| [F2.5-foundation-2-proof.md](./F2.5-foundation-2-proof.md) | Foundation 2, final milestone: two bundled, pickable samples proving the resource-history model — same-frame cross-pass texture read (new `input.channel` host-input primitive, self-contained WGSL emission deriving UV from `position`/`textureDimensions`; `channelBindings` map + `ReadonlyMap<number,GPUTexture>` close a sparse-index/metadata gap; `sourceDisplayId` resolved via `derivePipelinePresentations`'s `displayNodeId↔outputName` pairing; one shared `parseChannelIndex` validator, same-channel/different-source conflicts rejected) and previous-frame buffer feedback, driven by its own fully independent `BufferFeedbackExecutor` (own `ResourceRealizer`, presentation texture, seed state, device/grid fingerprint) so it never shares — and can never collide with — `GraphFrameExecutor`'s own realizer; `target.bufferFeedback` sink dispatch wired all the way through `previewFrameLoop.ts`'s early-exit guard and `enumeratePreviewBuffers`, with a strict `gridWidth===input.width`/`gridHeight===input.height` contract instead of restructuring the shared-size result type. Independently re-verified: full diff read, all 19 gate items checked, workspace check/test/build re-run clean, both real-device proof tests confirmed to execute; one missing dispose-cascade test landed as its own follow-up (`984bfcb`), also independently re-verified. **Foundation 2 is fully closed.** | ✅ landed `35a75fb` + `984bfcb` | Cursor or Codex |

Further briefs are written as predecessors land. Independent briefs may execute in
parallel only under the ownership/worktree rules in the root
[`_TASK_BOARD.md`](../../../../_TASK_BOARD.md) (the nested `../TASK_BOARD.md` is retired —
unified into the root board 2026-07-03). **M9c** may run in parallel with M10 (does not block
GPU). **M9d** is proposed parallel polish while M11 is active — see proposal for architect
sign-off. Live status + resume entry point: [../STATUS.md](../STATUS.md).
