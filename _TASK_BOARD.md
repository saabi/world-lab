# Task board — procedural-graph parallel work

Routable tasks for parallel agents. Each row points at a brief (the contract) and a
disjoint set of owned files so independent tasks run safely in parallel.

Protocol: claim the first UNCLAIMED task by editing its `Claimed by:` line; stay inside
your `Owns:` files; the brief is the contract. **Gate = `check` AND `test`** for every
package you touch (vitest alone is not enough — `tsc`/svelte-check must pass too), keep all
prior tests green, and for WGSL output do a validity check. Commit your task as its own
stage commit; set `Status: DONE <hash>`. ⚠ visual tasks: paste a screenshot of the
confirmed behaviour. PATH: `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"`.
Tabs; verbatimModuleSyntax. See `_docs/architecture/procedural-graph/execution-and-delegation.md` §Gate hardening.

Coordinate only on shared files (e.g. `GraphEditor.svelte`): note who owns the shared edit.
The critical *dependency chain* stays serialized — never start a task whose prerequisite
is still open.

---

## Active

_(none claimed — add tasks below as briefs are pinned.)_

## Ready to route

- **Canonical data types + input-port defaults** — `vec2f` ≡ `vec2<f32>` desync breaks
  connections (`mulScalarVec2f`); add one `canonicalDataType` enforced at every boundary +
  consolidate the dup `wgslTypeFor`. Also add optional `default` to input ports (unconnected →
  literal) and apply to vector components (x,y,z=0, w=1). One owner, two parts (shares
  `emitGraphEval.ts`+`types.ts`). Owns graph/compiler/runtime-cpu/runtime-webgpu vector+type
  files — **disjoint from node-swap**, parallel-safe.
  Brief: `_docs/architecture/procedural-graph/briefs/M-datatype-canonical-and-port-defaults.md`  ·  Claimed by: UNCLAIMED

## Later — do NOT start now

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
