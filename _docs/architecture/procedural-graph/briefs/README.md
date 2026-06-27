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
| [M9-standalone-editor.md](./M9-standalone-editor.md) | M9 — standalone graph editor | ✅ landed (`5d891ea`; graph 13/13, runtime-cpu 14/14, graph-editor 7/7) | Opus/Cursor (done) |
| [M9b-multi-level-editing.md](./M9b-multi-level-editing.md) | M9b — multi-level editing (phased) | ✅ landed (`6f8a3ff`) | Composer (M9b.1–2); Sonnet (M9b.3–4) |
| [M10-runtime-webgpu.md](./M10-runtime-webgpu.md) | M10 — runtime-webgpu (phased) | ✅ landed (`ae7a4cb`; runtime-webgpu 6/6, graph-editor 37/37) | Sonnet (M10.1–2); Composer (M10.3) |
| [M9c-editor-ux-polish.md](./M9c-editor-ux-polish.md) | M9c — delete + duplicate (optional parallel) | ✅ landed (`ca493a4`) | Composer |
| [M11-tessellation.md](./M11-tessellation.md) | M11 — Tessellation primitives (phased) | ✅ landed (`7c4d8b5`) | Cursor (done) |
| [M12-vegetation.md](./M12-vegetation.md) | M12 — vegetation consumer (phased) | ✅ M12.1 landed (`bf999aa`) | Codex (done) |
| [M12.2-vegetation-gpu.md](./M12.2-vegetation-gpu.md) | M12.2 — GPU vegetation compute | ✅ landed (`2c75d96`) | Sonnet (done) |
| [M12.3-vegetation-preview.md](./M12.3-vegetation-preview.md) | M12.3 — editor vegetation preview | ✅ landed (`2d01d44`) | Composer (done) |
| [M9d3-code-highlighting.md](./M9d3-code-highlighting.md) | M9d.3 — syntax highlighting (CodeMirror) | ✅ landed (`ac77b2d`) | Composer (done) |
| [M9d-editor-shell-polish-proposal.md](./M9d-editor-shell-polish-proposal.md) | M9d — editor shell polish (proposal) | ✅ approved → split | Opus (signed off) |
| [M9d1-layout-persistence.md](./M9d1-layout-persistence.md) | M9d.1 — editor layout persistence | ✅ landed (`4d8da96`, Opus-reviewed) | Composer (done) |
| [M9d2-pane-context-menus.md](./M9d2-pane-context-menus.md) | M9d.2 — zone-aware pane menus (subdivide API) | ✅ landed (`7ae1929`) | Composer (done) |
| [M-multi-output-compile.md](./M-multi-output-compile.md) | Multi-output compile driver + consumer-stage model (**audit gap**) | 📌 contract ready | Cursor (Opus-pinned) |
| [M-mesh-gen-consumer.md](./M-mesh-gen-consumer.md) | Graph-driven mesh-gen consumer (tessellation via graph, not hardcoded) | 📌 contract ready · after multi-output + stage-entrypoints | Cursor (Opus-pinned) |
| [M-app-extraction.md](./M-app-extraction.md) | Extract standalone editor → `apps/graph-editor` (tech-debt) | 📌 contract ready | Cursor |
| [M-params-as-inputs.md](./M-params-as-inputs.md) | Params promotable to input ports (remap bounds wireable) | 📌 contract ready | Cursor |
| [M-primitive-immutability.md](./M-primitive-immutability.md) | Real WGSL source in CodeView; built-ins read-only; clone-to-edit | 📌 contract ready · fixes stub-source bug | Cursor |
| [M-shadertoy-poc.md](./M-shadertoy-poc.md) | ShaderToy PoC effects: cosine palette (S0) + Game of Life multibuffer (S0.5) | 📌 contract ready · after multi-output + render-target | Cursor |
| [M-pass-graph-executor.md](./M-pass-graph-executor.md) | Render-target / frame-graph executor (per-target res, feedback, ordering) | 📌 contract ready · after multi-output | Cursor |
| [M-planet-primitive-harvest.md](./M-planet-primitive-harvest.md) | Port planet-shader functions → primitives (feeds planet PoC P2; parity by reference) | 📌 contract ready | Cursor |
| [M-usegpu-primitive-harvest.md](./M-usegpu-primitive-harvest.md) | Port Use.GPU WGSL fns (SDF/noise/colour) → primitives (license-verify first) | 📌 contract ready | Cursor |

Further briefs are written as each milestone's predecessor lands (serialized).
**M9c** may run in parallel with M10 (does not block GPU). **M9d** is proposed
parallel polish while M11 is active — see proposal for architect sign-off.
Live status + resume entry point: [../STATUS.md](../STATUS.md).
