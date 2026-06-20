# Unified scene renderer — one engine for spheres + procedural bodies

**Status:** proposal · **Scope:** converge the two render paths (scene-3d spheres +
the planet backend) into **one engine** — one device, one pass (color + **shared
depth**), one camera — drawing each body at its LOD, depth-composited, floating-origin.
**Supersedes** the CSS cross-fade layer (the deferred composite). **Related:**
[scene-procedural-rendering.md](scene-procedural-rendering.md),
[scene-3d-viewport.md](scene-3d-viewport.md),
[celestial-body-params.md](celestial-body-params.md).

## Why

Two engines + a CSS-layer composite can't do per-pixel occlusion (a near moon over a
far gas giant), real atmosphere coverage, or a continuous camera. One engine does —
and it's the project's whole premise. This retires the radial-mask / camera-match
hacks the interim needed.

## What carries over (already built)

- `buildRenderFrame` (headless frame assembly), `PlanetRenderer`.
- `resolveBodyParams`, `selectLod`, `proceduralBlend` — the LOD model.
- Scene graph + `evaluateScene` + `getWorldTransform` + `collectSceneLights`.
- `WebGPUBackend.renderToTexture` (render-to-target) + `useOffscreen` plumbing.
- The instanced sphere pipeline (`SceneRenderer`) + the terrain / atmosphere passes.

## Architecture (one frame)

In the **scene camera** (system space), **floating origin** (render origin rebased to
the camera each frame):

1. **Draw list.** Per visible body: `selectLod(px)` → `dot | sphere | procedural`;
   cull off-screen. Cap procedural bodies at a **budget** (rest fall back to sphere).
2. **Solids pass → shared color + depth.** Instanced spheres (dot/sphere bodies) **and**
   procedural terrain (procedural bodies) all write the **same depth** in the **scene
   projection** — so occlusion is per-pixel for free. Procedural bodies: the terrain
   pass driven by the scene view-projection + the body's **camera-relative offset**
   (`bodyEcef − cameraEcef`), scheduling patches per body.
3. **Atmospheres pass.** Per procedural body, the atmosphere pass reads the shared
   color+depth and adds scattering (depth-aware → sits correctly over near occluders).
   Coverage alpha falls out — no mask.
4. **Tone-map / present.**

Key unifications:
- **One** device + canvas + **depth** buffer (today: two devices, two depths).
- The terrain/atmosphere passes take an **external view-projection (scene camera) + a
  per-body world offset**, instead of owning their camera/localFrame. *The core change.*
- **Floating origin** shared by spheres + procedural so depth is comparable; reuse
  `buildLocalFrame` / `maybeRebaseFrame`.

## The hard seam (honest)

The terrain pipeline is built around the backend's own `CameraState` + `localFrame`
(its own projection). Re-pointing it at the **scene** camera + a per-body offset,
writing **shared** depth, is the core refactor — deeply GPU-coupled (WGSL uniforms,
bind groups, depth state). It's exactly where a blind change yields a black frame, so
it needs on-device verification at each step (see "Working method").

## Migration (each step user-verifiable)

1. **Frame skeleton (no GPU change)** — a `SceneEngine` owning the device, the shared
   color+depth, and a draw list; move the existing sphere draw into it. Behaviour
   identical to today's sphere view.
2. **One procedural body in the shared pass** — terrain pass driven by the scene camera
   + the body offset, into the shared depth (replaces the CSS layer for one body, with
   *true* depth + alpha). **The keystone — GPU-deep.**
3. **Atmosphere in the shared pass** — per-body scattering over the shared depth.
4. **Multi-body + budget; floating-origin polish; unified surface/orbit camera** —
   the "gas giant from a moon's surface" payoff.

## Decisions

1. **Engine home:** a new `scene3d` engine hosting the passes (recommended — it owns
   the system camera/frame) vs extending `WebGPUBackend` to multi-body + spheres.
2. **Pass adaptation:** parameterize the *existing* terrain/atmosphere passes to accept
   an external camera + per-body offset (recommended, reuse) vs scene-specific forks.
3. **Budget:** how many bodies may be procedural at once (start: 1–2).

## Working method (given no GPU in CI)

The **testable / safe** parts I can build + verify headlessly: the engine structure,
the LOD draw-list, the camera + floating-origin math (pure), the per-body offset.
The **GPU-pass core** (steps 2–3 — terrain/atmosphere on the scene camera + shared
depth) needs on-device eyes; that's the part to pair on or have you drive with my
scaffolding, since a blind edit there is a black frame I can't debug.

Start with **(1) the frame skeleton** — pure structure, no behaviour change — then the
keystone (2) with tight verify loops.
