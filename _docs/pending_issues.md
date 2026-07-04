# Pending Issues

## /apps/scene-editor

- camera near/far should include all objects visible on screen, with considerations for next item
- when close to the surface and looking up, sometimes the planet dissappears
- ~~should move from apps/scene-editor/ to apps/scene-editor~~ ✅ done — OS1 world-lab identity + app-layout migration (`apps/scene-editor/` → `apps/scene-editor/`, `apps/webgputoy/` → `apps/webgputoy/`)

## /apps/webgputoy (procedural-graph editor; formerly `apps/webgputoy`)

> Resolved (see `_TASK_BOARD.md` archive): preview rerender-on-edit, preview lists outputs
> (buffer list), collapsible palette sections, node-swap UX, S0 pipeline render, unified named
> document save/load + samples + layout (`M-document-system.md`, `7cf7d0a`), help/usage
> tooltips + SDF alias removal (`5a17295`), node color-coding (`61b6359`), primitive help
> coverage (`af69aef`). Do not re-add.

- **node groups UX** not built: "Save as group", zone framing, and collapse-to-node. The group *system* (`groupToFunction`/`buildGroupModule`) exists; the editor authoring/collapse UI does not. See `node-model-design-notes.md` §E.
- ~~params-as-inputs not wireable in the editor~~ ✅ done (2026-07-03, `fa9697d`) — edge >
  literal > default precedence now lives in both `runtime-cpu/evalGraph.ts::resolveParams`
  (evalCPU) and `runtime-webgpu/emitGraphEval.ts` (WGSL codegen — this turned out to be the
  real per-node param-embedding path via a `GraphParams` uniform struct + `params.<field>`
  access for literals, substituting the upstream expression directly for edge-bound params;
  not `packages/compiler` at all, which is group-codegen only — worth remembering next time a
  brief needs to guess where "codegen" lives). `InspectorPanel.svelte`/`ParamForm.svelte` show
  a read-only "driven by `<node>.<port>`" label in place of the control for wired params.
  Brief: `M-params-as-inputs-remainder.md`.
