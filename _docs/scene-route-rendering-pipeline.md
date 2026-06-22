# /scene rendering pipeline

Status: current implementation snapshot.

## Entry point

The `/scene/[...path]` route is client-only (`+page.ts` exports `ssr = false`) because
the viewport depends on browser WebGPU, canvas, `ResizeObserver`, `requestAnimationFrame`,
and `localStorage`.

`fe/src/routes/scene/[...path]/+page.svelte` owns the editable `PlanetScene` document:

- Loads/saves the scene from `localStorage` under `vp.systemScene`, falling back to
  `createToySolarSystemScene()`.
- Keeps `selectedId` synchronized with the URL path via `resolvePath()` and `pathOf()`.
- Hosts the scene tree, node editors, atmosphere debug controls, and the render surface.
- Maintains a shared `clock`, driven by `SystemMapPanel`, and passes it to
  `SceneViewport3D`.

The render area is:

```svelte
<SceneViewport3D {scene} bind:selectedId time={clock} {atmo} />
<SystemMapPanel {scene} bind:selectedId bind:time={clock} />
```

The 2D map is an inset over the 3D viewport and also acts as the animation clock source.

## Main 3D scene path

`SceneViewport3D.svelte` is the live system renderer for `/scene`. It is WebGPU-only.
On mount it:

1. Requests a WebGPU device through `requestWebGPUDevice()`.
2. Configures the canvas with `configureWebGPUCanvas()`.
3. Creates a `SceneEngine`, which owns the frame render pass and depth texture.
4. Creates a `SpherePass`, which owns the instanced sphere pipeline.
5. Starts a continuous RAF loop.

Each frame:

1. `evaluateScene(scene, time)` produces an animated scene snapshot.
2. The orbit camera target is the selected node's evaluated world position, or the
   system origin if nothing is selected.
3. `viewProjection(camera, aspect)` builds the WebGPU clip-space view-projection matrix.
4. `buildDrawList(animated, vp, w, h, lodState)` projects each body and chooses an LOD:
   `dot`, `sphere`, or `procedural`, with hysteresis.
5. `instancesFromDrawList()` converts visible draw items into sphere instances. Dot LOD
   is represented as a small fixed-screen-size sphere by back-solving a world radius.
6. `lighting(animated)` collects scene lights and picks the first point light as the sun.
7. `SceneEngine.render(currentTextureView, w, h, record)` opens a render pass and calls
   `SpherePass.record(...)`.
8. Selection marker and procedural overlay state are updated from the same draw list.

## SceneEngine

`fe/src/lib/planet/scene3d/sceneEngine.ts` is the pass host. It owns:

- The WebGPU device and canvas format.
- A `depth24plus` texture resized to the current viewport.
- The command encoder and render pass lifecycle.

For every frame it clears color to a dark background and clears depth to `1`. All current
main-scene geometry is recorded inside this pass. Today that means spheres only; the
comments and specs point toward future procedural passes sharing this same color/depth
target.

## Sphere pass

`fe/src/lib/planet/scene3d/spherePass.ts` renders every body as one instanced unit sphere:

- Geometry comes from `makeUVSphere()`.
- Per-frame uniforms contain `viewProj`, sun position/color/intensity, and ambient light.
- Per-instance data contains a column-major `translate(position) * scale(radius)` matrix,
  RGB color, and an emissive flag.
- The WGSL shader is `fe/src/lib/planet/gpu/wgsl/scene3d/sphere.wgsl`.

The shader uses Lambert lighting from the sun's world-space point position. Stars bypass
lighting through the emissive flag.

## Camera and projection

The scene camera is `fe/src/lib/planet/scene3d/orbitCamera.ts`.

- `OrbitCamera` stores azimuth around +Y, elevation from the XZ plane, distance, and target.
- `cameraEye()` derives the eye from spherical coordinates.
- `lookAt()` builds a right-handed view matrix looking down camera -Z.
- `perspective()` builds a WebGPU projection with z in `[0, 1]`.
- `projectToScreen()` is used for draw-list screen size, picking, and the selection ring.

