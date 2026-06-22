# /scene vs /planet renderer comparison

Status: current implementation snapshot. Focus: environmental and coordinate-system
differences that can make the same procedural planet render differently between
`/scene` and `/planet`.

## Summary

The two routes share the terrain/atmosphere backend only after `/scene` enters its
selected-body procedural overlay path. The outer environment around that backend is
different:

- `/planet` is a single-planet editor whose camera, lighting, atmosphere, terrain mode,
  and planet rotation are owned by `PlanetViewport.svelte`.
- `/scene` is a system renderer. Bodies are first drawn as instanced spheres in
  `SceneViewport3D.svelte`; a selected planet/moon can then fade in a separate
  `ProceduralBodyLayer` canvas that reuses `PlanetRenderer`.
- `/scene` procedural rendering is not yet a true render into the scene engine's shared
  depth buffer. It is a masked, CSS-opacity overlay canvas.

The largest mismatch candidates are camera model, projection convention, near/far planes,
lighting representation, atmosphere parameters, physical radius scaling, and planet
rotation.

## Top differences likely to affect visual parity

| Area | `/planet` | `/scene` procedural overlay | Risk |
| --- | --- | --- | --- |
| Camera module | `camera/orbitCamera.ts` (`createOrbitCamera`) | shared `focusedBodyCamera()` → same `createOrbitCamera` | Unified (Phase 1) |
| FOV | 60 degrees | 60 degrees (`FOVY = PI / 3`) | Fixed |
| Default gaze | Horizon look by default when `lookAtHorizon = true` | Body-centered target for selected body | High |
| Projection matrix | `camera/orbitCamera.perspective()` | `scene3d/orbitCamera.perspective()` | High |
| Depth convention | WebGPU z `[0, 1]` | WebGPU z `[0, 1]` | Fixed |
| Near/far | near `0.1`; far `max(radius*20, distance*4)` | near `distance*0.002`; far `distance*20` | Medium |
| Distance input | altitude above sea level -> distance | scene camera distance, often body radius * 8 on selection | Medium |
| Lighting source | default scene has directional sun on +X | toy solar-system point light converted to body-local directional sun | High |
| Lighting scope | respects `params.illumination > 0.5` | procedural overlay currently always packs selected-body lighting when visible | Medium |
| Atmosphere | saved/editor atmosphere, defaults strength 1.0, fog 0.8 | debug knobs default rayleigh/mie 1.0, fog 0.8 | Fixed default only |
| Planet rotation | `planetRotation = axialTilt * spinAngle` | evaluated world rotation of the body frame | Partially fixed |
| Physical radius | preset/editor `params.radius` | `params.radius = body.radiusMeters` after resolving appearance | High |
| Backend canvas | one WebGPU backend/canvas | separate WebGPU backend/canvas stacked over scene canvas | Medium |

## /planet render environment

Route entry:

- `fe/src/routes/planet/+page.svelte` mounts `PlanetViewport`.
- `fe/src/routes/planet/+page.ts` disables SSR.

`PlanetViewport.svelte` owns the whole render environment:

- Planet document/preset state: `params`, `atmosphere`, material overrides, tessellation.
- Camera state: orbit, free-fly, and spaceflight modes.
- Lighting scene: `createDefaultPlanetScene()` plus editor lighting controls.
- Planet rotation: axial tilt and spin compose into `planetRotation`.
- Backend selection: `WebGPUBackend` only.

The normal frame path is:

`buildCamera()` or `buildFreeFlyCamera()` -> `buildFrame()` ->
`buildRenderFrame()` -> `backend.render(frame)`.

For WebGPU:

`WebGPUBackend.render()` -> `TerrainPass.render()` -> `AtmospherePass.render()`.

## /scene procedural render environment

The `/scene` main viewport has two layers:

1. The main scene canvas: `SceneEngine + SpherePass`.
2. The selected-body procedural overlay: `ProceduralBodyLayer + PlanetRenderer + WebGPUBackend`.

Only the second layer uses the `/planet` terrain/atmosphere pipeline.

`SceneViewport3D.svelte` decides whether to mount the overlay from the draw list:

- The selected body must be a planet or moon.
- It must be visible.
- Its `proceduralBlend()` must be greater than zero.

The overlay then renders with:

- Body appearance from `resolveBodyParams(body)`.
- `params.radius` overwritten to `body.radiusMeters`.
- Camera from the shared `focusedBodyCamera()` (same `createOrbitCamera` builder as `/planet`).
- Atmosphere from `defaultAtmosphereParams(body.radiusMeters, atmo.fog)` with live debug
  strengths.