- Functions representing group nodes must be decomposable into its components and editable upon request. Built-in group functions such as remap must be inspectable as graphs (ideally a la touchdesigner by zooming in or similar gesture) and outomatically cloned and replaced if modified.
- ~~The document load/save and samples UX is not well polished... including undo/redo functionality~~
  ✅ done (2026-07-01) — undo/redo landed (`history.svelte.ts`, a past/future `GraphDocument`
  stack hooked into the existing `applyEditIntent`/`updateGraph` choke point; per-action labels;
  Ctrl+Z/Ctrl+Shift+Z/Ctrl+Y + toolbar buttons; history resets on document load/new, not
  persisted, matching the pattern in `saabi/colorlab`). ~~Polish: delete-confirmation dialog,
  `updatedAt` timestamp shown per saved document, and a discard-changes confirm for the two
  states where edits aren't auto-saved~~ ✅ all three confirmed already built (2026-07-03,
  verified by reading `DocumentList.svelte`/`GraphEditor.svelte` directly, not assumed): a real
  two-step delete-confirm dialog (`deleteTarget` state, "Delete '{name}'? This can't be
  undone." with Cancel), `formatUpdatedAt` rendered per saved document in the switcher, and
  `confirmDiscardIfNeeded()` (`window.confirm`) gating `newGraph`/`loadSavedDocument`/
  `loadSampleDocument`/`triggerUpload` — exactly the two documented at-risk states (new/unnamed
  graph, loaded read-only sample — every other document already auto-saves on edit, so
  "unsaved changes" wasn't a real risk elsewhere). No further action needed on this bullet.
  Schema/artifact versioning was explicitly out of scope (owner: existing `GraphArtifactVersion`
  migration path is sufficient). Not yet exercised in a real browser — no browser-automation
  tool available in this environment; verified via check/test/build gates + a dev-server
  boot-and-serve check only.

## UI polish — webgputoy / graph-editor / subdivide (not built)

- ~~Node tint control is far from what it controls~~ ✅ done (2026-07-02) — a Blender-style
  `N`-key floating panel landed, centralized in `packages/subdivide` rather than hand-rolled by
  each app:
  - **Zone-scoped, not root-level.** `FloatingPanelSpec`/`FloatingPanelSide` (`floatingPanel.ts`)
    and `Subdivide.svelte`'s `floatingPanels` prop dock a panel to an edge of *whichever pane
    currently hosts a given zone* — `Subdivide` passes the full spec list to every `Pane.svelte`,
    which filters to its own `zone` and renders matches inside its own `.inner`, so the panel
    tracks that pane's position/size and follows if the zone is reassigned or split. Reserves no
    grid space either way — the pane keeps its full size whether the panel is open or closed.
  - **Hover-scoped `N` handling.** Each `Pane.svelte` tracks its own mouse-hover state and only
    responds to `N` (via `onfloatingpaneltoggle`) while the pointer is over it — other panes, and
    any panels they host, are unaffected, so multiple panes can each carry an independent side
    panel. `GraphEditor.svelte` still owns the actual open/closed state (`onfloatingpaneltoggle`
    callback, same pattern as `onlayoutchange`/`onopen`/`onclose`) and a toolbar `»` button for
    non-hover/keyboard-less access.
  - **Active-pane border highlight**, matching a pasted Blender reference: every pane now has a
    permanent subtle border with rounded corners (`.inner`), brightening on hover — the same
    `hovered` state drives both the border and the `N` targeting, since they're the same concept
    (Blender's "active area").
  - **Sized to content by default, not full pane height** — also matched to a pasted reference
    (Blender's Transform panel, which grows with its content rather than always spanning the
    edge). `FloatingPanelSpec.stretch` (default `false`) opts into the old always-full-height/
    width behavior instead.
  - **Reveal tab when closed** — matched to a third pasted reference (Blender's own collapsed-
    sidebar chevron): any pane with a closed panel bound to its zone shows a small clickable
    chevron tab at that panel's docking edge, pointing the direction the panel would slide in
    from; clicking it re-opens the panel through the same `onfloatingpaneltoggle` path as `N`.
  - **Pane header, restructured once already.** First pass added the zone label
    (`zoneLabels[zone]`) as a separate, conditionally-rendered `.pane-title-bar`, alongside
    `PaneHeader.svelte`'s pre-existing zero-size, absolutely-positioned corner-triangle
    "change pane type" trigger — which then visibly overlapped the new title text, since the
    triangle never participated in layout. Corrected: `PaneHeader.svelte` is now the one real
    header row (`.pane-header`, `flex: 0 0 var(--pane-title-bar-height)`, always present, since
    the menu trigger is a permanent fixture of every pane regardless of title) — the trigger is
    a real square button with a `▾` icon as its first flex child, and the title (still optional;
    a zone with no configured label just shows no text) is a sibling that fills the rest of the
    row, so the button naturally displaces it rather than overlapping. Both the reveal tab and
    the open floating panel now unconditionally clear `--pane-title-bar-height`, since the
    header row always reserves that space.
  - `GraphEditor.svelte` is the first consumer: one panel bound to the `canvas` zone, docked
    right — Node tint is its first, and currently only, content; a natural home for future
    per-view toggles too.
  - Caught and fixed a real pre-existing gap while adding this: `packages/subdivide`'s (and
    `graph-editor`'s and `editor-ui`'s) vitest configs had no `@testing-library/svelte`
    auto-cleanup between tests — invisible until a test queries via the global `screen` object
    with more than one `render()` call per file (existing tests in `graph-editor` avoided it by
    scoping to their own returned `container`). Fixed via
    `setupFiles: ['@testing-library/svelte/vitest']` in all three.
- ~~Divider hit/visual size~~ / ~~No active/dragging visual state on the divider itself~~ ✅
  done (2026-07-03, `4debfee`) — resting/hover widening is axis-aware (a horizontal divider's
  bar grows only on Y, vertical only on X — better than what the brief specified); `active`
  prop wired via `active={dragging === divider}` in `Subdivide.svelte`.
  Brief: `M-divider-visual-polish.md`.
  ~~Corner-triangle resize affordance at divider intersections~~ — **retired** (owner decision,
  2026-07-03); considered and dropped, not deferred. Not to be confused with `PaneHeader.svelte`'s
  own, unrelated corner-triangle (the "change pane type" trigger), which was separately already
  replaced with a real square button — see "Pane header, restructured once already" above.
- ~~Nodes can't be named~~ ✅ done (2026-07-03) — `Node.name?: string` (`packages/graph`'s
  `types.ts`), a rename field in `InspectorPanel.svelte`, and canvas label fallback
  (`node.name?.trim() || node.primitive`) in `irAdapter.ts::graphToFlow`. `c2eb302`.
  **Gap found after landing:** the brief's scope was canvas + inspector only — the preview-pane
  buffer selector (`previewBuffers.ts`) has its *own*, separate label logic that didn't read
  `node.name` at all: `labelForNode()` fell back to `node.primitive` for undeclared pipeline
  sinks, and declared pipeline outputs showed the auto-synthesized `pipeline_image[_<id>]`
  name directly as the label with no node-name override. Fixed: both paths now prefer the
  display sink node's `name` when set, falling back to the prior behavior (primitive id /
  synthetic output name) otherwise — the *underlying* output name/buffer `id` (the stable
  persistence key) is untouched, only the displayed label changes, so renaming a node doesn't
  churn a user's remembered buffer selection across reloads.
