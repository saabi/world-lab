# Task board — Tier 1: fully functional editor pipeline (TEMPORARY)

Parallel tasks toward a trustworthy editor: see each node's real code, watch the whole
graph's compiled WGSL, and flag incomplete/invalid graphs. **Delete when Tier 1 merges.**

Protocol: claim the first UNCLAIMED task by editing its `Claimed by:` line; stay inside
your `Owns:` files; the brief is the contract. **Gate = `check` AND `test`** for every
package you touch (vitest alone is not enough — `tsc`/svelte-check must pass too), keep all
prior tests green, and for WGSL output do a validity check. Commit your task as its own
stage commit; set `Status: DONE <hash>`. ⚠ visual tasks: paste a screenshot of the
confirmed behaviour. PATH: `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"`.
Tabs; verbatimModuleSyntax. See `_docs/architecture/procedural-graph/execution-and-delegation.md` §Gate hardening.

These three touch **different graph-editor files** → safe in parallel (coordinate only on
`GraphEditor.svelte` if two need it; T3 owns the recompile wiring there).

---

## T-A — Final compiled-WGSL view  ·  Claimed by: Cursor

- **Brief:** `_docs/architecture/procedural-graph/briefs/M-compiled-wgsl-view.md`
- **Owns:** new `packages/graph-editor/src/compiledWgsl.ts` (+ test), `CompiledWgslPanel.svelte`;
  wire a new `compiled` zone in `GraphEditor.svelte`'s layout (coordinate with T3).
- **Note:** reuse the runtime's existing assembly (`compileGraph`/`assembleStageEntry`/the
  pipeline assembly) — no new codegen. Show compile errors as text, never crash.
- **Status:** DONE 63e2ea9

## T-B — Flag incomplete/invalid graphs (editor surfacing)  ·  Claimed by: Cursor

- **Brief:** `_docs/architecture/procedural-graph/briefs/M-graph-validation-flagging.md`
  — **Part 1 (validation rules) is DONE (`9af09e0`)**; do **Part 2** (editor surfacing).
- **Owns:** `packages/graph-editor/src/ValidationPanel.svelte`, `GraphNodeView.svelte`,
  `GraphCanvas.svelte`, and the validation call sites in `graph-editor` (switch to
  `validateGraphFull`).
- **Note:** call `validateGraphFull`; group issues by severity (`isWarning`); highlight
  offending nodes/ports/edges on the canvas; preview/compiled-view show "graph incomplete"
  not a crash.
- **Status:** DONE b1761ae

## T-C — Reliable recompile + real source for groups/pipeline nodes  ·  Claimed by: Cursor (Agent C)

- **Brief:** `_docs/architecture/procedural-graph/briefs/M-editor-recompile-and-node-source.md`
- **Owns:** `packages/graph-editor/src/primitiveSources.ts`, the preview/recompile reactivity
  in `GraphEditor.svelte` + `*PreviewPanel.svelte`, CodeView source resolution.
- **⚠ visual gate** — edit code/param/wire → preview AND compiled-WGSL view update; group +
  pipeline nodes show real source (no stubs).
- **Status:** DONE a8d758f

> **Tier 1 (T-A/T-B/T-C) all landed** — `63e2ea9`, `a146cdd`, `a8d758f`. Opus-reviewed
> green (check + test). Visual gates pending the human eyeball.

---

## T-D — 🔴 Real geometry + vertex codegen (replace pipeline stubs)  ·  Claimed by: UNCLAIMED

- **Brief:** `_docs/architecture/procedural-graph/briefs/M-real-geometry-vertex-codegen.md`
- **Why:** the pipeline nodes (`geometry.plane`/`fullscreenPlane`/`stage.vertex`/…) have
  **empty WGSL stubs** and the runner renders via a **hardcoded fullscreen triangle** — so
  the compiled WGSL has empty functions and no tessellation/geometry code. Make it real.
- **Owns:** `packages/procedural-wgsl/src/modules/pipeline/stubs.ts` (→ real `geometry.plane`
  grid WGSL + `evalCPU`; `buffer.persist`/`target.display` become honest "structural" nodes,
  not empty stubs), `packages/runtime-webgpu/src/consumers/fullscreenFragment.ts` +
  `pipelineGraph.ts` (build the vertex shader from `stage.vertex`+`geometry.plane`, drop the
  hardcoded `FULLSCREEN_VERTEX_WGSL`), `assembleStageEntry` vertex template if needed.
- **Gate (per the brief):** compiled WGSL contains real `plane_grid_position` math (not an
  empty `fn planeGrid() {}`) + a `@vertex` entry calling it; `geometry.plane` `evalCPU`
  parity at `resU/resV=2`; extend the no-stub guard so no registered node emits an empty
  body. **check AND test**; WGSL validity. ⚠ **visual**: the ShaderToy sample still renders
  (now node-driven) and the compiled-WGSL view shows real geometry/vertex code — screenshot.
- **Status:** UNCLAIMED

---

## Later — do NOT start now

params-as-inputs editor+codegen follow-on · Tier 2 (frame-graph GPU executor, resource GPU
binds, mesh-gen consumer, node-swap/groups/tooltips UX) · Tier 3 (transforms, colorlab
remainder, vegetation/terrain nodes) · Tier 4 (S0.5, planet PoC). See `work-plan.md`.
