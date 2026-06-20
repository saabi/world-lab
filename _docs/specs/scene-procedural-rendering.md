# Procedural bodies in the scene (CelestialBody Phase 4–5)

**Status:** proposal · **Scope:** render scene bodies with the real `/planet`
procedural pipeline — first one focused body, then several composited (the multi-scale
goal). **Related:** [celestial-body-params.md](celestial-body-params.md) (appearance +
LOD, done through Phase 3), [scene-3d-viewport.md](scene-3d-viewport.md), the
`/planet` renderer.

## Where we are / the gap

LOD already classifies bodies dot/sphere/**procedural** (`selectLod`), but `procedural`
draws as a sphere. The real pipeline lives in `WebGPUBackend.render(frame: RenderFrame)`
— but it is built for **one** planet on **its own canvas**: a single `params`
(`PlanetParameters`), a single `localFrame` (floating origin from `buildLocalFrame`),
patches scheduled relative to that planet, into the backend's own targets. So it can't
just be pointed at N scene bodies in scene-3d's framebuffer.

## The fork (be explicit)

- **4a — Focused procedural body (reuse the backend wholesale).** When a body is at
  procedural LOD (or explicitly opened), render *that one body* full-screen with the
  existing backend, fed `resolveBodyParams(body)` + a camera aimed at it. A mode the
  system view hands off to (and back). Cheap: reuses everything; **no compositing**.
  This is also the scene-routing "open body editor" path (decision #3 = embed).
- **4b — Composited procedural body (the multi-scale step).** Draw the procedural body
  *into scene-3d's color+depth*, depth-correct against the sphere bodies, at a
  camera-relative (floating-origin) offset. The seam toward "gas giant behind a moon."
  Needs the single-planet pipeline lifted off its private canvas.

Recommend **4a first** (a real procedural planet from the scene, low risk), then **4b**.

## 4a — focused body via the backend

- **Parameterize the renderer.** `PlanetViewport` currently owns its own params/preset
  state + loop. Extract a headless `PlanetRenderer` host (or add props) that accepts
  **external `params`** + a camera + lighting and drives `backend.render`. Feed it
  `resolveBodyParams(body)`; physical size = `body.radiusMeters` sets the planet radius
  the backend uses (the one place `radiusMeters` ↔ render-space is reconciled).
- **Camera adapter.** The scene orbit camera → a `CameraState` aimed at the body
  (reuse `camera/cameraModes`; start in orbit mode about the body). Distance/altitude
  from the body radius.
- **Surface to the user.** A focused-body overlay/route segment renders it; "back"
  returns to the system view. Selection already exists; this swaps the view for the
  selected procedural body.

## 4b — compositing + floating origin

- **Lift the passes.** Drive the terrain (+ later atmosphere) passes into scene-3d's
  render pass — shared **depth buffer** with the sphere instances, so a near moon
  occludes a far gas giant correctly. Either extract `passes/terrainPass` to accept an
  external target, or run the backend into an offscreen color+depth and composite by
  depth.
- **Floating origin.** Render origin = camera each frame. The body's patches are
  generated about its centre, then placed at `bodyWorldPos − cameraPos`; reuse
  `buildLocalFrame` / `createLocalViewProjection` / `maybeRebaseFrame` (already the
  `/planet` precision path) so Float32 holds cm-at-surface and ~1e8 m to the gas giant.
- **One body first**, the largest on screen at procedural LOD; then N (a budget).

## Camera unification

scene-3d uses a system orbit camera; the planet pipeline expects a `CameraState` with
its surface/orbit modes. 4a needs an adapter (orbit-about-body). 4b/Phase 5 want **one**
camera living in system space that can sit near a surface *or* in orbit — `cameraModes`
selecting by altitude, floating origin doing the rest. This is the path to standing on
a moon looking up at the primary.

## Decisions to confirm

1. **First step:** 4a focused full-screen procedural (recommended) vs jump to 4b
   compositing.
2. **Renderer reuse:** extract a headless `PlanetRenderer` from `PlanetViewport`
   (recommended) vs fork a copy for the scene.
3. **4b compositing:** lift `passes/*` into scene-3d's pass (tighter, recommended
   eventually) vs offscreen-render the backend + depth-composite (looser, faster to try).

## Risks / unknowns

- The backend assumes one planet/one canvas — 4b is a real refactor, landed in slices.
- Patch scheduling cost is per body; the procedural budget must stay ≥1 small.
- Camera model mismatch (system orbit vs planet surface modes) is the subtle part.
- Atmosphere compositing across bodies (ordering, scattering) is its own problem (defer
  to Phase 5).

## Phasing

1. **✅ Headless frame assembly** — `render/buildRenderFrame.ts`: params/camera/
   lighting/tessellation in → `RenderFrame` out (modeState/localFrame passed in and
   returned). `PlanetViewport.buildFrame` delegates to it (logic unchanged); smoke
   test guards it. The backend-driving host (a `PlanetRenderer` class) comes with 4a.
2. **4a focused body** — render the selected body procedurally full-screen from
   `resolveBodyParams` + an orbit-about-body camera; back to the system view.
3. **4b single composited body** — largest on-screen procedural body into scene-3d's
   depth, floating origin. The first true multi-scale frame.
4. **Phase 5** — N procedural bodies + atmospheres + the unified surface/orbit camera.
   "Gas giant from a moon's surface."

Start with (1): a headless renderer is the keystone refactor; it unblocks both the 4a
focused view and the `/planet` editor reuse, with `/planet` as the regression guard.
