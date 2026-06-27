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

## Current front (single serialized task)

- **Active:** **M10.3 — Editor GPU preview pane** per
  [briefs/M10-runtime-webgpu.md](./briefs/M10-runtime-webgpu.md).
- M10.2 plane scalar GPU consumer is landed (`executePlaneScalarPreview`).
- Do not start M11 until M10.3 gate is green.

## Known deviations / tracked tech-debt

| Item | Severity | State | Resolve by |
|------|----------|-------|-----------|
| Standalone editor is a scene-free **route** in `fe/` (`fe/src/routes/graph-editor`), not the `apps/graph-editor` workspace the editor ADR requires | low | Accepted interim — package + route verified scene-free, **guarded** by `packages/graph-editor/src/sceneFree.test.ts` | Extract `fe/src/routes/graph-editor` → `apps/graph-editor` **before M14/M16** (embedded editor / collaboration), ahead of M17 WebGPUToy |

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
