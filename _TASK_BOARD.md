# Task board — parallel build round 1 (TEMPORARY)

Coordination file for parallel Cursor Composer agents. **Delete when round 1 is merged.**

## How to use this board (read fully before claiming)

1. **Claim exactly one UNCLAIMED task** by editing its `Claimed by:` line to your agent
   id/name (e.g. `Claimed by: cursor-1`). Agents are launched **serially** so claims don't
   race — claim the first UNCLAIMED task top-to-bottom, then start.
2. **Stay inside your task's `Owns:` files/dirs.** Do **not** edit another task's owned
   files — that's how we avoid merge conflicts in the shared tree. If you think you need a
   file another task owns, stop and report instead.
3. The linked **brief is the full contract.** Its tests are the gate. No new public API
   beyond the brief.
4. Conventions: `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"`; tabs;
   `verbatimModuleSyntax` (`import type`, `.js` relative imports). Run
   `npm run check`/`npm test` for every package you touch; keep all prior tests green.
5. **Commit your task as its own stage commit** when green. Then set `Status: DONE <hash>`
   and write a one-line handoff.
6. Do **not** touch `packages/graph/src/types.ts`, `packages/graph/src/primitive.ts`, or
   `packages/compiler/` — **Opus owns the keystone there this round.**

## Dependency / conflict notes

- Blocked until the keystone (multi-output) lands — **not in this round:** stage
  entrypoints, mesh-gen consumer, ShaderToy PoC, pass-graph **GPU executor**, params-as-inputs
  (touches graph/compiler core).
- `procedural-wgsl` + `graph/src/primitives/` is owned by **T1 only** this round (usegpu
  harvest waits for round 2 to avoid index collisions).
- `fe/` restructure is **T3 only** this round (app-extraction waits — it also moves fe/ + the
  graph-editor route).

---

## T0 — Multi-output compile driver  ·  Claimed by: OPUS (me)

- **Brief:** `_docs/architecture/procedural-graph/briefs/M-multi-output-compile.md`
- **Owns:** `packages/graph/src/types.ts` (consumer fields), `packages/compiler/src/compileGraph.ts`,
  `packages/compiler/src/index.ts`, `packages/compiler/src/compileGraph.test.ts`
- **Status:** ✅ DONE — `PipelineStage` + consumer `id?/stage?`; `compileGraph()` →
  per-consumer shaders + `sharedModuleIds`. graph 33/33, compiler 31/31, no regressions.
  (committed below)

## T1 — Planet-shader primitive harvest  ·  Claimed by: Cursor

- **Brief:** `_docs/architecture/procedural-graph/briefs/M-planet-primitive-harvest.md`
- **Owns:** `packages/procedural-wgsl/src/modules/terrain/**` (+ that area's index),
  `packages/graph/src/primitives/terrain/**`, `packages/graph/src/primitives/index.ts`
  (append imports only — coordinate: this file is yours this round),
  `packages/procedural-wgsl/src/index.ts` (append).
- **Do NOT touch:** `graph/src/types.ts`, `graph/src/primitive.ts` (Opus). Other primitives.
- **Note:** parity by reference — copy planet WGSL verbatim; add `category` + `group` frontmatter.
- **Status:** DONE `3c08c80` — 12 planet primitives registered; graph 49/49, procedural-wgsl 17/17.
- **Handoff:** Planet PoC P2 can assemble `domainWarp → voronoi → detailFbm → heightRemap` from real nodes.

## T2 — Primitive immutability + real WGSL source + clone  ·  Claimed by: Cursor

- **Brief:** `_docs/architecture/procedural-graph/briefs/M-primitive-immutability.md`
- **Owns:** `packages/graph-editor/src/primitiveSources.ts`, `CodeView.svelte`,
  `primitiveEditor.ts`, `fixtures/**`, plus any new `userPrimitives*.ts` in graph-editor.
- **Do NOT touch:** `graph-editor/package.json` deps or `sceneFree.test.ts` (T3 owns those),
  `graph/` core.
- **⚠ visual gate** — needs a manual `/graph-editor` check (report what you see).
- **Status:** DONE `1ec544d` — CodeView shows real procedural-wgsl sources; built-ins read-only
  with Clone → `user.*`; graph-editor 51/51 + fe check green. Visual: route HTTP 200; browser
  MCP could not reach WSL localhost (manual verify Clone/Save in Code pane).

## T3 — Extract editor-ui (chrome + controls)  ·  Claimed by: cursor-agent

- **Brief:** `_docs/architecture/procedural-graph/briefs/M-editor-ui-extraction.md`
- **Owns:** new `packages/editor-ui/**`; `fe/` import re-points for the moved components;
  `packages/graph-editor/package.json` (add the dep) + `graph-editor/src/sceneFree.test.ts`
  (allow `editor-ui`). Root `package.json` is **not** edited (packages/* glob already covers it).
- **Do NOT touch:** `fe/src/routes/graph-editor/` structure (leave the route in place),
  graph-editor source files other than package.json + sceneFree.
- **⚠ visual gate** — `/scene` sections + sliders still work; report.
- **Status:** DONE 3b54458 — `@virtual-planet/editor-ui` ships Section/Subsection/VerticalTabs + SliderRow/Range/LogRange/CheckBox; fe re-pointed; sceneFree allow-lists editor-ui.

## T4 — Pass-graph executor: PURE CORE ONLY  ·  Claimed by: cursor-agent

- **Brief:** `_docs/architecture/procedural-graph/briefs/M-pass-graph-executor.md` —
  **Parts 1–3 only** (target model, `buildPassOrder`/`validatePassGraph`, `resolveTargetSizes`).
  **Skip Part 4 (GPU executor)** this round — it depends on the keystone; defer to round 2.
- **Owns:** new `packages/runtime-webgpu/src/frameGraph/**` (types.ts, order.ts, *.test.ts),
  `packages/runtime-webgpu/src/index.ts` (append the frameGraph re-exports only).
- **Do NOT touch:** existing consumers, `runtime-webgpu/src/types.ts`.
- **Gate:** the headless pure-core tests in the brief's gate items 1 (ordering/lifetimes/
  validation) and the `resolveTargetSizes` test. GPU test (item 2) is round 2.
- **Status:** DONE 3fc520a — `frameGraph/types.ts` + `order.ts` (validate/build/lifetimes/sizes); 6 headless tests green; GPU executor still round 2.

---

## Round 2 (after round 1 merges) — do NOT start now

params-as-inputs · usegpu-harvest · pass-graph GPU executor · stage-entrypoints (Opus) ·
app-extraction · then ShaderToy PoC · mesh-gen consumer.
