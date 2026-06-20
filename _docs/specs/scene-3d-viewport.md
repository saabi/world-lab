# A 3D viewport for the scene (alongside the 2D map)

**Status:** proposal · **Scope:** a new `SceneViewport3D` on `/scene` + a lightweight
`lib/planet/scene3d/` renderer (device reuse, sphere pipeline, orbit camera). The 2D
`SystemMapPanel` is **kept untouched** — it stays useful as a minimap / future HUD /
ship-display element. **Related:** [scene-routing.md](scene-routing.md) (per-body
params + body-editor view), the existing `/planet` WebGPU renderer.

## Goal

Render the scene tree in **3D** — bodies in space, lit by the scene's lights, with a
fly-around camera — sharing the same `PlanetScene` + animation clock the 2D map and
editor already use. Selecting/animating works across all three views.

### Non-goals (v1)

- **Procedural terrain per body.** Bodies render as **shaded spheres** (color by
  bodyType, stars emissive). Full procedural rendering needs the per-body
  `CelestialBody` params (deferred in scene-routing.md) — a *later* upgrade that swaps
  the sphere for the `/planet` pipeline on the selected/near body.
- **WebGL fallback.** v1 is WebGPU-only; where unavailable, the 2D map remains the
  fallback. (The `/planet` GLSL mirror is a future port.)
- **Surface-precision rebasing.** Bodies sit at ~1e7 m; Float32 gives ~1 m there —
  fine for a system view. The local-frame rebasing (`/planet`) is for cm-at-surface.

## Why a separate lightweight renderer (not the planet backend)

`WebGPUBackend` is built around one procedural planet (`RenderFrame`: patches, terrain
+ atmosphere passes). A system of spheres is a different, simpler workload. A small
standalone `scene3d/` renderer — **sharing only `render/device.ts`** — keeps both
clean and is fast to ship. Convergence later: when per-body params exist, the
selected/near body can be drawn by the full backend and composited, or the backend
extended to multi-body. The spec doesn't bind that choice now.

## Architecture

```
PlanetScene ──evaluateScene(t)──▶ world transforms (getWorldTransform)
            └─ collectSceneLights ─▶ packLighting ─▶ light uniform
                         │
   SceneViewport3D.svelte (canvas + RAF, shares scene + bind:time clock)
                         ▼
   scene3d/sceneRenderer.ts  ── device.ts (shared GPU device)
     • sphere mesh (UV sphere, uploaded once) drawn INSTANCED
     • per-instance: model matrix (translate · scale=radius), color, emissive flag
     • orbit camera → view·projection uniform
     • (opt) orbit paths as 3D line loops from orbitPathLocal
   scene3d/sphere.wgsl  — instanced Lambert + scene lights; stars emissive
   scene3d/orbitCamera.ts — azimuth/elevation/distance about a target → mat4 (math/)
```

- **Data each frame:** `evaluateScene(scene, clock)`; for each `listBodies`, an
  instance from `getWorldTransform` (position + radius→scale) and a bodyType color.
- **Lights:** reuse `collectSceneLights` + `packLighting` (or a minimal directional +
  ambient uniform for v1).
- **Camera:** orbit controller — drag = azimuth/elevation, wheel = distance, target =
  selected body (or system center); `mat4` perspective/lookAt from `lib/planet/math`.
- **Picking:** project body centers via view·projection, nearest within radius (the 2D
  map's `pickNearest` analog, depth-aware) → sets the shared `selectedId`. GPU id-pick
  is a later refinement.
- **Animation:** binds the same route clock (`bind:time`) the map uses, so 2D and 3D
  animate in lockstep and the editor's live values match.

## Coexistence with the 2D map

Both components read the same `scene` + `selectedId` + `clock`. The 2D map is
unchanged. Layout (a **decision** below): the 3D viewport as the primary view with the
2D map as a toggle or a small inset "minimap" — the inset doubles as the first real
use of the map-as-HUD idea.

## Decisions to confirm

1. **Layout:** 3D primary + 2D map as a small **inset minimap** (dogfoods HUD use), vs
   a **toggle** (2D | 3D) in one pane, vs **side-by-side**.
2. **Renderer:** lightweight standalone `scene3d/` sphere renderer (recommended) vs
   extend `WebGPUBackend`.
3. **Bodies v1:** shaded spheres now (recommended), accept no terrain until per-body
   params land.
4. **Camera target:** follow the selected body (recommended), falling back to system
   center when nothing's selected.

## Phasing

1. **Static 3D** — `scene3d/` renderer + `SceneViewport3D`: instanced spheres at world
   transforms, orbit camera (drag/zoom), basic scene lighting. No animation/picking
   yet; proves the pipeline next to the 2D map.
2. **Live + selection** — bind the shared clock (animate), CPU projection picking →
   `selectedId`, camera follows selection.
3. **Orbit paths in 3D** — line loops from `orbitPathLocal`; star glow.
4. **Procedural upgrade (later, gated on `CelestialBody` params)** — swap the sphere
   for the `/planet` pipeline on the selected/near body; multi-body convergence.

Start with (1): it's self-contained (`device.ts` + a new module + one component),
delivers a real 3D view immediately, and touches nothing in the 2D map or editor.
