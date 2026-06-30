# Repository Guidelines for AI Agents

This file provides centralized guidance to AI coding assistants when working with code in this repository.

## Layout

**Virtual Planet** — procedural multi-scale planet renderer. The active app is **`fe/`** (SvelteKit 2 + Svelte 5 runes + TypeScript, WebGPU-first). **`fe.old/`** is the archived Sapper reference (not a workspace). **`_docs/specs/virtual_planet_architecture_plan.md`** is the canonical architecture spec. All commands below run from `fe/`.

| Route | Role |
|-------|------|
| **`/scene/[...path]`** | Scene / solar-system editor (URL = scene-tree path); WebGPU viewport, node editor, SunDog import |
| **`/solar-systems`** | SunDog galaxy map — open systems into `/scene` |
| **`/planet`**, **`/old`** | Retired (308 → `/scene`); do not revive without an explicit request |

## Commands

Requires **Node.js 22** (see `fe/.nvmrc`).

```sh
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
cd fe
npm install
npm run dev          # Vite dev server
npm run build        # production build → fe/build/
npm start            # run built node-adapter server
npm run check        # svelte-check (run after any change)
npm test             # vitest run (one-shot)
npx vitest run src/lib/planet/params/planetParams.test.ts   # single test file
```

`PUBLIC_*` env vars are inlined at **build time** (`PUBLIC_SITE_URL`, `PUBLIC_UMAMI_SRC`, `PUBLIC_UMAMI_WEBSITE_ID`). Production runs via PM2: `pm2 start ecosystem.config.cjs` from the repo root (serves `fe/build/index.js` on port 5002). See `fe/.env.example` and `fe/README.md`.

## Architecture

Data flows one direction: **`PlanetParameters` + `CameraState` + `PatchScheduler` → `RenderBackend` → GPU passes**. State lives in Svelte 5 runes; math and scheduling are pure TypeScript.

- **`lib/planet/params/`** — `PlanetParameters`, GPU buffer packing, presets.
- **`lib/planet/math/`** — geodetic, ECEF, local frame (double precision on CPU).
- **`lib/planet/patches/`** — patch descriptors, cube-sphere mapping, surface scheduler, culling.
- **`lib/planet/camera/`** — orbit, flight, surface-fly modes.
- **`lib/planet/render/`** — `RenderBackend` interface, `WebGPUBackend`, pass stubs.
- **`lib/planet/gpu/wgsl/`** — WGSL kernel and terrain shaders (primary).
- **`lib/planet/gpu/glsl/`** — GLSL mirror for WebGL fallback (may lag WGSL).
- **`lib/planet/components/`** — `SceneViewport3D.svelte` owns the `/scene` render loop. Component scripts follow [_docs/svelte-component-organization.md](_docs/svelte-component-organization.md) (module script for imports/types/constants; instance script for props, runes, lifecycle, handlers).

WGSL imports use `#include "relative/path.wgsl"` resolved by `fe/vite-wgsl.ts`. GLSL uses glslify via `fe/vite-glslify.ts`.

**Deferred until rendering gates pass:** picking pass, heightfield pass, walk camera — stub method signatures on `RenderBackend` only.

## Wave integration rules

Work proceeds in **integration waves** (see `.cursor/plans/planet_renderer_roadmap_*.plan.md`). Do not start Wave N+1 until gate N passes.

| Gate | Command | Visual |
|------|---------|--------|
| G0 | `npm run check && npm run build` | App builds; `/scene` loads |
| G1 | `npm run check && npm test` | WGSL modules compile; presets typed |
| G2 | dev `/scene` | Full cube-sphere planet from orbit |
| G3 | fly to ~100 m altitude | No jitter; patch carpet visible |
| G4 | orbit ↔ surface-fly | Stable horizon with fog |

### Parallel stream rules (Wave 1+)

1. **One wave at a time** — integrator merges streams; gate before advancing.
2. **Stream ownership** — each agent owns listed paths; do not edit another stream's contract files without coordination.
3. **Contracts are sacred** — `patches/types.ts`, `params/planetParams.ts`, `render/RenderBackend.ts` are merged sequentially or by integrator only.
4. **WGSL-first** — new GPU code lands in `gpu/wgsl/`; GLSL mirror is a separate stream.
5. **Svelte 5 events** — use `onclick`, `onpointerdown`, etc. Never `on:click` / `on:pointerdown` (legacy); mixing syntaxes is a compile error.
6. **Template typings** — `src/app.d.ts` augments `svelteHTML.HTMLAttributes` from `svelte/elements` so IDE analysis accepts Svelte 5 event attributes on native elements.

## Committing & untracked artifacts

Default ownership for committing — so nothing is left untracked:

- **Implementing agents** commit **everything in their `Owns:` scope**, including **new files**
  (tests, modules, fixtures) — not just modified ones. Before setting a task `DONE`, run
  `git status` and confirm **no untracked or unstaged file inside your scope** remains; stage
  with `git add -A <your paths>`. A landed task whose new test is left untracked is **not done**.
- **The orchestrator/architect** commits the **coordination & governance docs** it authors —
  the briefs under `_docs/architecture/procedural-graph/briefs/`, `_TASK_BOARD.md`,
  `briefs/README.md`, `_docs/pending_issues.md`, and design-doc edits — **at the time it writes
  or routes them** (agents stay in their code scope and must not touch these). Don't leave
  briefs uncommitted waiting on an agent.
- **Local verification artifacts** (the `screenshots/` from visual gates, build caches,
  `tsconfig.tsbuildinfo`) are **gitignored**, never committed; paste visual-gate screenshots
  into the board/PR, not the repo.

## Key documentation

- [_docs/svelte-component-organization.md](_docs/svelte-component-organization.md) — Two-script-block component structure, section ordering, and migration procedure.
- [_docs/specs/unified-scene-renderer.md](_docs/specs/unified-scene-renderer.md) — scene engine frame (spheres + procedural)
- [_docs/specs/scene-transform-pipeline.md](_docs/specs/scene-transform-pipeline.md) — deferred model-matrix / ellipsoid transform intention
- [_docs/specs/sundog-enrichment.md](_docs/specs/sundog-enrichment.md) — SunDog authored overlay (orbits, appearance, prototype trade)
- [_docs/specs/scene-spaceflight.md](_docs/specs/scene-spaceflight.md) — `/scene` orbital flight panel, RCS modes, atmosphere entry
- [README.md](README.md) — quick start
