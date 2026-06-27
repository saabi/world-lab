# Task board — parallel build round 2 (TEMPORARY)

Coordination for parallel Cursor Composer agents. **Delete when round 2 is merged.**
Protocol: claim the first UNCLAIMED task by editing its `Claimed by:` line; stay inside
your `Owns:` files; brief is the contract; run `npm check`/`test` for every package you
touch (keep all green); commit your task as its own stage commit; set `Status: DONE <hash>`.
PATH: `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"`. Tabs; verbatimModuleSyntax.

**Opus owns this round:** `packages/compiler/**` (stage entry points) and
`packages/runtime-webgpu/src/frameGraph/**` (GPU executor). **Do not touch those.**

---

## R2-T0 — Stage entry points + bind-group layout  ·  Claimed by: OPUS (me)

- **Brief:** `_docs/architecture/procedural-graph/briefs/M-stage-entrypoints.md`
- **Owns:** `packages/compiler/src/stageEntry.ts` (+ test), `compiler/src/index.ts`.
- **Status:** ✅ DONE — `assembleStageEntry` wraps ConsumerShader → @vertex/@fragment/@compute
  entry + binding decls (text only, no AST). compiler 36/36. (committed below)

## R2-T1 — Use.GPU primitive harvest  ·  Claimed by: cursor-agent

- **Brief:** `_docs/architecture/procedural-graph/briefs/M-usegpu-primitive-harvest.md`
- **Owns:** `packages/procedural-wgsl/src/modules/{sdf,color,noise}/**` (new subdirs),
  `packages/procedural-wgsl/src/index.ts` (append), `packages/graph/src/primitives/{sdf,color}/**`
  (new), `packages/graph/src/primitives/index.ts` (append imports only).
- **Do NOT touch:** `graph/src/types.ts`, `graph/src/primitive.ts`, `compiler/**`,
  `runtime-webgpu/**`, the existing `primitives/terrain/**`.
- **Hard gate:** verify Use.GPU LICENSE permits redistribution + add attribution per the
  brief BEFORE copying; skip + reauthor anything unclear. Add `category` + `group` frontmatter.
- **Status:** UNCLAIMED

## R2-T2 — Extract standalone editor → `apps/graph-editor`  ·  Claimed by: Cursor

- **Brief:** `_docs/architecture/procedural-graph/briefs/M-app-extraction.md`
- **Owns:** new `apps/graph-editor/**`; root `package.json` (add `apps/*` to workspaces);
  `fe/src/routes/graph-editor/**` (remove); any `fe/` glue referencing that route.
- **Do NOT touch:** `packages/**` source (consume `@virtual-planet/graph-editor` as-is),
  other `fe/` routes.
- **⚠ visual gate:** the standalone app loads + GPU preview renders; report.
- **Status:** UNCLAIMED

---

## Round 3 (after R2 merges) — do NOT start now

pass-graph GPU executor (Opus, after R2-T0) · params-as-inputs · mesh-gen consumer · then
**ShaderToy PoC** (S0 cosine palette → S0.5 Game of Life) · planet PoC P0–P5.
