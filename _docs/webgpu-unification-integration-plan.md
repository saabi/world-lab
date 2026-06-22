# WebGPU unification and body-state integration plan

Status: design plus first bug-fix slice. This integrates:

- `_docs/specs/body-vs-viewport-state.md`
- `_docs/specs/eclipse-shadows.md`
- `_docs/scene-route-rendering-pipeline.md`
- `_docs/scene-vs-planet-renderer-comparison.md`
- `_docs/planet-shaping-pipeline-graph.md`

## Goal

Make `/planet` and `/scene` render the same body through the same WebGPU assumptions:
same camera math, same projection convention, same render style inputs, same body data
ownership, and eventually the same scene-depth pipeline.

"Styles" here means renderer-visible style state: atmosphere design, material overrides,
lighting/shadow policy, debug style toggles, and quality settings. CSS remains route UI
layout, but renderer style must not be split between ad hoc route state and body data.

## First slice already applied

These are narrow fixes that reduce current mismatch without changing persistence:

1. `/planet` `camera/orbitCamera.perspective()` now uses WebGPU clip-space depth
   (`z in [0, 1]`), matching `scene3d/orbitCamera`.
2. `scene3d` FOV is now 60 degrees, matching `/planet`.
3. `scene3d` azimuth zero now starts on +X, matching `/planet`.
4. `/scene` atmosphere debug defaults now match `/planet` defaults:
   rayleigh `1.0`, mie `1.0`, fog `0.8`.
5. `/planet` no longer falls back to WebGL at runtime; the active renderer path is
   WebGPU-only.
6. `/scene` procedural bodies now pass evaluated world rotation of the body frame into
   `planetRotation`, so scene spin/inherited frame rotation reaches terrain sampling.

These changes do not solve body persistence, scene-depth compositing, or eclipse
shadows. They remove obvious environmental drift before the larger work begins.

The remaining terrain mismatch should be treated as a pipeline-contract problem as
well as a route integration problem. `_docs/planet-shaping-pipeline-graph.md` documents
the current procedural shaping graph, confirms that terrain is not baked into textures,
and proposes a typed graph/compiler layer so cube-sphere, surface-patch, `/planet`, and
`/scene` variants share one shaping contract.

## Remaining current bugs / mismatches

### 1. Camera target semantics still differ

`/planet` orbit mode defaults to horizon look. `/scene` selected-body procedural render
targets the body center. This means the same azimuth/elevation/distance can still see a
different part of the planet.

Fix design:

- Introduce one shared `PlanetCameraInput` helper for focused-body rendering.
- Make look mode an explicit `ViewportState` field, never a body field.
- Use the same helper from `/planet`, `FocusedBodyView`, and `ProceduralBodyLayer`.
- For scene overview (`SceneViewport3D` spheres), keep a system camera, but when it
  drives a procedural body, adapt through the shared focused-body helper.

### 2. Body atmosphere is not body data

`body-vs-viewport-state.md` correctly identifies the bug: `/scene` currently creates
atmosphere from route debug knobs instead of `BodyNode.atmosphere`. `/planet` stores
atmosphere in `PlanetSnapshot`, mixed with camera state and render quality.

Fix design:

- Add `BodyAtmosphere` to `BodyNode`.
- Keep `integrateSteps` out of `BodyAtmosphere`; move it to `RenderQualitySettings`.
- Update `/scene` appearance/atmosphere editor to edit body atmosphere.
- Update `ProceduralBodyLayer` and `FocusedBodyView` to consume body atmosphere.
- Migrate single-planet documents into scene-body data, with camera saved only in
  session viewport state.

### 3. Render style ownership is split

Material overrides, shadow fill, debug colors, wireframe, patch borders, face colors,
tessellation, and atmosphere quality are not intrinsic to the body. They should not be
stored in named planet/body documents.

Fix design:

- Create `RenderStyleSettings` for view/session-scoped visual style:
  material overrides, illumination toggle, debug material view, wireframe/borders.
- Create `RenderQualitySettings` for device/user preferences:
  tessellation and atmosphere integrate steps.
- Keep these settings route/session keyed by viewport, not by body node.
- The renderer input becomes:

```ts
body design + evaluated transform + viewport state + render style + render quality
```

### 4. Lighting scope is not body-aware enough

`/scene` procedural overlay currently derives one sun direction from `collectSceneLights`.
The eclipse spec and body-vs-viewport spec both point toward per-body lighting:
`collectLightsForBody(scene, bodyId)`.

Fix design:

- Use `collectLightsForBody()` for focused/procedural body rendering.
- Preserve point-star information for eclipse math instead of immediately flattening
  everything to directional lights.
