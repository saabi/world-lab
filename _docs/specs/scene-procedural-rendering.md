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

The crux: scene-3d (spheres) and the planet backend each render to their own
color+**depth** with their own camera/projection. To make a near moon occlude a far
gas giant they must share a depth buffer in a **comparable depth space**. Two routes:

- **(A) Unified single pass** — render spheres *and* procedural bodies into one pass
  with one camera/projection. Cleanest occlusion, but a big refactor: the planet
  passes are wired to the backend's own camera/localFrame/bind-groups.
- **(B) Offscreen render → depth composite** *(recommended, incremental)* — render the
  body via the backend into an **offscreen color+depth** target, then a fullscreen
  pass composites it into scene-3d's color+depth (depth-test the two). Lower-risk,
  reuses 4a almost verbatim; the cost is reconciling the two depth spaces.

  **(B) also enables LOD cross-fade** (decisive for it): composite the procedural
  target over the sphere scene with `alpha = proceduralBlend(body, px)` (in
  `bodyParams.ts`), so the planet *dissolves in over its sphere* across a band above
  the threshold instead of popping. The sphere stays underneath; (A)'s single pass
  can't do this cleanly. Sphere can stay drawn under a fully-faded body (cheap).

**Prerequisite for either (the real keystone): the backend renders to an external
target.** Today `WebGPUBackend.init(canvas)` is swapchain-bound (`getCurrentTexture`).
Add a "render into a provided color+depth texture" mode (or extract the passes). Step
1 of 4b, verifiable by routing `FocusedBodyView` through an offscreen texture + blit
and checking it matches 4a.

**Camera + floating origin.** For depths to align, the body's passes must render in
**scene-3d's camera**, with the body placed at `bodyWorldPos − cameraPos` (floating
origin, reusing `buildLocalFrame` / `createLocalViewProjection` / `maybeRebaseFrame`)
and scene-3d's projection (so its depth matches the spheres). This is where physical
`radiusMeters` finally drives the render scale. The subtle part — and the only way to
get cm-at-surface *and* ~1e8 m to the gas giant in Float32.

**Sequence (each step user-verifiable):** **① ✅ backend render-to-target** —
`WebGPUBackend.renderInto(target)` shared by `render()` + a public `renderToTexture`;
a `useOffscreen` flag routes `render()` through an offscreen color target then copies
to the swapchain. `FocusedBodyView` has an "offscreen" toggle to check parity with 4a.
→ **② ✅ cross-fade layer** — `ProceduralBodyLayer` (the `FocusedBodyView` render path,
camera-driven by props, `pointer-events:none`) stacked over the sphere view with
`opacity = proceduralBlend`; its camera matches the scene's (fov + distance scaled by
`radius/radiusMeters`) so the planet aligns with its sphere and dissolves in as you
zoom the selected planet/moon. Two canvases, CSS opacity — no device sharing / GPU
composite yet. → ③ replace the CSS layer with a true GPU composite into scene-3d's
depth (per-pixel occlusion, floating origin) → ④ N bodies (a budget) + atmospheres.

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
2. **✅ 4a focused body** — `PlanetRenderer` host (owns a backend + per-frame state,
   drives `buildRenderFrame → backend.render`; mock-backend test) + `FocusedBodyView`
   overlay: a "Render procedurally" button on a planet/moon renders it full-screen via
   `WebGPUBackend`, fed `resolveBodyParams` + an orbit-about-body camera + default
   scene lighting/atmosphere. Behind an explicit button (no blast radius on the system
   view). GPU output unverified in CI.
3. **4b single composited body** — largest on-screen procedural body into scene-3d's
   depth, floating origin. The first true multi-scale frame.
4. **Phase 5** — N procedural bodies + atmospheres + the unified surface/orbit camera.
   "Gas giant from a moon's surface."

Start with (1): a headless renderer is the keystone refactor; it unblocks both the 4a
focused view and the `/planet` editor reuse, with `/planet` as the regression guard.