- ~~No drag-and-drop node placement from the palette~~ ✅ done (2026-07-03, `9c758cc`) —
  draggable palette primitives drop at the cursor's flow position via xyflow's
  `screenToFlowPosition`; click-to-add unchanged. A new `CanvasPaletteDropBridge.svelte`
  mounts inside `<SvelteFlow>`, mirroring the existing `CanvasFitViewBridge.svelte` pattern
  rather than inventing a new one; drag payload uses a custom MIME type
  (`application/x-world-lab-graph-primitive`) to avoid accidental drops from unrelated drag
  sources. Brief: `M-palette-drag-drop.md`.
- ~~WebGPUToy has no visible header/branding at all~~ ✅ done (2026-07-02) — real logo landed:
  `WebGpuToyLogo.svelte` (isotype + wordmark, theme-aware, `packages`-style SVG path data in
  `webGpuToyLogo.ts`), rendered into `GraphEditor.svelte`'s new `toolbarStart` snippet slot from
  `apps/webgputoy/src/routes/+page.svelte`; a real favicon (`src/lib/assets/favicon.svg`) wired
  through a new `+layout.svelte`, matching `apps/scene-editor`'s existing favicon pattern; source
  artwork kept at `_docs/assets/webGPUtoy.svg` for reference. Unlike `scene-editor`'s persistent
  `AppHeader.svelte`, the mark lives inside the editor's own toolbar rather than a separate
  app-level header bar — reasonable for a full-screen single-purpose editor that shouldn't spend
  vertical space on a redundant nav bar.
- ~~App header toolbar layout~~ ✅ done (2026-07-03, `b1c1409`) — all three sub-items
  resolved: Undo/Redo regrouped with the file-action cluster in `DocumentList.svelte`; the
  header's Delete button and the redundant `»` sidebar toggle both removed; Delete moved into
  the canvas sidebar's own new "Selection" section (sibling to the existing "Display"/Node
  tint section), reusing the floating-panel infrastructure rather than a new UI surface.
  Brief: `M-toolbar-reorg.md`.

- ~~Preview buffer selection resets on graph edit / recompile~~ ✅ done (2026-07-03, `80e13f4`)
  — root cause was exactly the suspected unstable buffer ids: `PreviewBuffer.id` gets
  re-derived from the enumeration each time and can churn, so `previewPaneSelection.ts` now
  also stores a stable `sourceKey` (`node:port` or `sink:<displayNodeId>`, from
  `previewBufferSourceKey`) per pane and resolves by that when the id no longer matches; sync
  only re-runs when the enumerated buffer *set* actually changes (a signature/equality check),
  not on every `updateGraph` call.


## Engine — compiler / runtime (not built)

- **params-as-inputs follow-on**: codegen + `evalCPU` must use the wired upstream value when a promotable param is connected (graph-core `resolveParamBindings` exists; compiler/runtime-cpu/editor integration pending). `M-params-as-inputs.md`.
- **frame-graph GPU executor**: pure core (`buildPassOrder`/`validatePassGraph`/`resolveTargetSizes`) ✅, and the **independent-output** GPU executor (`GraphFrameExecutor` — one shared loop, all live targets, shared uniforms) ✅ landed via `M-single-loop-preview.md` (`4a7f43d`+`c8dcceb`). **Remaining:** same-frame cross-target reads (render-target-as-texture GPU binding) + previous-frame **feedback** (ping-pong) for cyclic edges — needed for multibuffer + render-to-texture. See `M-unified-preview-execution.md` Part 3.
- **render targets beyond single-pass**: `iResolution` per write-target and `iChannelResolution` per read-target; the current runner is single-target. `inputs-cpu-and-resources.md`, `pipeline-as-graph.md`.
- **multi-mesh composition into one render target** (not built): `target.mesh` declares one
  generated mesh for preview/export and does not render into `target.display`. Add explicit
  draw submissions and a render-pass collector, conceptually
  `mesh → draw(transform, material, instances) → render.pass → target.display`, with a
  list-capable/variadic draw input so multiple meshes share one color/depth target. The pass
  contract must define draw order, depth testing/writes, blending, per-draw bindings, and
  attachment load/store behavior; do not model this by allowing ambiguous fan-in on ordinary
  single-value ports. This is separate from mesh generation and is required for authored scenes.
