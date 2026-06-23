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
- Hosts the scene tree, node editors, body appearance/atmosphere editors, and the render
  surface.
- Owns the shared `clock` plus `playing`/`speed`, and runs the **single** clock advancer
  (one `requestAnimationFrame` loop: `clock += dt·speed` while `playing`). This lives at the
  route, not per-panel, so subdividing the layout into multiple viewports does not multiply
  the clock rate, and play/pause/speed are shared across panels.
- Passes `clock` (read-only) and `bind:playing`/`bind:speed` down through `SceneEditorShell`
  → `ViewportZone` to each `SceneViewport3D` (renders) and `SystemMapPanel` (draws +
  hosts the shared play/pause/speed controls).

The viewport zone renders both the 3D view and the 2D map inset:

```svelte
<SceneViewport3D {scene} bind:selectedId time={clock} {materialDebug} {lookMode} />
<SystemMapPanel {scene} bind:selectedId time={clock} bind:playing bind:speed />
```

Both render on demand: a paused clock stops advancing, so nothing re-renders.

## Main 3D scene path

`SceneViewport3D.svelte` is the live system renderer for `/scene`. It is WebGPU-only.
On mount it:

1. Requests a WebGPU device through `requestWebGPUDevice()`.
2. Configures the canvas with `configureWebGPUCanvas()`.
3. Creates a `SceneEngine`, which owns the frame render pass and depth texture.
4. Creates a `SpherePass`, which owns the instanced sphere pipeline.
5. Creates a `PlanetRenderer` backed by `WebGPUBackend` adopting the shared device,
   without its own canvas.
6. Starts a continuous RAF loop.

Each frame:

1. `evaluateScene(scene, time)` produces an animated scene snapshot.
2. The orbit camera target is the selected node's evaluated world position, or the
   system origin if nothing is selected.
3. `viewProjection(camera, aspect)` builds the WebGPU clip-space view-projection matrix.
4. `buildDrawList(animated, vp, w, h, lodState)` projects each body and chooses an LOD:
   `dot`, `sphere`, or `procedural`, with hysteresis.
5. `instancesFromDrawList()` converts visible draw items into sphere instances. Dot LOD
   is represented as a small fixed-screen-size sphere by back-solving a world radius.
6. `lighting(animated)` collects scene lights and picks the first point light as the sun
   for sphere lighting.
7. Selection marker and procedural body state are updated from the same draw list.
8. `SceneEngine.render(currentTextureView, w, h, record)` opens one shared render pass.
9. `SpherePass.record(...)` records all visible sphere/dot bodies, excluding the selected
   procedural body while its terrain is active.
10. If a selected planet/moon has procedural blend > 0, `PlanetRenderer.recordInto(...)`
    records its terrain directly into the same render pass and depth target.

## SceneEngine

`fe/src/lib/planet/scene3d/sceneEngine.ts` is the pass host. It owns:

- The WebGPU device and canvas format.
- A `depth24plus` texture resized to the current viewport.
- A selected-body `r32float` surface-distance texture resized to the current viewport.
- A sampleable offscreen scene-color texture used only when the atmosphere overlay runs in
  explicit-composite mode.
- The command encoder and render pass lifecycle.

For every frame it clears color to a dark background, clears depth to `1`, and clears the
selected-surface distance target to `-1`. Spheres, dots, and the selected procedural
body's terrain are recorded inside this pass, so the procedural terrain depth-tests
against the rest of the scene. Terrain fragments also write their linear camera distance
into the selected-surface target.

When the atmosphere overlay is active, `SceneEngine` supports two compositing modes:

- **Explicit composite**: scene color first renders into the sampleable offscreen
  scene-color texture. The overlay pass clears the swapchain, samples scene color, depth,
  and surface distance, and writes `sceneColor·avgTransmittance + inscatter`.
- **Hardware alpha**: scene color renders directly to the swapchain. The overlay pass
  loads the swapchain, samples only depth and surface distance, and uses fixed-function
  blending with `src=one`, `dst=one-minus-src-alpha` after outputting
  `vec4(inscatter, 1 - avgTransmittance)`.

Atmosphere diagnostic views force explicit-composite mode so their outputs are not mixed
with the underlying scene.

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
- Projected pixel **radius** (`screenRadiusPx` — half the on-screen disc, the intuitive
  unit the thresholds are expressed in).
- Selected LOD.
- Procedural cross-fade blend.