- Keep scoped moon/reflection lights unshadowed for MVP, matching `eclipse-shadows.md`.

### 5. Planet rotation is not unified

`/planet` can render axial tilt and spin through `planetRotation`; `/scene` procedural
overlay now passes evaluated world rotation of the body frame.

Fix design:

- Store spin/tilt as intrinsic body design, not camera state.
- Keep passing evaluated body-frame world rotation into `planetRotation`.
- Remove the `/planet`-only spin controls from the camera section; move them to body
  design or scene body editing.

### 6. Procedural body compositing is still a CSS overlay

`/scene` still renders procedural detail into a second WebGPU canvas and masks it with
CSS. This is good enough for preview, but not a unified renderer.

Fix design:

- Keep `SceneEngine` as the owner of the single WebGPU canvas and shared depth.
- Move procedural body rendering into `SceneEngine` as a pass targeting the same color
  and depth attachments.
- Treat sphere, terrain, atmosphere, ring, and future eclipse passes as WebGPU passes
  in one frame graph.
- Keep `renderToTexture()` only as a development/tooling path, not as the route renderer.

## Eclipse integration

`eclipse-shadows.md` is compatible with the WebGPU-only direction because it explicitly
avoids shadow maps and uses analytic shader math.

Required integration points:

1. CPU side: `collectEclipseOccluders(scene, receiverBodyId, time)` after scene
   evaluation.
2. Packing: eclipse sun plus capped occluder list in a WebGPU uniform/storage block.
3. WGSL: `planet/eclipse.wgsl` with hard umbra first, then disk-overlap penumbra.
4. Terrain path: multiply `body_eclipse_factor * terrain_self_shadow_factor`.
5. Lighting semantics: shadow fill lifts the combined direct-sun shadow once.

Important dependency: the body renderer must know the receiver body id, star position,
star radius, and body-relative/world-space surface point consistently. That argues for
implementing body-state and per-body lighting before penumbra.

## Target render pipeline

```text
PlanetScene at time t
  -> evaluated body transforms
  -> body design resolver (appearance, atmosphere, radius, spin/tilt)
  -> viewport state (camera/look mode/selection)
  -> render style + quality prefs
  -> per-body lights + eclipse occluders
  -> SceneEngine WebGPU frame
       1. clear color/depth
       2. sphere/stand-in pass
       3. procedural body terrain pass(es)
       4. atmosphere pass(es)
       5. rings/transparent passes later
       6. HUD/selection overlays outside GPU scene pass
```

## Implementation phases

### Phase 1 — Camera and WebGPU invariants

- Keep the WebGPU projection tests added for both camera modules.
- Extract a shared focused-body camera builder.
- Route `/planet`, `FocusedBodyView`, and `ProceduralBodyLayer` through that builder.
- Remove or deprecate remaining runtime WebGL exports once no call sites need them.

### Phase 2 — Body data and render style split

- Add `BodyAtmosphere` and `RenderQualitySettings`.
- Move atmosphere quality out of atmosphere design.
- Move `/planet` saved camera fields to session-only viewport state.
- Introduce `RenderStyleSettings` for material/shadow/debug style.
- Wire `/scene` and `/planet` editors to label Body, View, and Quality settings clearly.

### Phase 3 — Per-body scene lighting

- Use `collectLightsForBody()` for procedural/focused bodies.
- Preserve primary star position/radius beside packed lighting.
- Make illumination a view/scene lighting setting, not `PlanetParameters` body shape.

### Phase 4 — Single WebGPU scene engine

- Move selected-body procedural rendering out of CSS overlay and into `SceneEngine`.
- Render into one color/depth target.
- Use draw-list LOD to select sphere vs procedural pass without CSS masking.
- Keep WebGPU-only route behavior: no WebGL visual fallback.

### Phase 5 — Eclipse shadows

- Implement hard umbra first.
- Add disk-overlap penumbra after CPU/GPU math tests.
- Apply in cube-sphere and surface-patch terrain paths.
- Keep point/scoped non-primary lights unshadowed for MVP.

## Acceptance criteria

- `/planet` and `/scene` render a selected body with the same FOV, projection, look mode,
  atmosphere, material style, and light inputs when given the same scene/body state.
- Named planet/body saves contain intrinsic design only: appearance, atmosphere design,
  physical radius, spin/tilt, and LOD thresholds.
- View/session state contains camera, look mode, debug toggles, material style, and
  quality preferences.
- `/scene` procedural bodies share the same WebGPU color/depth target as spheres.
- Eclipse shadows multiply with terrain self-shadow and never require bitmap shadow maps.