Mouse input in `SceneViewport3D.svelte` updates azimuth/elevation and wheel changes
distance. Clicks run CPU picking by projecting each body and selecting the front-most
projected disc hit.

## Draw list and LOD

`fe/src/lib/planet/scene3d/drawList.ts` is the per-frame render manifest for the scene
engine. It is pure except for the caller-provided `lodState` map used for hysteresis.

For each body it stores:

- Body id/type/radius.
- Evaluated world position.
- Screen position and clip-w depth, or `null` if behind the camera.
- Projected pixel diameter.
- Selected LOD.
- Procedural cross-fade blend.

LOD rules come from `fe/src/lib/planet/scene/bodyParams.ts`:

- Below `sphereAbovePx`, render as a dot.
- Above `sphereAbovePx`, render as a sphere.
- Above `proceduralAbovePx`, begin the procedural path.
- `proceduralBlend()` ramps opacity across the next 50% of projected-size growth.

## Procedural overlay path

Selected planets and moons can fade into the real `/planet` procedural renderer, but this
is not yet a shared-depth render inside `SceneEngine`.

When the selected body is visible and its draw item has `blend > 0`,
`SceneViewport3D.svelte` mounts `ProceduralBodyLayer.svelte` in an absolutely positioned
wrapper over the main canvas. The wrapper opacity is `proceduralBlend`, and a CSS radial
mask limits the overlay to the selected body's screen disc plus an atmosphere feather.

`ProceduralBodyLayer.svelte` creates:

- A separate canvas.
- A separate `WebGPUBackend`.
- A `PlanetRenderer` host.

Each frame it:

1. Resolves body appearance with `resolveBodyParams(body)`.
2. Sets `params.radius` to the body's physical `radiusMeters`.
3. Builds the focused-body `CameraState` with the shared `focusedBodyCamera()`
   (`createOrbitCamera` under the hood) — the body at the local origin, orbited by the
   scene camera. (Floating-origin compositing into the shared depth is Phase 5, via
   `bodyRelativeView()`.)
4. Packs scene lighting as a directional light toward the sun in body-local space.
5. Builds atmosphere parameters from the body's radius plus the route's debug controls.
6. Calls `PlanetRenderer.render(...)`.

`PlanetRenderer` then runs the normal `/planet` flow:

`PlanetRenderer.render()` -> `buildRenderFrame()` -> `WebGPUBackend.render()` ->
`TerrainPass` and `AtmospherePass`.

Because this is a stacked canvas, depth interaction between the procedural body and other
scene bodies is approximate. The code already contains `bodyRelativeView()` and
`WebGPUBackend.renderToTexture()` pieces for a future true compositing path, but `/scene`
currently presents the procedural render through CSS opacity and mask.

## Focused body view

The sidebar "Render procedurally" action opens `FocusedBodyView.svelte` as a full-screen
overlay. This is also a separate `PlanetRenderer + WebGPUBackend` canvas, but it uses an
independent orbit-about-body camera (`createOrbitCamera`) rather than the system scene
camera. It includes an `offscreen` toggle to exercise the backend offscreen render/copy
path used by the future compositing work.

## Fallback behavior

If WebGPU initialization fails in `SceneViewport3D`, the route displays:

`3D unavailable: ... - use the 2D map.`

The route still has the editor, tree, and 2D `SystemMapPanel`. If `ProceduralBodyLayer`
fails to initialize WebGPU, it silently leaves the host sphere view visible.

## Current boundaries

- `/scene` has one main WebGPU canvas for the sphere scene.
- The procedural selected-body render is currently a second WebGPU canvas overlaid by CSS.
- Main-scene depth is shared only by `SceneEngine` and `SpherePass` today.
- The future unified renderer direction is to render procedural terrain/atmosphere into
  the scene engine's color/depth targets instead of compositing a masked overlay canvas.
