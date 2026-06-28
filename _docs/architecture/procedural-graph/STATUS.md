# Status & resume

**Purpose:** the single entry point for *any* agent (Claude, Cursor, Codex, Gemini)
to see exactly where the build stands and continue it — including mid-task, and
including a change of which agent is driving. Keep this file current at every task
boundary.

**Read order to resume:** [README.md](./README.md) →
[execution-and-delegation.md](./execution-and-delegation.md) → **this file** → the
active brief in [briefs/](./briefs/README.md). Then
`git --no-optional-locks log --oneline` for the per-stage commit ledger.

## Progress ledger

| Milestone | State | Gate | Commit |
|-----------|-------|------|--------|
| M0 — scaffold packages | ✅ | check green | `e6eb7a6` |
| M1 — Graph IR | ✅ | 5/5 | `774ddfd` |
| M2 — primitives + CPU eval | ✅ | 10/10 | `12be429` |
| M3 — self-describing WGSL + TypeBox params | ✅ | schema 18/18; graph 13/13; compiler 26/26 | `eb09625` |
| M4 — dependency slicing | ✅ | slice gate green | `44df2ce` |
| M5 — WGSL gen + module resolver | ✅ | 12/12 (compiler pkg) | `1c8a486` |
| M6 — ShaderLinker + WGSL tree-shake | ✅ | 12/12 (compiler pkg) | `8b19ece` |
| M7 — CPU runtime services | ✅ | 4/4 (runtime-cpu pkg) | `a579686` |
| M8 — resource inputs + CPU views | ✅ | graph 13/13; runtime-cpu 11/11 | `790a898` |
| M9 — standalone graph editor | ✅ | graph 13/13; runtime-cpu 14/14; graph-editor 7/7 | `5d891ea` |
| Vite graph-editor route fix | ✅ | fe check; dev/build | `cb1d789` |
| M9b.4 — CodeView + primitive ripple | ✅ | graph 14/14; graph-editor 29/29; fe check | `6f8a3ff` |
| Docs — param form addendum | ✅ | cross-links | `9897d3b` |
| Graph editor port sync + validation fix | ✅ | graph 17/17; graph-editor 32/32; runtime-cpu 14/14 | `ca493a4` |
| M10.1 — runtime-webgpu foundation | ✅ | runtime-webgpu 4/4 | `ca493a4` |
| M9c — delete + duplicate UX | ✅ | graph-editor 36/36 | `ca493a4` |
| M10.2 — plane scalar GPU consumer | ✅ | runtime-webgpu 6/6 (1 skipped without GPU) | `ceae0eb` |
| M10.3 — editor GPU preview pane | ✅ | graph-editor 37/37; fe check; manual `/graph-editor` GPU tab | `ae7a4cb` |
| M11.1 — surface-mapping primitives | ✅ | graph 20/20 | `e8300a9` |
| M9d.1 — editor layout persistence | ✅ | graph-editor 42/42 | `4d8da96` |
| M11.2 — frustum cull | ✅ | runtime-cpu 16/16 | `cfa2c29` |
| M9d.2 — zone-aware pane menus | ✅ | graph-editor 42/42 | `7ae1929` |
| M11.3 — cube-sphere mesh preview | ✅ | runtime-webgpu 10/10 (2 skip); graph-editor 42/42; fe check | `7c4d8b5` |
| Standard graph primitive expansion (streams A/B) | ✅ | graph 31/31 | `0a06cb4`, `8081af5` |
| Procedural-WGSL library + runtime resolver (stream C) | ✅ | procedural-wgsl 5/5; runtime-webgpu 12/12 (2 skip) | `3536b81`, `7e82082` |
| Graph editor app-shell sizing | ✅ | workspace check/test; fe build | `0e36836` |
| M12.1 — deterministic CPU vegetation candidates | ✅ | runtime-cpu 23/23; workspace green | `bf999aa` |
| M12.2 — GPU vegetation candidate compute | ✅ | runtime-webgpu 14/14 (2 skip) | `2c75d96` |
| M12.3 — editor vegetation preview | ✅ | graph-editor 48/48 | `2d01d44` |
| M9d.3 — CodeMirror syntax highlighting | ✅ | graph-editor 45/45 | `ac77b2d` |
| **Multi-output PoC build — round 1** | ✅ | see below | — |
| · T0 multi-output compile driver (keystone, Opus) | ✅ | graph 33/33, compiler 31/31 | `302667f` |
| · T1 planet-shader primitive harvest (12 terrain primitives) | ✅ | graph 49/49, procedural-wgsl 17/17 | `3c08c80` |
| · T2 primitive immutability + real WGSL + clone | ✅ | graph-editor 51/51 | `1ec544d` |
| · T3 extract `@virtual-planet/editor-ui` (chrome + controls) | ✅ | editor-ui 3/3, fe 0 err | `3b54458` |
| · T4 pass-graph executor — pure core | ✅ | runtime-webgpu frameGraph headless | `3fc520a` |
| **Round 2** | ✅ | | |
| · R2-T0 stage entry points (Opus) | ✅ | compiler 36/36 | `52334eb` |
| · R2-T1 Use.GPU primitive harvest (SDF/colour/noise, license-clean) | ✅ | graph 57/57, procedural-wgsl 22/22 | `0b69570` |
| · R2-T2 extract → `apps/graph-editor` (clears tech-debt) | ✅ | app build; fe 0 err | `2966e07` |
| · M-node-model-foundation (resource ports · list<T> · groups · role/contract) | ✅ | graph 76/76, compiler 37/37, workspace 333/333 | `3641621` |

