# Roadmap

World Lab is **pre-1.0**. This roadmap distinguishes what exists today from where the
platform is headed — it is not a commitment or a schedule.

## Current capabilities

- **Procedural-graph engine** (`packages/graph`, `compiler`, `procedural-wgsl`,
  `runtime-cpu`, `runtime-webgpu`): a typed node/port graph IR, WGSL codegen with dependency
  slicing and shader linking, a standard library of noise/math/color/terrain/SDF/vector
  primitives, node groups (subgraphs compiled to functions), a role/contract swap-family
  model, and CPU + WebGPU evaluation. **Params-as-inputs** is wired end-to-end (a promotable
  param can be driven by an incoming edge instead of a literal, with edge > literal > default
  precedence in both `evalCPU` and WGSL codegen, and the editor shows a read-only "driven by"
  label for wired params). **Geometry transforms** exist as group-backed, zero-runtime-cost
  primitives (`transform.spherify`/`normalDisplace`/`translate`/`scale`/`rotate`) — a **graph-
  driven mesh-generation consumer** (replacing a hardcoded CPU loop) means any composition of
  a surface source, a noise field, and a displacement transform tessellates and renders, not
  just a fixed set of built-in surfaces. The colour library now includes OKLab/OKLCH space
  conversions and Bradford chromatic adaptation alongside the existing noise/math/SDF/terrain
  primitives.
- **WebGPUToy** (`apps/webgputoy`, `packages/graph-editor`): a standalone graph editor —
  searchable/categorized node palette, node-swap-by-contract, right-click port quick-connect,
  drag-and-drop node placement from the palette, live compiled-WGSL view, per-graph validation
  with node/port highlighting, a single shared-frame executor driving multiple independent
  preview panes with synced uniforms (including a **live mesh preview** wired to whatever the
  user actually authors, not a fixed demo), a named document system (save/load/samples,
  undo/redo, layout-in-artifact), user-facing node names, and a Blender-style `N`-key floating
  sidebar (`packages/subdivide`) for per-view canvas controls. Structural accessibility
  baseline in progress (landmarks + skip link landed; focus trap next).
- **Scene Editor** (`apps/scene-editor`): a WebGPU planet renderer — cube-sphere terrain,
  atmosphere, water, vegetation, eclipse shadows, orbital and surface flight, and a SunDog
  galaxy map for browsing/loading solar systems.
- **Monorepo hygiene**: npm workspaces, per-package `check`/`test` gates, Changesets for
  future independent package versioning (not yet published).

## Near-term — open-source and deployment readiness

- Finish public-facing docs and governance (this pass).
- CI on every push/PR (check + test + build across workspaces).
- Maintain MIT licensing and deployment metadata for both public apps.
- Decide npm-publish readiness per package (source-TS exports vs. a built `dist/`) before
  lifting `private: true` on any `packages/*`.
- Choose a broader npm scope for reusable packages (`@world-lab/*` is preferred if the npm
  scope is controlled) and complete the external-consumer gates in
  [`OS4-package-publishing-readiness.md`](_docs/open-source/briefs/OS4-package-publishing-readiness.md).
- Close the remaining procedural-graph gaps already tracked in
  [`_docs/pending_issues.md`](_docs/pending_issues.md) — node-groups authoring UX
  (save-as-group, zone framing, collapse-to-node) and cross-target/feedback rendering are the
  two structural ones left; params-as-inputs and the first geometry-transform slices have
  since landed.

## Mid-term — world-authoring direction

- **Geometry transforms**, in progress: the rigid/composable set landed
  (`spherify`/`normalDisplace`/`translate`/`scale`/`rotate`, all group-backed over elemental
  math ops, zero runtime cost). Still open: a plain field-driven `displace` (only the
  normal-based variant exists), `twist`/`bend`/`affine`, non-uniform per-axis scale, and
  actually decomposing `geometry.cubeSphere` itself into `geometry.cube` + `transform.spherify`
  (a parallel decomposition — `surface.cubeFace` reproducing `cubeSphere`'s geometry — proved
  the approach without touching `cubeSphere`'s own, still-monolithic implementation).
- **Frame-graph GPU executor**: the single-loop, independent-output executor landed (multiple
  preview panes sharing one frame clock and uniforms). Still open: same-frame cross-target
  reads (render-target-as-texture GPU binding) and previous-frame feedback (ping-pong) for
  cyclic edges — needed for multibuffer and ShaderToy-style multi-pass effects.
- Migrate the scene/planet renderer's shaping pipeline onto the procedural-graph engine
  incrementally, gated behind parity with the live renderer (no regressions to `/scene`).
- Deeper node-groups authoring (save-as-group, zone framing, collapse/expand, inspectable
  built-in groups) — not yet built; the underlying group system existed already, the editor
  authoring/collapse UI is the remaining piece.

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
