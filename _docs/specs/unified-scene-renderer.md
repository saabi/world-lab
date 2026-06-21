# Unified scene renderer — one engine for spheres + procedural bodies

**Status:** proposal · **Scope:** converge the two render paths (scene-3d spheres +
the planet backend) into **one engine** — one device, one pass (color + **shared
depth**), one camera — drawing each body at its LOD, depth-composited, floating-origin.
**Evolves** the CSS cross-fade into a GPU render-to-texture composite (kept, not
retired). **Related:**
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

1. **Draw list.** Per visible body: `selectLod(px)` → `dot | sphere | procedural`, with
   `proceduralBlend`; cull off-screen. Cap procedural bodies at a **budget**.
2. **Spheres → shared color + depth.** Instanced dot/sphere bodies.
3. **Procedural bodies — rendered directly into the shared pass + depth:**
   - **Close (blend = 1): single-pass.** Terrain into the shared color+depth in the
     body-relative scene view (`bodyRelativeView` — provably screen- and **depth**-equal
     to the spheres, via floating origin: the scene camera translated by −bodyWorldPos,
     same projection). Per-pixel occlusion for free.
   - **Fading (0 < blend < 1): opacity cross-fade, in-pass.** Render *both* the sphere
     (`objectOpacity = 1 − blend`) and the planet (`objectOpacity = blend`) directly,
     alpha-blended. They occupy the same place, so **only one writes depth** (the
     planet, for occlusion against other bodies); the other just blends. No offscreen,
     no composite, no mask. (`renderToTexture` stays available as a fallback.)
4. **Atmospheres + tone-map / present.** Scattering reads the shared depth.

The fade is just an `objectOpacity` uniform on the sphere + terrain passes once the
single-pass body exists — so single-pass is the keystone; the fade falls out of it.

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

1. **✅ Frame skeleton** — `scene3d/drawList.ts` (`buildDrawList`, pure+tested) is the
   one source the engine renders from; `scene3d/sceneEngine.ts` (`SceneEngine`) owns the
   device + shared depth + the render pass; `scene3d/spherePass.ts` (`SpherePass`)
   records the sphere draw into it. `SceneViewport3D` uses engine + sphere pass. No
   behaviour change — the seam where the fade composite + single-pass terrain plug in.
2. **Single-pass for the close body** — `bodyRelativeView` (✅ floating-origin camera
   math, tested: screen + depth match the spheres) → terrain into the shared pass +
   shared depth when `blend = 1`. **The keystone — GPU-deep** (terrain/atmosphere passes
   recording into the engine's pass with the body-relative view).
3. **Opacity cross-fade** — an `objectOpacity` uniform on the sphere + terrain passes;
   render both during the fade, one writes depth. Retires the CSS layer + mask.
4. **Atmospheres in-pass; multi-body + budget; surface camera** — the "gas giant from a
   moon's surface" payoff.

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
