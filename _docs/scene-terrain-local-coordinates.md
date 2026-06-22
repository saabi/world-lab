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

## What Was Already Correct

The cube-sphere orbit path already sampled in the body-local frame:

`fe/src/lib/planet/gpu/wgsl/terrain/cubeSphereVertex.wgsl`

- Starts with a world/body-relative sphere direction, `unit_dir`.
- Converts it with `rotate_vector_by_quat_inv(view_u.planet_rot, unit_dir)`.
- Calls `sample_planet(body_dir, planet, scale_ctx)`.
- Places the vertex at `unit_dir * sample.world_radius_meters`.
- Computes normals in body space and rotates them back with `planet_rot`.

So orbit-mode cube-sphere terrain had the intended body-local analytics.

## Bugs Fixed

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

### 2. Surface Patches Sampled in World Space

`surfacePatchVertex.wgsl` previously called:

```wgsl
let sample = sample_planet(unit_dir, planet, scale_ctx);
```

That bypassed `planet_rot`, so low-altitude surface patches were not using the same
body-local analytics as cube-sphere patches.

The surface patch path now:

- Adds `planet_rot` to its `ViewUniforms`, matching the CPU uniform layout.
- Computes `body_dir = rotate_vector_by_quat_inv(view_u.planet_rot, unit_dir)`.
- Samples terrain/materials with `body_dir`.
- Places geometry with the unrotated world/body-relative `unit_dir`.
- Rotates body-space normals back into world/body-relative space.

## Current Coordinate Contract

For procedural bodies rendered from `/scene`:

1. `SceneViewport3D` evaluates the scene at the shared clock.
2. `getWorldTransform(animated, bodyId).position` gives the body origin.
3. `getWorldTransform(animated, bodyId).rotation` gives the body frame orientation.
4. `sceneBodyCamera()` translates the scene camera into body-relative coordinates.
5. Terrain shaders use world/body-relative directions for geometry placement.
6. Terrain analytics use `inverse(planetRotation) * direction`.
7. Normals return to world/body-relative space with `planetRotation * normal`.

That keeps the analytic terrain attached to the body while the camera, sun, and scene
frame remain external.

## Remaining Caveats

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
