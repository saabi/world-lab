# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Also read **`AGENTS.md`** — it holds the wave-integration workflow, stream-ownership rules, and gate checklist that govern how changes land. This file covers commands and architecture.

## Layout

**Virtual Planet** — procedural multi-scale WebGPU planet renderer. An **npm-workspaces
monorepo** (root `package.json`, single root `package-lock.json`):

- **`fe/`** — the active app (SvelteKit 2 + Svelte 5 runes + TypeScript). Most work happens here.
- **`packages/*`** — reusable, eventually-publishable libraries (e.g. `@virtual-planet/schema`).
  Each is its own workspace with `check`/`test` scripts.
- **`fe.old/`** — archived Sapper / Svelte 3 reference (not a workspace). Do not develop here.

Within `fe/`, routes:
- **`/planet`** — the active WebGPU renderer (now also the **legacy per-body editor**).
- **`/scene/[...path]`** — the path-addressed scene/solar-system editor (URL = the scene-tree path); top-down map + body tree + schema-driven node editor. `/system` redirects here. See `_docs/specs/`.
- **`/old`** — frozen legacy Three.js editor kept as a visual reference. Do not break it.

## Commands

Requires **Node.js 22** (`fe/.nvmrc` pins `22.22.2`). All commands run from **`fe/`**:

```sh
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
cd fe
npm install
npm run dev          # Vite dev server
npm run build        # production build → fe/build/
npm start            # run the built node-adapter server
npm run check        # svelte-check — run after any change
npm test             # vitest run (one-shot)
npx vitest run src/lib/planet/scene/collectLights.test.ts   # single test file
npx vitest run -t "includes fill when enabled"              # single test by name
```

There is no lint/format step; `npm run check` (svelte-check) is the type/correctness gate.

Monorepo: run `npm install` **from the root** (one lockfile links all workspaces). App commands still run from `fe/`. Package commands run from the package dir, or from root via `npm run check -w @virtual-planet/schema` / `npm test -w @virtual-planet/schema`.

## Architecture

Data flows one direction each frame:

**`PlanetParameters` + `CameraState` + scene/lighting → patch schedulers → `RenderFrame` → `RenderBackend` → GPU passes.**

`PlanetViewport.svelte` (`lib/planet/components/`) owns the render loop and all live state (Svelte 5 runes). Each frame it: updates the camera, rebases the local frame to fight float jitter, schedules patches, collects + packs lighting, assembles a `RenderFrame`, and calls `backend.render(frame)`. Math, scheduling, and document logic are pure TypeScript modules with no Svelte dependency.

### Key modules (`fe/src/lib/planet/`)

- **`params/`** — `PlanetParameters` shape, `presets.ts` (read-only built-in templates), `gpuBuffers.ts` packing, `paramEditorSchema.ts` (drives the editor panel UI).
- **`math/`** — geodetic, ECEF, `localFrame.ts` (origin-rebasing for precision), `vec.ts`. Double precision on CPU.
- **`patches/`** — cube-sphere mapping, `cubeSphereScheduler.ts` (orbit LOD), `surfaceScheduler.ts` (near-surface rings), culling, vertex-budget. `types.ts` is a shared contract.
- **`camera/`** — orbit / flight / surface-fly modes; `cameraModes.ts` selects + blends render modes by altitude.
- **`scene/`** — scene-graph tree (`sceneTree.ts`, `types.ts`), `collectLights.ts` (walks the tree → world-space lights), `packLighting.ts` (→ GPU uniforms). Lights live as scene nodes.
- **`material/`** — `biomes.ts`: material overrides + debug modes fed into shading.
- **`documents/`** — localStorage persistence (named saves + auto-restored session). See `documents/README.md`; loads go through `detectSchemaVersion → migrate → coerce` and never merge raw JSON into live state.
- **`render/`** — `RenderBackend` interface (`RenderBackend.ts` defines `RenderFrame`/`RenderStats`), `WebGPUBackend` (primary), `WebGLBackend` (fallback), `device.ts`, `uniformLayouts.ts`, and `passes/` (terrain, atmosphere, debug, plus deferred picking/heightfield stubs).
- **`gpu/wgsl/`** — primary WGSL shaders, grouped by domain (`planet/`, `terrain/`, `atmosphere/`, `noise/`, `common/`, `debug/`).
- **`gpu/glsl/`** — GLSL mirror for the WebGL fallback; may lag the WGSL source.

### Shaders

- WGSL files support `#include "relative/path.wgsl"`, inlined at build time by **`fe/vite-wgsl.ts`** (imported `.wgsl` becomes a default-exported string). The same resolver exists standalone in `gpu/resolveWgslIncludes.ts` for Node/test use.
- GLSL uses glslify via **`fe/vite-glslify.ts`**.
- `gpu/wgslCompile.test.ts` compiles shaders against a real WebGPU device when one is available (`it.skipIf(!hasWebGPU)`), so those checks are skipped in headless CI without GPU.

### Deferred work

Picking pass, heightfield pass, and the walk camera are intentionally stubs — method signatures exist on `RenderBackend`/in `passes/` but are not implemented until their rendering gate passes (see `AGENTS.md`).