LOD rules come from `fe/src/lib/planet/scene/bodyParams.ts`, fed the thresholds from the
**global** render-quality setting `SceneViewportPrefs.lod` (edited in the Render panel's
Quality section, not per-body):

- Below `sphereAboveRadiusPx`, render as a dot.
- Above `sphereAboveRadiusPx`, render as a sphere.
- Above `proceduralAboveRadiusPx`, begin the procedural path.
- `proceduralBlend()` returns an activation/blend value across the next 50% of
  projected-size growth. `/scene` passes the blend as the terrain's `objectOpacity` (a
  `MaterialOverrides` field) and keeps the selected body's **base sphere drawn until
  `blend` reaches 1**. So during the fade the terrain alpha-blends over the solid sphere
  (raised terrain wins the depth test; valleys keep the sphere) rather than dissolving from
  the background; the sphere is dropped only once the terrain is fully opaque. The scene
  atmosphere falls back to the analytic base-sphere surface where the terrain wrote no
  surface distance (fade-valley fragments), so it doesn't march through the planet. `/planet`
  keeps `objectOpacity = 1` (opaque, unchanged).

## Procedural terrain path

Selected planets and moons can fade into the real `/planet` procedural terrain renderer.
The old second-canvas/CSS-overlay path has been removed; the terrain now records into the
same `SceneEngine` render pass and shared depth target as the spheres.

When the selected body is visible, is a planet/moon, and its draw item has `blend > 0`,
`SceneViewport3D.svelte`:

- Skips the selected body's sphere instance while procedural terrain is active.
- Computes the body's evaluated world rotation for `planetRotation`.
- Packs one directional procedural light toward the first scene point light/star.
- Builds per-frame `PlanetRenderInputs` through `buildProceduralRenderInput(...)`.
- Calls `PlanetRenderer.recordInto(pass, inputs)` inside the active scene render pass.

`buildProceduralRenderInput(...)`:

1. Resolves body appearance with `resolveBodyParams(body)`.
2. Sets `params.radius` to the body's physical `radiusMeters`.
3. Builds the focused-body `CameraState` with the shared `focusedBodyCamera()`
   (`createOrbitCamera` under the hood).
4. Uses `resolveBodyAtmosphere(body)` for the body's atmosphere design.
5. Applies material debug and look-mode viewport state.

`PlanetRenderer` then runs the normal `/planet` flow:

`PlanetRenderer.recordInto()` -> `buildRenderFrame()` ->
`WebGPUBackend.recordTerrainInto()` -> `TerrainPass.renderInto()`.

`PlanetRenderer.recordInto()` records terrain only. The body's atmosphere is then
composited by `SceneAtmospherePass` (`scene3d/sceneAtmospherePass.ts` +
`gpu/wgsl/scene3d/sceneAtmosphere.wgsl`) as the engine's overlay pass: a fullscreen
ray-march in the body-local (`focusedBodyCamera`) frame. The selected body's terrain
fragments provide a precision-safe linear surface distance for the march endpoint, while
the **shared scene depth** remains the foreground occlusion source so nearer bodies
occlude the halo. The pass can either sample offscreen scene color and write the explicit
composite `sceneColor·avgTransmittance + inscatter`, or output `inscatter`/alpha for
hardware render-target blending. The explicit path matches `/planet`'s atmosphere
composition most directly; the hardware-alpha path is available as a lower-bandwidth
comparison mode. (The standalone `/planet` backend still uses its own `AtmospherePass`.)

## Focused body view

The sidebar "Render procedurally" action opens `FocusedBodyView.svelte` as a full-screen
overlay. This remains a separate `PlanetRenderer + WebGPUBackend` canvas for inspecting a
single body outside the system scene. It uses the shared `focusedBodyCamera()` and the
body's appearance/atmosphere data.

## Fallback behavior

If WebGPU initialization fails in `SceneViewport3D`, the route displays:

`3D unavailable: ... - use the 2D map.`

The route still has the editor, tree, and 2D `SystemMapPanel`.

## Current boundaries

- `/scene` has one main WebGPU canvas, one shared scene depth target, and one selected-body
  surface-distance target.
- Spheres/dots and the selected body's procedural terrain share that render pass/depth;
  selected terrain also writes the surface-distance target for atmosphere termination.
- Only one selected procedural body is supported in the scene pass today.
- Procedural atmosphere is rendered as the scene overlay pass.
- Eclipse shadows, rings, and multi-procedural-body budgeting remain future work.
