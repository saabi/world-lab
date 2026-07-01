# Task board — procedural-graph parallel work

Routable tasks for parallel agents. Each row points at a brief (the contract) and a
disjoint set of owned files so independent tasks run safely in parallel.

Protocol: claim the first UNCLAIMED task by editing its `Claimed by:` line; stay inside
your `Owns:` files; the brief is the contract. **Gate = `check` AND `test`** for every
package you touch (vitest alone is not enough — `tsc`/svelte-check must pass too), keep all
prior tests green, and for WGSL output do a validity check. Commit your task as its own
stage commit (**`git add -A` your scope incl. new test files — `git status` must show nothing
untracked in your scope before `DONE`; the orchestrator commits briefs/board/README/pending_issues**);
set `Status: DONE <hash>`. ⚠ visual tasks: paste a screenshot of the
confirmed behaviour. PATH: `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"`.
Tabs; verbatimModuleSyntax. See `_docs/architecture/procedural-graph/execution-and-delegation.md` §Gate hardening.

Coordinate only on shared files (e.g. `GraphEditor.svelte`): note who owns the shared edit.
The critical *dependency chain* stays serialized — never start a task whose prerequisite
is still open.

---

## Active

_(none claimed — add tasks below as briefs are pinned.)_

## Ready to route

- **Shared preview clock (synced uniforms)** — each preview pane runs its own `startTime`/
  `frame`, so panes animate out of phase. Add a shared `previewClock` (one `iTime`/`iFrame`
  source) read by all Effect panels; `iMouse` stays per-pane. Synced by default; leave a seam
  for a per-pane unsync toggle (UI later). Owns `graph-editor` new `previewClock.ts` +
  `EffectPreviewPanel.svelte`.
  Brief: `_docs/architecture/procedural-graph/briefs/M-shared-preview-clock.md`  ·  Claimed by: UNCLAIMED

- **`geometry.plane` orientation + dimensions** (user-flagged) — add width/height + orientation
  params (defaults reproduce the current fullscreen quad); WGSL + evalCPU parity. Owns
  `geometry.plane` primitive (graph) + plane WGSL (procedural-wgsl).
  Brief: `_docs/architecture/procedural-graph/briefs/M-plane-orientation-dimensions.md`  ·  Claimed by: UNCLAIMED

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
