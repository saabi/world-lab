# World Lab

**World Lab** is an early-stage, WebGPU-first world-authoring platform. It's a monorepo
(SvelteKit 2 + Svelte 5 + TypeScript) built around a typed, schema-driven procedural-graph
engine, currently used to power a planet renderer and a general-purpose shader/graph editor.
It is **pre-1.0** and under active development — expect breaking changes, and treat
in-repo design docs as the source of truth over any external description.

## Apps

| App | Directory | What it is |
|-----|-----------|------------|
| **Scene Editor** | [`apps/scene-editor/`](apps/scene-editor/) | The current scene / solar-system / planet-renderer app ("Virtual Planet" is its renderer subsystem's name; a public product name is still open). WebGPU cube-sphere planet rendering, orbital flight, a SunDog-driven galaxy map. |
| **WebGPUToy** | [`apps/webgputoy/`](apps/webgputoy/) | A standalone procedural-graph editor and WebGPU playground: build shader/field graphs from typed nodes, watch the compiled WGSL, preview multiple render targets live. |

Each app has its own README (linked above) with local dev, build, and deployment details,
and its own CHANGELOG ([Scene Editor](apps/scene-editor/CHANGELOG.md),
[WebGPUToy](apps/webgputoy/CHANGELOG.md)).

## Packages

Reusable libraries under `packages/*`, currently private (not yet published to npm):

| Package | Role |
|---------|------|
| `@virtual-planet/schema` | TypeBox-based schema/type layer (units, extents, path refs) |
| `@virtual-planet/graph` | Typed Graph IR — nodes, ports, validation, serialization |
| `@virtual-planet/compiler` | Graph compiler — dependency slicing, WGSL codegen, module resolution, shader linking |
| `@virtual-planet/procedural-wgsl` | Standard library of reusable WGSL function modules (noise, terrain, vegetation, math, color) |
| `@virtual-planet/runtime-cpu` | CPU runtime — camera/picking, resource sampling, CPU primitive evaluation |
| `@virtual-planet/runtime-webgpu` | WebGPU runtime — buffers, pipelines, bind groups, consumers, frame executor |
| `@virtual-planet/graph-editor` | Reusable Svelte graph-editor components over the Graph IR (host-app agnostic) |
| `@virtual-planet/editor-ui` | Shared Svelte editor chrome and parameter controls |
| `@virtual-planet/subdivide` | Resizable pane-layout engine for Svelte 5 |
| `@virtual-planet/mcp-server` | MCP server exposing the Graph IR to AI assistants |

`fe.old/` is an archived pre-migration reference (not a workspace) — do not develop there.

## Local setup

Requires **Node.js ≥ 22** (see `apps/scene-editor/.nvmrc`, pinned `22.22.2`). Install once from
the repo root — one lockfile links every workspace:

```sh
npm install
npm run check   # svelte-check / tsc across every workspace
npm test        # vitest across every workspace
npm run build   # production build for every workspace
```

Run an individual app:

```sh
npm run dev:scene-editor   # or: cd apps/scene-editor && npm run dev
npm run dev:webgputoy      # or: cd apps/webgputoy && npm run dev
```

Package-level commands run from the package directory, or from the root via
`npm run check -w @virtual-planet/schema` / `npm test -w @virtual-planet/schema`.

## Current status

Pre-1.0. The procedural-graph engine, its standard library, and the WebGPUToy editor are
under active, fast-moving development; the scene/planet renderer is being migrated toward
the same graph engine incrementally (see [ROADMAP.md](ROADMAP.md)). There is no lint/format
step — `npm run check` is the type/correctness gate. See
[`_docs/pending_issues.md`](_docs/pending_issues.md) for the live backlog.

## Documentation

- [**AGENTS.md**](AGENTS.md) — architecture, commands, and agent/contributor workflow (read
  this first if you're changing code).
- [`_docs/architecture/procedural-graph/`](_docs/architecture/procedural-graph/) — the
  procedural-graph engine's design docs, milestone briefs, and
  [live status](_docs/architecture/procedural-graph/STATUS.md).
- [`_docs/architecture-diagram-set.html`](_docs/architecture-diagram-set.html) — visual
  architecture diagrams for the planet renderer.
- [ROADMAP.md](ROADMAP.md) — current capabilities vs. near/mid/long-term direction.
- [CONTRIBUTING.md](CONTRIBUTING.md) — how to contribute.

## History

Git history on `main` predates the World Lab identity: it began as the Color Lab
`test/planet-editor` branch (see [EXTRACTION.md](EXTRACTION.md)), then became the
single-app **Virtual Planet** renderer, then this multi-app monorepo.