- **GPU particle-system graph** (not built): model particles as records in a persistent storage
  buffer, not as one mesh per particle. The baseline pipeline is
  `emitter + previous state + deltaTime + force fields → stage.compute:update →
  buffer.pingPong → draw.instanced(template mesh/billboard) → render.pass → target.display`.
  Required engine work: typed read/write storage-buffer resources; graph-executed compute
  dispatch and buffer dependencies; persistent ping-pong state; `host.deltaTime`/frame/seed
  inputs; vertex-stage `instance_index` access to particle records; and depth/blend/billboard
  render contracts. Start with a deterministic fixed-capacity buffer and slot-per-invocation
  update; add emission/death recycling, atomic append or compaction, indirect draw counts,
  multiple emitters, collisions, and terrain interaction afterward. Planet-scale use must
  simulate in body-local or camera-relative coordinates to preserve `f32` precision.
  **Reframed (2026-07-03) as three separately-motivated, already-partially-built capabilities
  rather than one particle-specific vertical** — each has working precedent elsewhere in the
  codebase, just siloed: (1) ~~instanced draw~~ ✅ done (2026-07-03, `c5a5927`) — extracted into
  `renderInstancedMesh` (new `consumers/instancedMeshDraw.ts`): caller-owned instance `GPUBuffer`
  (no internal `writeBuffer`, so a future compute-populated buffer works unchanged), configurable
  `InstanceVertexLayout` (no hardcoded stride), template-mesh shape modeled directly on
  vegetation's prior inline code. `vegetationPreview.ts` migrated to call it with its exact
  original 16-byte `vec3f + f32` layout — no behavior change, confirmed by parity tests. Not
  exposed as a graph-authorable primitive yet, per the brief's own explicit deferral. Brief:
  `M-instanced-mesh-draw-extraction.md`. The render half is shared with
  particles' needs; the instance-buffer *population* half isn't — vegetation's buffer is
  CPU-written once (`GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST`), particles need
  `STORAGE` added so a compute pass can write it every frame, which is a separate concern
  (capability 2). (2) **graph-driven compute dispatch** — `meshGen.ts`'s grid-sweep compute
  path already shares its underlying codegen (`emitGraphVec3Eval`/`buildParamsStructWgsl`) with
  the image pipeline's `emitGraphEval.ts`; a particle-update dispatch (N-particles-from-buffer,
  not grid-sweep) would be a sibling consumer reusing the same utilities, not a generalization
  of `meshGen.ts` itself. Not yet briefed. (3) **feedback/ping-pong** — the frame-graph pure
  core (`frameGraph/order.ts`) already models cross-frame feedback generically
  (`ChannelRead.previousFrame` is explicitly excluded from cycle detection;
  `RenderTarget.persistent`/`collectFeedbackTargets` already identify feedback targets) — only
  the type model (`RenderTarget.format: GPUTextureFormat`) and `resolveTargetSizes` are
  texture-specific; generalizing to a texture/storage-buffer union would let particle state
  reuse the same, already-correct cycle-detection algorithm this package's own multibuffer/S0.5
  work already needs. Not yet briefed. Particles become an integration brief once all three
  land, not the reason any one of them gets built.
