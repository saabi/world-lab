# Milestone briefs

Self-contained, routable specs for executing
[implementation-plan.md](../implementation-plan.md) milestones. Each brief is a
**contract a single agent can fulfill**: objective, files, public signatures, the
failing tests that are the acceptance gate, what's out of scope, dependencies, and a
handoff. See [execution-and-delegation.md](../execution-and-delegation.md) for who
runs what.

## Conventions

- **Serialized for now.** One brief in flight at a time. Parallel execution waits
  until synchronization-workflow docs exist.
- **Self-contained.** A brief links the relevant stream doc(s) so a fresh or
  external agent (Cursor / Codex / Gemini Antigravity) needs no other context.
- **Gate = done.** The task is complete when the brief's tests are green and
  `npm run check` / `npm test` pass for the touched package, with **no new public
  API** beyond the brief.
- **Design ADRs.** Policy that spans milestones (e.g.
  [wgsl-parsing-and-codegen.md](../wgsl-parsing-and-codegen.md),
  [editor-and-scene-integration.md](../editor-and-scene-integration.md),
  [parameter-and-form-schema.md](../parameter-and-form-schema.md)) outrank
  stream docs when they conflict; update the ADR before changing dependent briefs.

## Index

| Brief | Milestone | Status | Recommended executor |
|-------|-----------|--------|----------------------|
| [M1-graph-ir.md](./M1-graph-ir.md) | M1 — Graph IR | ✅ landed (5/5 green) | Sonnet (done) |
| [M2-primitives.md](./M2-primitives.md) | M2 — Primitive registration | ✅ landed (10/10 green) | Cursor (done) |
| [M3-self-describing-wgsl.md](./M3-self-describing-wgsl.md) | M3 — self-describing WGSL + TypeBox param convergence | ✅ landed (`eb09625`; schema 18/18, graph 13/13, compiler 26/26) | Codex (done) |
| [M4-slicing.md](./M4-slicing.md) | M4 — Dependency slicing | ✅ landed (`44df2ce`) | Cursor (done) |
| [M5-codegen.md](./M5-codegen.md) | M5 — WGSL gen + module resolver | ✅ landed (`1c8a486`) | Cursor (done) |
| [M6-linker.md](./M6-linker.md) | M6 — ShaderLinker + tree-shake | ✅ landed (`8b19ece`) | Cursor (done) |
| [M7-cpu-runtime.md](./M7-cpu-runtime.md) | M7 — CPU runtime services | ✅ landed (`a579686`, 4/4 green) | Codex (done) |
| [M8-resource-inputs.md](./M8-resource-inputs.md) | M8 — resource inputs + CPU views | ✅ landed (`790a898`; graph 13/13, runtime-cpu 11/11) | Codex (done) |
| [M9-standalone-editor.md](./M9-standalone-editor.md) | M9 — standalone graph editor | ✅ landed (`5d891ea`; graph 13/13, runtime-cpu 14/14, graph-editor 7/7) | Sonnet (impl); Composer (bulk) |

Further briefs are written as each milestone's predecessor lands (serialized).
Live status + resume entry point: [../STATUS.md](../STATUS.md).
