# /scene terrain local-coordinate fix

Status: implementation note for the `/scene` procedural body terrain coordinate fix.

## Problem

The `/scene` procedural body overlay could spin after `planetRotation` was wired, but
the terrain still looked wrong because not every terrain path sampled analytics in the
same coordinate frame.

The terrain analytics live in `sample_planet(unit_dir, params, scale)`. That function
expects `unit_dir` to be in the planet's body-local frame. If scene/world directions
reach `sample_planet`, the noise fields, biome bands, normals, and polar effects are
anchored to the viewport/world frame instead of the body frame.

## Body-fixed tessellation (spin/orbit wobble fix)

Earlier placement kept a **render-frame-fixed** cube-sphere grid and inverse-rotated for
`sample_planet`. As `planetRotation` changed (spin/orbit), each vertex sampled different
body terrain while staying on a fixed render radial — relief swam under the mesh.

Terrain shaders now use **body-fixed tessellation, rotated placement**:

`fe/src/lib/planet/gpu/wgsl/terrain/cubeSphereVertex.wgsl`

- `body_dir = cube_face_uv_to_unit_dir(face, uv)` — constant per patch vertex in body space.
- `sample_planet(body_dir, …)` for displacement.
- `world_pos = rotate(planet_rot, body_dir) * world_radius`.
- Normals: body-space finite differences, then `rotate(planet_rot, n_body)`.

`fe/src/lib/planet/gpu/wgsl/terrain/surfacePatchVertex.wgsl`

- `LocalFrame` east/north/up are pre-rotated into body space on the CPU
  (`localFrameInBodySpace` in `terrainPass`) so tangent patches share the same contract.

Patch culling/scheduling rotates cube corners by `planetRotation` so LOD selection matches
rotated geometry (`screenSpace.ts`, `cubeSphereScheduler.ts`).

## Earlier fixes (rotation scope + surface patch sampling)

### 1. /scene Passed the Wrong Rotation Scope

`SceneViewport3D.svelte` previously passed an identity rotation, then local body
rotation. Local body rotation still misses inherited scene graph rotation from orbit
containers and parent frames.

It now passes:

```ts
getWorldTransform(animated, node.id).rotation
```

That is the evaluated world rotation of the selected body's body frame. It includes
scene spin plus inherited frame rotation, so `planetRotation` describes the body frame
used by the renderer.

### 2. Surface Patches Bypassed planet_rot

`surfacePatchVertex.wgsl` previously called `sample_planet(unit_dir, …)` without
`planet_rot`. That was fixed before body-fixed placement; see the section above for the
current surface-patch contract.

## Current Coordinate Contract

For procedural bodies rendered from `/scene`:

1. `SceneViewport3D` evaluates the scene at the shared clock.
2. `getWorldTransform(animated, bodyId).position` gives the body origin.
3. `getWorldTransform(animated, bodyId).rotation` gives the body frame orientation.
4. `focusedBodyCamera()` builds the body-at-origin camera from the scene orbit (the
   shared `createOrbitCamera` builder; floating-origin compositing is Phase 5's
   `bodyRelativeView()`).
5. Tessellation UVs define **body-fixed** `body_dir` (cube face or body-local tangent).
6. `sample_planet(body_dir, …)` samples terrain; vertices place at
   `rotate(planetRotation, body_dir) × displaced_radius`.
7. Normals return to the render frame with `planetRotation * n_body`.

Orbit camera motion only changes the view matrix. Body spin/orbit rotates the displaced
mesh with the terrain features locked to each vertex's `body_dir`.

## Remaining Caveats

- **Body-local sampling is necessary but not sufficient.** This fix anchors the
  *coordinate* to the body, but the fragment still samples from the **interpolated**
  vertex `body_dir`, which is a flat-triangle approximation of the sphere — so terrain
  noise/material still shifts when tessellation changes. The complete fix is to
  recompute `body_dir` from the ideal-sphere fragment coordinate; see
  [ideal-sphere-fragment-sampling.md](ideal-sphere-fragment-sampling.md) (plan Phase 2).
- `/scene` still renders the selected procedural body in a CSS-masked overlay canvas,
  not inside the main `SceneEngine` depth pass.
- `/scene` selected-body view still uses body-center targeting, while `/planet` defaults
  to horizon look.
- Full body-state parity still needs shared body spin/tilt fields and body atmosphere
  rather than route-level debug atmosphere knobs.

## Verification

Commands run after the fix:

```sh
cd fe
npm test -- src/lib/planet/gpu/wgslCompile.test.ts src/lib/planet/gpu/wgsl/wgsl.test.ts src/lib/planet/scene3d/orbitCamera.test.ts
npm run check
npm test
npm run build
```

Results:

- Focused WGSL/camera tests passed.
- `svelte-check` passed with existing warnings.
- Full Vitest suite passed.
- Production build passed with existing warnings.