- ~~graph-driven mesh-gen consumer~~ ✅ done (2026-07-03, `82f5a8b`) — `evaluateMeshGenCpu`/
  `executeMeshGen` + `MeshGenRequest` replace the hardcoded `surfaceMesh.ts::buildSurfaceMesh`
  CPU loop; `surface.cubeFace → transform.spherify` reproduces `surface.cubeSphere`'s own
  geometry as the decomposition proof.
  ~~**Gap found after landing:** the engine is genuinely graph-driven, but nothing in the
  editor points at it~~ ✅ done (2026-07-03, `704e1d1`) — new `target.mesh` sink primitive
  (`role: 'meshTarget'`, distinct from `target.display`'s `pipelineTarget`), `deriveMeshTargets`/
  `resolveMeshPreviewRequest` in `packages/graph`, and `MeshPreviewPanel.svelte`/
  `PreviewZone.svelte` rewritten to take a real `graph`/`meshRequest` instead of the hardcoded
  `surfaceId` demo toggle — an informative empty state shows when no `target.mesh` node is
  wired. A user can now wire `surface.cubeFace → transform.spherify → transform.normalDisplace
  → target.mesh` (spherify's output feeds both the displacement's `normal` input and
  `target.mesh`'s own `normal` — `cubeFace` alone has no `normal` output) and see it rendered
  live — the full chain from "what's missing to create graphs that displace geometry" is
  closed. Both bundled mesh samples (`displacedSphereMeshGraph`/`rotatedPlaneMeshGraph`) wire
  it this way already.
  ~~**Gap found via independent review (2026-07-03):** the "GPU" mesh path silently,
  permanently fell back to CPU for any normal editor graph~~ ✅ done (2026-07-03, `b16f0aa`) —
  `augmentGraphForMeshGen` builds a local, synthetic-augmented copy of the graph (never
  mutating `req.graph`) with output entries for whichever of position/normal aren't already
  declared, then slices/merges **both** subgraphs (not just position's), fixing the
  independent-normal-subgraph gap too; `renderMeshGenPreview`'s catch now `console.warn`s
  before falling back to CPU. Also picked up the low-priority cleanup noted alongside this
  (the wasted unconditional CPU eval for count metadata) — `executeMeshGen` now computes
  `vertexCount`/`indices` directly instead. A necessary addition I hadn't anticipated:
  `emitGraphEval.ts` needed per-output WGSL entry-point routing (`wgslEntryForOutput`) so a
  multi-output primitive like `surface.cubeSphere` resolves the right function per output port
  (`cubeSphere_normal` added alongside the existing `cubeSphere` entry). Brief:
  `M-mesh-gen-gpu-output-fix.md`.
- ~~Mesh preview — wireframe display mode~~ ✅ ~~orbit camera outside the graph~~ ✅ done
  (2026-07-03, `9d1e8e5`) — panel-owned yaw/pitch/distance camera (drag to orbit, scroll or
  pinch to dolly, default view identical to the prior fixed `lookAt` until the user interacts —
  `DEFAULT_MESH_PREVIEW_CAMERA` is derived from the same eye vector `viewProjection()` used to
  hardcode); wireframe via a dedicated `line-list` edge pass with deduplicated indices (chose the
  universally-portable path over testing `polygonMode: 'line'` adapter support, sidestepping that
  uncertainty entirely) plus a per-canvas `WeakMap` buffer cache so camera moves don't regenerate
  geometry. Brief: `M-mesh-preview-ux.md`.
- **resource GPU binds**: image/mesh/audio as actual GPU shader inputs (M8 delivered CPU views only) — required for ShaderToy `iChannel` textures (S1). `design-vs-implementation-audit.md`.
- **audio graphs (CPU-first)**: live wave/mic/file input, configurable buffer size, multi-resolution spectrograms, and custom JS/WASM processing — IR already has `audio` resources + `AudioCpuView`; missing block-oriented audio consumer, STFT primitives, wired `AudioPreviewPanel`, and `sink.audio`. Spec: `architecture/procedural-graph/audio-graphs.md` (phased A→B→C; GPU spectrogram viz optional in C). Placed in the Foundation roadmap (2026-07-03): Phase A is Foundation-independent (CPU-only, can start any time); Phase B only needs F2.1's lifetime concept, already landed; Phase C (optional GPU viz) is gated on F2.3 landing. See `elemental-webgpu-architecture-review.md`'s "Roadmap realignment §Audio graphs".
- **list container nodes** (`flow.forEach`/`reduce`/`map`): `list<T>` lowering landed (Slice 4); the container nodes for arbitrary per-element subgraphs (e.g. N dynamic lights) are a follow-on. `node-model-design-notes.md` §A.

## Standard library — node gaps

- ~~**`geometry.plane` needs orientation + dimensions**~~ ✅ `a55b8c2` — `width`/`height` + Euler XYZ rotation params on `geometry.plane`; WGSL + evalCPU parity; defaults preserve fullscreen quad. Composable `transform.*` nodes remain a follow-on (`node-model-design-notes.md` §B).
- **geometry transforms**: Slice A ✅ (`spherify`/`normalDisplace`, `ec84b01`) and Slice B ✅
  (`translate`/`scale`/`rotate`, `f56f309`) landed — `translate`/`scale` compose over already-
  registered `vector.add.vec3f`/`vector.mulScalar.vec3f`; `rotate` extracts and reuses
  `planeGridEulerRotate` directly rather than reimplementing it, and shares a
  `role: 'positionTransform'` swap family with the other two. Caught a real gate gap while
  reviewing this landing: `groups.test.ts` accessed `TRANSFORM_ROTATE_MODULE.dependencies` but
  that module correctly omits the field (rotate is self-contained, no `@use` dependency) —
  TypeScript flagged it even through the test's own `?? []` fallback, since the object literal
  never declared the property. Fixed by adding `dependencies: [] as const` to
  `TRANSFORM_ROTATE_MODULE`, matching sibling modules' shape (`f56f309`'s own `check` gate
  should have caught this; worth double-checking `check` was actually run, not just `test`).
  **Still open:** `displace` (the plain, non-normal-based field-offset variant — only
  `normalDisplace` landed), `twist`/`bend`/`affine`, non-uniform per-axis scale, and
  decomposing `geometry.cubeSphere` itself into `geometry.cube` + `transform.spherify` (an
  additive decomposition landed via `surface.cubeFace` for the mesh-gen consumer proof, but
  `geometry.cubeSphere` itself was deliberately left untouched, per that brief's own scope).
  `node-model-design-notes.md` §B.
- **colorlab harvest remainder**: OKLab/OKLCH ✅ (slice A, `9fbc58a`), chromatic adaptation ✅
  done (2026-07-03, `522e31a` — `color.chromaticAdapt`, Bradford, D65↔D50 defaults, registered
  as an ordinary primitive rather than a swap-family `colorSpace` member since its signature
  takes two extra white-point inputs). **Still open:** CVD simulation, gamut mapping — CVD
  needs a mode representation (protanopia/deuteranopia/tritanopia + severity) pinned as a
  design decision before it's briefable; gamut mapping is boundary generation, not a per-pixel
  conversion, and was always out of scope for this harvest. `M-colorlab-harvest.md`,
  `M-colorlab-harvest-slice-b.md`.
- **vegetation as nodes**: `veg.densityField`/`peakDetect`/`prominence`/`coverageMask` — the algorithm lives in `runtime-cpu/vegetation.ts` but isn't exposed as graph nodes. `primitive-library.md`.
- **terrain analysis primitives**: `slope`/`altitude`/`curvature`/`beachMask`/`ridgeMask`/`erosionApprox` (discussed turn 50; not built). `primitive-library.md`.
- low-hanging-fruit math/sdf/colour/noise still listed in `primitive-library.md` (e.g. `math.normalize` — needed by `spherify`).

## ShaderToy / PoC (not built)

- **S0.5 Game of Life** multibuffer effect (depends on the frame-graph GPU executor + ping-pong feedback). `M-shadertoy-poc.md`.
- **ShaderToy host inputs**: `iMouse` (normalized pointer), `iFrame`, `iChannel` textures — partial.
- **Planet PoC P0–P5**: instance-input model → tessellator composition → shaping-kernel codegen at parity → route-parity with `/scene`. `planet-pipeline-poc-feasibility.md`.

## Roadmap — not started (see `architecture/procedural-graph/implementation-plan.md`)

- **M13** planet shaping migration — **GATED** behind `renderer-unification-plan.md` (do not start; the planet PoC proves the path without touching the live renderer).
- **M14** document/session model · **M15** MCP build-out (scaffold only) · **M16** embedded editor + shared surfaces · **M17** WebGPUToy.

## Process / verification

- **Visual & GPU gates need a human eyeball** — headless green ≠ it renders. Device-compile coverage now runs in Node when the `webgpu` binding is available (`94d0629`); canvas integration tests still skip without a browser WebGPU canvas. See `packages/runtime-webgpu/README.md`.
- **`npm run check` can silently drift stale once `packages/*/dist` exists on disk.** OS4's
  `"customConditions": ["development"]` fix (each package's base `tsconfig.json`, added so
  `check`/`svelte-check` resolve `@world-lab/*` siblings via live `src/` instead of requiring a
  prebuild) only works reliably when `dist/` **doesn't exist yet**. Discovered 2026-07-01: after
  running the OS4 consumer-smoke-test / a full `npm run build`, `dist/` is left on disk (it's
  gitignored, so this never shows up in git, only locally), and a subsequent `npm run check`
  for `apps/webgputoy` silently resolved through `dist/*.d.ts` instead of source — same file-
  count drop (983 → 615) as the original bug, but now happening *because* `dist/` physically
  exists, not because it's missing. `customConditions` evidently doesn't fully override the
  special-cased `"types"` condition lookup once a matching `dist/*.d.ts` is actually present.
  Practical mitigation for now: clear `packages/*/dist` before trusting a `check` run if you've
  built locally in between (`rm -rf packages/*/dist`). Needs a real fix — options include
  reordering/renaming exports conditions, a `.gitignore`+pretest hook that clears `dist/` before
  `check`, or finding the actual TS resolution rule that's overriding `customConditions` here.

## Accessibility (not built — reference: `saabi/colorlab`'s `_docs/accessibility-controls-handoff.md`)

Colorlab's a11y work split into two kinds — a **required, structural keyboard/focus baseline**
(not opt-in, needed by any keyboard/AT user) and an **opt-in text-readability preferences**
layer (font scale, contrast, line-height; default appearance unchanged). Verified against
World Lab's actual current state (2026-07-01), not assumed — the gaps below are confirmed, not
guessed:

- ~~Zero landmark roles or skip-link, almost everywhere~~ ✅ Phase A done (2026-07-03,
  `5b64448`) — a focus-visible skip link + `<main id="main-content">` landmark in webgputoy's
  layout.
- ~~Existing a11y-linter warnings (`NodeSwapMenu.svelte:58`/`PortConnectMenu.svelte:58`,
  "dialog" role needs a tabindex value)~~ ✅ Phase A done (`5b64448`, `tabindex="-1"`) — real
  fix (not a bare attribute patch) landed alongside Phase B below.
- ~~No focus trap anywhere~~ ✅ Phase B done (2026-07-03, `06e710b`) — new
  `packages/graph-editor/src/focusTrap.ts` Svelte action (capture focusables, cycle
  Tab/Shift+Tab with wraparound, focus the first focusable on mount, save + restore
  `activeElement` on destroy, optional `onEscape`), applied to all four dialogs
  (`DocumentList.svelte`'s Save-As/Rename and Delete, `NodeSwapMenu.svelte`,
  `PortConnectMenu.svelte`) — the latter two had their old manual focus-`$effect`/Escape-
  keydown handlers removed entirely in favor of the action, not layered on top. DocumentList's
  two dialogs also close on Escape now (they didn't before).
- **Undocumented keyboard shortcuts.** `packages/graph-editor` now has a real shortcut set
  (Ctrl+Z/Shift+Z/Y undo-redo, Ctrl+D duplicate, Ctrl+C/V copy-paste, Delete/Backspace) with
  zero in-app discoverability — no shortcut reference, no hint in any `aria-label`. Colorlab's
  pattern: a "Keyboard" tab in its gesture-reference popover, `<dl>` two-column shortcut table.
- ~~Pointer-only custom controls~~ ✅ Phase C done (2026-07-03, `009f97f`) — scope was
  narrower than first thought: select/arrow-key move were already free via xyflow's own
  defaults (verified by reading its source directly). The real gap — ports had zero keyboard
  affordance — is fixed: `tabindex="0"` + `aria-label` on every port, Enter/Space opens the
  existing `PortConnectMenu` via a shared `openConnectMenu` helper (extracted so right-click
  and keyboard produce identical `matches`, no duplicated logic), plus `role="button"` and
  `:focus-visible` styling. Brief: `M-editor-a11y-phase-c.md`.
- **Text readability: 100% hardcoded `px` font sizes, zero `rem`.** Confirmed by grep: 17
  `font-size: Npx` rules in just `GraphEditor.svelte` + `DocumentList.svelte` alone (6 + 11),
  zero `rem` usage anywhere in `packages/graph-editor`. Same root cause colorlab hit — a root
  `font-size` scale preference has no effect until sizes cascade from `rem`/`em`. This is the
  same class of dense-small-text-for-power-users tradeoff colorlab explicitly chose to keep as
  *default* while adding an **opt-in**, localStorage-persisted font-scale/contrast/line-height
  preference (not saved in documents) — worth the same opt-in framing here rather than changing
  default density.

**Suggested phasing** (mirroring colorlab's, likely similar effort shape — hours not days per
phase): ~~**A** structural/no-behavior (landmarks, skip link, tabindex fixes)~~ ✅ done →
~~**B** focus trap action + apply to existing dialogs~~ ✅ done → **C** keyboard port
connection (pinned: `M-editor-a11y-phase-c.md`; node select/move already free via xyflow's
own defaults) → **D** in-app keyboard-shortcut reference → **E** opt-in text-readability
preferences (rem conversion is the prerequisite step; same mechanical unit-refactor colorlab
did across `app.css` and component `<style>` blocks).

## Umami — behavior tracking (cookieless analytics)

Self-hosted Umami is already deployed for usage stats. World Lab has **partial** integration today;
expand to consistent, privacy-conscious behavior tracking across apps (reference implementation:
[colorlab](https://github.com/saabi/colorlab) — custom `track()` events + disclosure in AppInfo).

**Current state**

- **`apps/scene-editor`:** env-gated script inject in `+layout.svelte` (`PUBLIC_UMAMI_SRC` +
  `PUBLIC_UMAMI_WEBSITE_ID`, build-time); `lib/analytics/umami.ts` exposes `injectUmami` /
  `track`, but almost no custom events are wired yet — page views only when env is set.
- **`apps/webgputoy`:** no Umami integration.
- **Root / PM2:** `ecosystem.config.cjs` documents Umami vars for scene-editor production; each
  app needs its own Umami **website ID** if tracked separately.

**To do**

- **Shared helper (optional):** extract or duplicate the colorlab `umami.ts` pattern into a small
  shared module (e.g. `packages/editor-ui` or a tiny `@world-lab/analytics` package) so both apps
  use the same inject + `track` API and typing (`app.d.ts` `window.umami`).
- **`apps/webgputoy`:** add env vars, layout inject, `.env.example` + README; separate website ID
  in Umami dashboard.
- **Custom events:** instrument high-signal interactions (document save/load, graph compile,
  preview mode, scene navigation, flight mode, etc.) — not every click; follow colorlab's named-
  event style (`track('event_name', { key: value })`).
- **Privacy / consent:** disclose Umami in an in-app info or settings surface (colorlab
  `AppInfo.svelte` pattern); analytics remain **opt-in via env at deploy time** and should stay
  cookieless; do not conflate with future error-reporting consent (see separate error-monitoring
  backlog if added).
- **Deploy checklist:** document per-app `PUBLIC_UMAMI_*` + `PUBLIC_SITE_URL` in PM2 / build CI;
  leave unset in dev for zero tracking.

## `packages/subdivide` — extract to standalone repo

- **Move `@world-lab/subdivide` out of the monorepo** into the standalone repo at
  [`/home/ushif/repos/svelte-subdivide`](../../svelte-subdivide) (upstream history:
  `sveltejs/svelte-subdivide`, Svelte 2). World Lab's current port lives in
  `packages/subdivide/` (Svelte 5 runes, layout-tree engine, tests) and should become the
  canonical source there — then consume it from world-lab as an external dependency (like
  colorlab does for reusable libs).
- ~~**Branch audit before merge**~~ ✅ done (2026-07-01) — compared `master`, `child-props`,
  and `v3` on `saabi/svelte-subdivide`. **Nothing left to port.** `v3` branches off partway
  through `child-props` and its two commits are byte-for-byte identical to commits already
  later in `child-props` — a dead end, safe to ignore. `child-props`' two real bugfixes
  (layout-on-instantiation, SSR-safe Mac/PC platform detection) are already present in
  `packages/subdivide`'s Svelte 5 port; the rest of that branch is either Svelte-3-lifecycle
  idioms (`beforeUpdate`/`tick()`) superseded by the runes rewrite, or its final commit — the
  author's own "temporary arbitrary child property change handling" experiment — which
  world-lab deliberately replaced with the `zone: string` + host-registry design (see this
  package's README). Whenever extraction happens, no reconciliation step is needed; the
  Svelte 5 port can move as-is.
- **npm publish name:** do **not** assume `subdivide` or `@sveltejs/svelte-subdivide` is
  available. Check registry ownership before publishing; if the name is taken or conflicts
  with the historical package, publish under a distinct scope/name (e.g. keep
  `@world-lab/subdivide` or another unused name). Document the chosen name in the extracted
  repo's `package.json` and update world-lab workspace deps accordingly.