## Current front

**Round 2 of the procedural graph engine is active and advancing:** the **M-node-model-foundation** milestone has landed cleanly (resource ports union, swap-family metadata, function-level node groups, list<T> lowering with static unrolling + dynamic loops, remap/opSubtract decomposition).

**Next:** general pipeline-as-graph integration (unifying the pipeline stage and pass graph nodes). Next milestone in the roadmap is **M-pipeline-nodes-s0** (building the full pipeline graph describing geometry, buffers, stages, and targets as nodes, consuming the node-model foundation).

**Background:** Stages A–D (the generic engine: IR → primitives → compiler → linker →
CPU/GPU runtime → editor → tessellation → vegetation) are complete. **M13** (migrating the
existing terrain renderer onto the shaping graph) stays **gated** behind
[renderer-unification-plan.md](../../renderer-unification-plan.md); the planet **PoC**
(P0–P5) proves the graph path without touching the live renderer.

## Known deviations / tracked tech-debt

| Item | Severity | State | Resolve by |
|------|----------|-------|-----------|
| ~~Standalone editor is a route in `fe/`, not `apps/graph-editor`~~ | — | ✅ **RESOLVED** (R2-T2 `2966e07`) — extracted to `apps/graph-editor` workspace; `fe/` route removed | done |
| M9d editor shell polish (code highlighting) | — | M9d.2 ✅; M9d.3 ✅ (`ac77b2d`) | done |

Reviewed 2026-06-27 (Opus) after the multi-agent handoff: M3–M10.2 all green
(schema 18, graph 17, compiler 26, runtime-cpu 14, runtime-webgpu 5+1-skip,
graph-editor 37); parameter-and-form-schema ADR is sound; `runtime-webgpu` is generic
and scene-free. No correctness drift found — only the packaging deviation above.

## Resume protocol (any agent)

1. The **brief is the spec**, the **gate (its tests) is the definition of done**, the
   **handoff names the next task**. Everything needed is in the repo — no chat
   history required.
2. `git log` is the progress ledger; the working tree may hold an in-flight
   (uncommitted) brief or implementation — continue from it.
3. Serialized for now: never start a milestone whose dependency is still open.
4. End every task with a `Handoff` line and update this file's ledger + current front.
5. **Design authorities** — subsystem ADRs override stream docs for their area; read
   the relevant one before changing it, and **update the ADR first** if policy shifts:
   - [wgsl-parsing-and-codegen.md](./wgsl-parsing-and-codegen.md) — WGSL
     parsing/codegen/linker/primitive-loader (no owned WGSL AST; text codegen;
     signature inference; linker via adapter). Touches M3, M5, M6.
   - [editor-and-scene-integration.md](./editor-and-scene-integration.md) —
     graph-editor scope vs scene tree (graph-editor edits **field graphs only**;
     scene integration is **host composition** via document refs; standalone app stays
     scene-free). Touches M9, M9b, body→graph linking.
   - [parameter-and-form-schema.md](./parameter-and-form-schema.md) —
     param SSOT, shared `SchemaForm` / inspector policy, three param classes
     (graph node / host input / GPU packer), `ParamSpec`→TypeBox convergence.
     Touches M3, M9, M9b, M13; do not extend `paramEditorSchema` for new work.

## If the architect (Opus / Claude) becomes unavailable — incl. out of credits mid-task

The only architect-reserved work is **pinning contracts** (a brief = public
signatures + failing tests) and **reviewing** implementations against the gate. Both
are fully externalized into the repo, so a handoff of the architect role is clean:

- A finished brief is a complete spec. A **half-written brief is on disk** in
  `briefs/` — finish it from the architecture docs
  ([graph-and-compiler.md](./graph-and-compiler.md),
  [schema-and-primitives.md](./schema-and-primitives.md),
  [inputs-cpu-and-resources.md](./inputs-cpu-and-resources.md)) while honoring the
  locked decisions in the [README](./README.md).
- **A top-tier non-Claude agent (e.g. Codex 5.5) may assume the architect role**:
  write/finish the contract, review implementations against the gate, and keep the
  loop going. The only requirement is Sonnet-class-or-better capability; the docs
  carry all the context. There is no hidden state in any single agent's session.