- Lighting packed as one directional light toward the solar-system point light.
- `planetRotation` from the selected body's evaluated world transform rotation.

## Coordinate-system comparison

### World basis

Both systems use a Y-up convention and place the untransformed planet at local origin.
Both interpret orbit azimuth with X/Z as the horizontal plane. However, they use separate
camera implementations.

`/planet` orbit camera position without a quaternion:

```ts
[
  distance * cos(elevation) * cos(azimuth),
  distance * sin(elevation),
  distance * cos(elevation) * sin(azimuth)
]
```

`/scene` scene3d camera eye:

```ts
[
  target.x + distance * cos(elevation) * sin(azimuth),
  target.y + distance * sin(elevation),
  target.z + distance * cos(elevation) * cos(azimuth)
]
```

That is a 90 degree azimuth phase difference: `/planet` uses azimuth 0 on +X, while
`/scene` uses azimuth 0 on +Z.

### Target and gaze

`/planet` `createOrbitCamera()` defaults to `lookMode: 'horizon'`. `PlanetViewport`
passes `lookMode: lookAtHorizon ? 'horizon' : 'planet-center'`, and `lookAtHorizon`
defaults to `true`.

In horizon mode, the camera target is not the planet center. It is a point along the
orbital travel direction, dipped toward the horizon according to altitude. That changes
the visible surface, apparent lighting angle, and depth distribution.

`/scene` procedural overlay calls:

```ts
focusedBodyCamera({ azimuth, elevation, distance, planetRadius: body.radiusMeters, aspect, lookMode })
```

The body is centered at the local origin (target `[0, 0, 0]`), orbited by the scene
camera through the **same `createOrbitCamera` builder `/planet` uses** — so `lookMode`
(`planet-center` vs `horizon`) is now the only gaze difference, and it is explicit
viewport state. Earlier the view direction would differ from `/planet` whenever
`/planet` is in horizon mode.

### Projection matrix

The two camera modules use different perspective formulas.

`/scene` explicitly builds a WebGPU projection with z in `[0, 1]`:

```ts
[
  f/aspect, 0, 0, 0,
  0, f, 0, 0,
  0, 0, far/(near-far), -1,
  0, 0, near*far/(near-far), 0
]
```

`/planet` uses the helper in `camera/orbitCamera.ts`:

```ts
[
  f/aspect, 0, 0, 0,
  0, f, 0, 0,
  0, 0, (far+near)/(near-far), -1,
  0, 0, 2*far*near/(near-far), 0
]
```

Both helpers now use the WebGPU `[0, 1]` depth convention. This was previously a real
environment mismatch and should stay covered by projection tests because it affects
clipping, depth precision, atmosphere depth reads, and any depth-based compositing.

### Near and far planes

`/planet` orbit mode:

- `near = 0.1`
- `far = max(params.radius * 20, distance * 4)`

`/scene` body camera:

- `near = max(1, sceneCamera.distance * 0.002)`
- `far = sceneCamera.distance * 20`

For selected bodies, `/scene` often sets `camera.distance = body.radiusMeters * 8`.
That makes near roughly `0.016 * radius`, much larger than `/planet`'s fixed `0.1`.
This can remove near-surface detail if the camera gets close and can change depth
precision for the atmosphere pass.

### Local frame and floating origin

Both routes ultimately call `buildRenderFrame()`, which builds/rebases a `LocalFrame`
from `camera.position` and `params.radius`.

In `/planet`, `camera.position` is planet-local ECEF-like world space.

In `/scene`, `focusedBodyCamera()` renders the body at the local origin (orbit position
`distance·dir`), so `camera.position` is body-relative — identical to `/planet` for the
same orbit. (The general floating-origin translation by `-bodyWorldPos`, for compositing
the body among other scene objects, is `bodyRelativeView()`, deferred to Phase 5.) This
is the right shape for reusing the planet pipeline, but it depends on the scene camera
view/projection being exactly compatible
with the backend shaders. Any mismatch in projection, target, FOV, or near/far becomes
visible inside the same terrain passes.

## Lighting differences

`/planet` lighting comes from `createDefaultPlanetScene()`:

- Ambient: `[0.02, 0.022, 0.028]`.
- Directional sun on +X, color `[1.0, 0.95, 0.85]`, intensity `3.5`.
- Optional fill light disabled by default.
- Lighting is disabled entirely when `params.illumination <= 0.5`.

`/scene` toy solar-system lighting is different:

- Ambient uses the same default ambient.
- Starlight is a point light at `ss-sol`.
- For the procedural overlay, `SceneViewport3D` converts the sun position into a
  body-local directional light:

```ts
sunDir = normalize(sun.position - bodyWorldPos)
```

That is physically sensible for bodies in the system, but it is not the same as the
fixed +X directional light in `/planet` unless the selected body happens to sit on the
matching side of the star and the route uses matching camera orientation.

The sphere pass also uses point-light Lambert shading, while the procedural overlay uses
the planet PBR lighting code. During fade-in, the sphere and procedural body can disagree
in terminator shape and brightness.

## Atmosphere differences

`/planet` uses the editable `atmosphere` state. For the default preset this starts as:

- `rayleighStrength = 1.0`
- `mieStrength = 1.0`
- `groundFogDensity = 0.8`
- `shellHeightMeters = radius * 0.2`
- `scaleHeightMeters = radius * 0.1`
- `sunDiskIntensity = 20.0`

`/scene` procedural overlay creates fresh atmosphere params per body and then overrides:

- `enabled = atmo.enabled`
- `rayleighStrength = atmo.rayleigh`, default `1.0`
- `mieStrength = atmo.mie`, default `1.0`
- `groundFogDensity = atmo.fog`, default `0.8`

So the current defaults match `/planet`, but `/scene` still does not persist atmosphere
as body data and still exposes these as route-level debug knobs.

## Radius and scale differences

`/planet` uses preset/editor `params.radius`.

`/scene` resolves appearance from the body preset, but then replaces `params.radius` with
the scene body's physical `radiusMeters`.

This means the same named preset can render at a different radius in `/scene` than in
`/planet`. Since terrain amplitudes and atmosphere shell/scale heights are radius-based,
the apparent relief, fog, sky thickness, patch mode, and altitude thresholds can all
change.

The toy solar-system bodies are also small by design: rocky planets are hundreds of km
radius, not the same radius as whatever preset is currently active in `/planet`.

## Planet rotation differences

`/planet` passes a non-identity `planetRotation` derived from axial tilt and spin:

```ts
planetRotation = axialTiltAroundZ * spinAroundY
```

`/scene` procedural overlay now passes the selected body's evaluated world transform
rotation:

```ts
planetRotation: getWorldTransform(animated, bodyId).rotation
```

This fixes the old coordinate bug where animated scene spin never reached the terrain
shader, and it also accounts for inherited parent rotations in the scene graph. Full
parity still needs the body model to store axial tilt/spin consistently across
`/planet` and `/scene`.

## Backend and compositing differences

`/planet` owns a single render canvas and presents the terrain/atmosphere output directly.
It can fall back to WebGL when WebGPU is unavailable.

`/scene` procedural overlay:

- Uses WebGPU only.
- Creates a second `WebGPUBackend` and canvas.
- Is visually composited by CSS opacity and a radial mask over the sphere scene.
- Does not share depth with `SceneEngine`.

This can cause visible differences at edges, atmosphere feathering, occlusion, and during
the LOD cross-fade from sphere to procedural.

## Recommended parity checks

1. ✅ Done (Phase 1): `/scene` and `/planet` share `createOrbitCamera` via
   `focusedBodyCamera()`, so FOV/projection/azimuth basis are identical by construction.
2. ✅ Addressed (Phase 1): `lookMode` is explicit viewport state on both routes
   (`/scene` exposes a horizon-look toggle), so the gaze can be matched to either
   `/planet` mode rather than diverging silently.
3. Keep both projection helpers covered by explicit WebGPU depth convention tests.
4. Move atmosphere from route debug state onto body design data before judging saved
   planet parity.
5. Compare with the same evaluated `planetRotation`, zero extra viewport spin, and equal radius.
6. Use the same light type/direction: either force `/planet` to a directional light that
   matches `normalize(sun - body)`, or force `/scene` overlay to the `/planet` default +X
   directional light.
7. Compare screenshots with the procedural overlay opacity forced to `1` and the sphere
   layer hidden, so CSS cross-fade and sphere shading do not contaminate the comparison.

## Most likely root causes

For "the planets do not render the same" between `/scene` and `/planet`, the current code
points to these first:

1. Camera mismatch: target-center vs horizon gaze remains the largest current camera
   difference.
2. Lighting mismatch: `/planet` default directional +X sun vs `/scene` body-local
   direction toward a point-light star.
3. Scale mismatch: `/scene` replaces preset radius with the body radius, so terrain and
   atmosphere scale are not guaranteed to match the `/planet` active preset.
4. Body-state mismatch: `/scene` atmosphere is still route/debug driven, and full
   rotation parity still needs a shared body spin/tilt model.
