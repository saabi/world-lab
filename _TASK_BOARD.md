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

- **Geometry transforms, Slice A** (`math.normalize` + `transform.spherify` +
  `transform.normalDisplace`, as node groups over existing/new elemental math ops)
  Brief: `_docs/architecture/procedural-graph/briefs/M-geometry-transforms-slice-a.md`
  Owns: new module(s) under `packages/procedural-wgsl/src/modules/math/`, `packages/graph/src`
  primitive + group registration for the three new ops (additive registry entries only)
  Claimed by: Auto · Status: in progress

## Done (recent)

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
