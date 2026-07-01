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

- **Vector combine/append primitives** — nodes to build larger vectors from smaller ones +
  scalars (`vec3f,f32 → vec4f`, `vec2f,f32 → vec3f`, `vec2f,vec2f → vec4f`, `vec2f,f32,f32 →
  vec4f`); appended-scalar port defaults (z=0, w=1) double as promote-with-default. Owns the
  vector modules in `procedural-wgsl` + `graph` — disjoint, parallel-safe.
  Brief: `_docs/architecture/procedural-graph/briefs/M-vector-combine-primitives.md`  ·  Claimed by: Auto

- **Port quick-connect (right-click a port → add compatible connected node)** — right-click an
  output port → menu of type-compatible consumers; input port → compatible producers; select →
  node added and wired. New `compatibleConsumers`/`compatibleProducers` (graph) +
  `add-connected-node` intent (irAdapter) + `PortConnectMenu.svelte`. Owns graph helper,
  `irAdapter.ts`, `GraphNodeView.svelte`, new menu — parallel-safe (coordinate `GraphNodeView`
  only if another editor task touches it).
  Brief: `_docs/architecture/procedural-graph/briefs/M-port-quick-connect.md`  ·  Claimed by: UNCLAIMED

- **Save pane layout with each graph + load toggle** — persist the `LayoutDocument` in the
  saved/downloaded graph artifact (wrapper, not in the pure `GraphDocument`); a toggle next to
  Load (default ON) applies the graph's saved layout, else the default. Owns
  `documentStorage.ts` + `GraphEditor.svelte` (+ chrome flag). Coordinate on `GraphEditor.svelte`.
  Brief: `_docs/architecture/procedural-graph/briefs/M-per-graph-layout.md`  ·  Claimed by: UNCLAIMED

- **Image preview presents opaque RGB** — a valid pipeline renders blank because the fragment
  alpha (`constant.f32 → vec4f.w`, default 0) makes `putImageData` paint fully transparent.
  ShaderToy ignores `fragColor.a` for display; force alpha to 255 on present (in the readback
  or the panel). Owns `EffectPreviewPanel.svelte` (± the fullscreen readback).
  Brief: `_docs/architecture/procedural-graph/briefs/M-image-preview-opaque-alpha.md`  ·  Claimed by: UNCLAIMED

- **Device-compile test hardening** (infra) — make `npm test` actually compile WGSL against a
  software WebGPU adapter (currently all device tests `skipIf(!hasWebGPU)` and silently skip);
  add a consumer-coverage device test that catches the "string-valid but GPU-rejected" class
  (bit us 3×). Brief: `_docs/architecture/procedural-graph/briefs/M-device-compile-test-hardening.md`.

params-as-inputs editor+codegen follow-on · Tier 2 (frame-graph GPU executor, resource GPU
binds, mesh-gen consumer, node-swap/groups/tooltips UX) · Tier 3 (transforms, colorlab
remainder, vegetation/terrain nodes) · Tier 4 (S0.5, planet PoC). See `work-plan.md`.

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
