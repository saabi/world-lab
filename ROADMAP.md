# Roadmap

World Lab is **pre-1.0**. This roadmap distinguishes what exists today from where the
platform is headed — it is not a commitment or a schedule.

## Current capabilities

- **Procedural-graph engine** (`packages/graph`, `compiler`, `procedural-wgsl`,
  `runtime-cpu`, `runtime-webgpu`): a typed node/port graph IR, WGSL codegen with dependency
  slicing and shader linking, a standard library of noise/math/color/terrain/SDF/vector
  primitives, node groups (subgraphs compiled to functions), a role/contract swap-family
  model, and CPU + WebGPU evaluation.
- **WebGPUToy** (`apps/webgputoy`, `packages/graph-editor`): a standalone graph editor —
  searchable/categorized node palette, node-swap-by-contract, right-click port quick-connect,
  live compiled-WGSL view, per-graph validation with node/port highlighting, a single
  shared-frame executor driving multiple independent preview panes with synced uniforms, and
  a named document system (save/load/samples, layout-in-artifact).
- **Scene Editor** (`apps/scene-editor`): a WebGPU planet renderer — cube-sphere terrain,
  atmosphere, water, vegetation, eclipse shadows, orbital and surface flight, and a SunDog
  galaxy map for browsing/loading solar systems.
- **Monorepo hygiene**: npm workspaces, per-package `check`/`test` gates, Changesets for
  future independent package versioning (not yet published).

## Near-term — open-source and deployment readiness

- Finish public-facing docs and governance (this pass).
- CI on every push/PR (check + test + build across workspaces).
- Decide and add the MIT `LICENSE`, remove the archived `fe.old/` reference, and do a final
  pass over deployment domains/metadata — **only once the repo owner says it's ready to open**.
- Decide npm-publish readiness per package (source-TS exports vs. a built `dist/`) before
  lifting `private: true` on any `packages/*`.
- Close the remaining procedural-graph gaps already tracked in
  [`_docs/pending_issues.md`](_docs/pending_issues.md) (params-as-inputs wiring, node-groups
  authoring UX, cross-target/feedback rendering, transform primitives).

## Mid-term — world-authoring direction

- **Geometry transforms** as composable nodes (`transform.translate/rotate/scale/spherify/…`),
  decomposing built-ins like `cubeSphere` into elemental, reusable pieces.
- **Frame-graph GPU executor**, completed: same-frame cross-target reads and previous-frame
  feedback (ping-pong/multibuffer), unlocking ShaderToy-style multi-pass effects.
- **Params-as-inputs**: promotable node parameters wireable as ports end-to-end (editor +
  codegen), with connected-vs-literal display.
- Migrate the scene/planet renderer's shaping pipeline onto the procedural-graph engine
  incrementally, gated behind parity with the live renderer (no regressions to `/scene`).
- Deeper node-groups authoring (save-as-group, zone framing, collapse/expand, inspectable
  built-in groups).

## Long-term — game-dev platform potential

World Lab is **not** a game engine today. The architecture is meant to leave room for one to
grow from it, without committing to a timeline:

- Mesh import and placement, instancing.
- Procedural graphs authoring materials, terrain, and vegetation together.
- Exportable world documents (a portable format for authored scenes/worlds).
- Runtime and game-dev-tooling integrations beyond the browser-based editors.

## Non-goals for now

- World Lab is **not** a complete game engine, and this roadmap does not claim it will become
  one on any timeline.
- No npm package publishing until explicitly enabled per package.
- No renderer rewrite for the sake of the migration — the scene/planet renderer's live
  rendering gates (see `AGENTS.md`) are never broken to advance the graph engine.
- No CI publish automation until publishing itself is enabled.
