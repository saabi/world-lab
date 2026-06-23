# Renderer unification & body model — integrated plan

**Status:** authoritative roadmap. This is the single source of truth for making
`/planet` and `/scene` render the same body identically and converging on one WebGPU
scene engine. It **integrates and supersedes the planning intent** of the documents in
§8, which remain as background/detail. Where those docs disagreed, §5 records the
resolution.

## 1. Goal

One WebGPU **scene engine** (one device, one color + shared depth target) that renders
a solar system from orbit down to a body's surface. `/planet` and `/scene` render the
**same body identically** given the same body design, camera, and style. `/planet`
becomes a focused-body view of a scene path; named saves hold intrinsic body design
only.

## 2. Why the bugs recur — five implicit contracts

Every terrain/atmosphere mismatch fixed so far (`world_pos` texture, absolute LOD
gates, azimuth basis, rotation scope, overexposure, tessellation crawl) is a symptom of
the same root: the renderer's contracts are **implicit**, so each fix is local and the
next mismatch is already waiting.

| # | Contract | Implicit today → bug class |
|---|----------|----------------------------|
| A | **Parameter scale-behavior** — each param is *ratio-of-radius*, *unit-direction-frequency*, or *absolute* | undocumented → `world_pos` texture, absolute `mpp` gates |
| B | **Coordinate spaces** — `world_dir` / `body_dir` / `world_pos`; vertex vs fragment | implicit → missing `inverse(planetRotation)`, world-space terrain |
| C | **Fragment sampling** — interpolated mesh vs ideal-sphere coordinate | implicit → terrain crawls with tessellation; route LOD differences diverge terrain |
| D | **Body vs viewport vs quality state** — what a body *is* vs how/where it's viewed | mixed → can't compare `/planet` and `/scene` like-for-like |
| E | **Scale model** — terrain is scale-invariant, the atmosphere is not | treated uniformly → overexposure at world scale |

The fix is to make all five **explicit and testable**, then converge the two routes.

## 3. The contracts, made explicit

### 3.1 Radius & parameter scale contract (resolves A, E)

- **One physical render radius.** `radiusMeters` (SI) is the radius the body renders at,
  at world scale. The terrain is **scale-invariant** — noise samples the **unit
  direction** (`voronoi3(unit_dir·scale)`) and relief amplitudes are **ratios of
  radius** — so any radius renders the same shape. Therefore the renderer sets
  `params.radius = radiusMeters`; there is no separate "render-space radius".
- **Authoring reference radius `R_ref = 100 m`.** Layers not yet expressed as
  unit-direction frequencies use `R_ref` as a fixed normalizer so they stay
  scale-invariant. Today this is the fine **texture noise** (`unit_dir · R_ref ·
  sqrt(texture_noise_scale)`), tuned at the presets' radius 100.
- **Atmosphere is scale-invariant (Phase 3 — done).** Atmosphere optical depth ≈
  `∫ strength · density(h) dl`, and both the shell path `dl` and the density scale-height
  grow with radius, so raw optical depth ∝ `strength × radius`. `toGpuAtmosphereParams`
  now divides the per-unit-length strengths (`rayleigh`, `mie`) by `radius / R_ref`: at
  radius 100 the factor is 1 (`/planet` unchanged); at `5e5` it divides by 5000 (no
  blow-out). The shader's old `radius/100` β factor — which scaled the wrong way and
  compounded into ~`radius²` optical depth (the overexposure) — was removed; the CPU owns
  the scale contract. Fog density rides on `σ_t`, so it inherits the normalization. So
  `BodyAtmosphere` strengths are radius-independent and defaults of `1.0` are correct
  everywhere.
- **Per-parameter table.** Every `PlanetParameters` / `AtmosphereParameters` field is
  documented with **unit + coordinate space + scale-behavior** (`ratio-of-radius` /
  `unit-dir-frequency` / `absolute-normalized-by-R_ref`). See
  [planet-shaping-pipeline-graph.md](planet-shaping-pipeline-graph.md) "parameter
  contract" — extended with the scale-behavior column.

### 3.2 Coordinate-space contract (resolves B)

| Space | Meaning | Allowed use |
|-------|---------|-------------|
| `world_dir` | unit direction from planet centre, world-oriented | **geometry placement only** |
| `body_dir` | `inverse(planetRotation) · world_dir` | **all** analytic noise / material / normal sampling |
| `world_pos` | `world_dir · world_radius_meters` | lighting position, depth — **never** the noise coordinate |

`planetRotation` is the body's **evaluated world-frame rotation** (scene spin + tilt +
inherited frame). Any analytic sample that skips `inverse(planetRotation)` anchors
terrain to the viewport instead of the body.

### 3.3 Fragment sampling invariant (resolves C)

Fragment terrain analytics must start from the **ideal-sphere fragment coordinate**, not
interpolated vertex data: reconstruct the view ray, intersect the base sphere
(`planet.radius`), `body_dir = inv(planetRotation)·world_dir`, then **recompute**
`sample_planet(body_dir)` and use *that* sample's height/material — never interpolated
vertex height. Vertex stage still displaces geometry from its own patch `body_dir`;
fragment shading does not inherit it. Grazing-angle / above-sphere silhouette fallback
is **deferred**. See [ideal-sphere-fragment-sampling.md](ideal-sphere-fragment-sampling.md).

### 3.4 Body vs viewport vs quality (resolves D)

| Tier | Holds | Persisted |
|------|-------|-----------|
| **Body design** | appearance, `BodyAtmosphere` (design), spin/tilt, `lod`, `radiusMeters` | scene document |
| **Viewport/session** | camera pose, `lookMode`, selection, fly modes | session only |
| **Quality/prefs** | tessellation, atmosphere `integrateSteps`, material overrides, debug toggles | device/user prefs |

See [body-vs-viewport-state.md](body-vs-viewport-state.md). `illumination` leaves
`PlanetParameters` (it's a lighting mode, not shape).

## 4. Current state (honest)

- **Committed / done:** scale-invariant terrain (radius-relative LOD gates, `unit_dir·100`
  texture), draw list, `SceneEngine` + `SpherePass`, `bodyRelativeView`, the `/scene`
  CSS-overlay procedural cross-fade; the parameter contract (Phase 0.1) and the
  `body_dir`/lat-long debug views (Phase 0.2); the camera-parity slice (FOV → 60°,
  azimuth → +X, `planetRotation` = body world-frame rotation, surface-patch `body_dir`);
  and **Phase 1** — one shared `focusedBodyCamera` builder over `createOrbitCamera`, used
  by `/planet`, `FocusedBodyView`, and `ProceduralBodyLayer`, with `lookMode` as viewport
  state (the duplicate `sceneBodyCamera` retired).
- **Phase 2 — ideal-sphere fragment sampling (code done):** fragment terrain recomputes
  `body_dir` from the ray∩base-sphere coordinate (`inv_view_projection` + `viewport` added
  to `ViewUniforms`; shared `common/idealSphere.wgsl`), falling back to the interpolated
  dir on a miss (grazing case deferred). Both cube-sphere and surface-patch paths use it.
- **Phase 3 — atmosphere scale-invariance (code done):** `toGpuAtmosphereParams` divides
  `rayleigh`/`mie` strength by `radius / R_ref`; the shader's backwards `radius/100` β
  factor is removed; fog inherits the normalization via `σ_t`. `/scene` debug sliders
  back on `/planet`'s ~1.0 scale.
- **Done but not yet visually verified on GPU:** the camera-parity slice, the debug views,
  Phase 2, and Phase 3 — confirm the lat/long grid stays put under a tessellation sweep,
  and that one atmosphere strength looks the same at radius 100 and at world scale (no
  overexposure). The author has no GPU.
- **Phase 4 — atmosphere as body data (code done):** `BodyAtmosphere` on `BodyNode`
  (optional field, no doc-version bump → existing scenes load unchanged), a per-body
  `AtmosphereEditor` on `/scene`, `ProceduralBodyLayer`/`FocusedBodyView` consume
  `resolveBodyAtmosphere(body)`, and the global route-debug atmosphere knobs are retired.
  Atmosphere now round-trips through the `/scene`↔`/planet` handoff. `integrateSteps` stays
  a default (the `RenderQualitySettings`/`ViewportState` split is the remaining Phase-4 bit).
- **Phase 4 — viewport/body boundary (code done):** named `/planet` saves now persist
  **body design only** (`toBodySnapshot` / `applyBodyDesign`); loading a saved planet no
  longer moves the camera (look-mode/azimuth/altitude). The session still restores the
  full viewport. `RenderQualitySettings` is **deferred** — `integrateSteps` already has no
  editor (it's a constant default), so the split has no current consumer.
- **Not started:** single-engine composite (Phase 5), eclipse shadows (Phase 6), the graph
  compiler.

## 5. Contradictions resolved

| Contradiction | Sources | Resolution |
|---------------|---------|------------|
| Atmosphere debug defaults `1.0` "match `/planet`" **vs** blown white at world scale | integration-plan §"first slice"; comparison §atmosphere | Make atmosphere **scale-invariant** (§3.1): normalize strength by `R_ref/radius`. Then `1.0` is correct at any radius. |
| "Two separate radii, do not merge" **vs** renderer sets `params.radius = radiusMeters` | celestial-body-params decision #2 **vs** ProceduralBodyLayer | `radiusMeters` **is** the render radius (terrain scale-invariant). No render-space radius; preset radius is only an authoring reference (`R_ref`). Update celestial-body-params. |
| "First slice already applied" | integration-plan | Uncommitted + unverified → **in-progress**. |
| `FOVY = π/4` **vs** `π/3` | scene-3d-viewport / unified-scene-renderer specs **vs** current code | `π/3` (60°) to match `/planet`. Update the two specs. |
| Terrain "now body-local / stable" **vs** still tessellation-dependent | scene-terrain-local-coordinates **vs** ideal-sphere-fragment-sampling | Body-local was necessary but not sufficient; fragment ideal-sphere sampling completes it. Add the caveat to scene-terrain-local-coordinates. |
| "Build the shaping graph compiler" framed as the fix | planet-shaping-pipeline-graph | The compiler is **deferred**; its *byproducts* (param contract, space types, parity tests, debug views) are the near-term work. |

## 6. Plan — one ordering

**Phase 0 — Make it visible and checkable** *(cheap, unblocks everything)*
1. **Parameter contract**: annotate `PlanetParameters`/`AtmosphereParameters` fields
   with unit + space + scale-behavior (§3.1) + a short contract doc.
2. **`body_dir`-as-RGB debug material view** rendering identically in `/planet` and
   `/scene` — the parity *diagnostic* (proves space + tessellation issues visually).
3. **Parity test**: same body + camera + style ⇒ identical `RenderFrame` before submit.

**Phase 1 — Camera unification. ✅ done.** One shared focused-body camera builder
(`focusedBodyCamera` over `createOrbitCamera`) for `/planet`, `FocusedBodyView`,
`ProceduralBodyLayer`; `lookMode` is viewport state; the duplicate `sceneBodyCamera` is
retired and `bodyRelativeView` kept for the Phase-5 composite. Camera-parity slice
committed behind it.

**Phase 2 — Fragment correctness. ✅ code done.** Ideal-sphere fragment coordinate (§3.3),
shared by cube-sphere and surface-patch paths via `common/idealSphere.wgsl`
(`inv_view_projection` + `viewport` in `ViewUniforms`; grazing-miss falls back to the
interpolated dir). CPU mirror test locks the ray/inverse/intersection math; **verify on
GPU** with the Phase-0 lat/long grid under a tessellation sweep.

**Phase 3 — Scale model. ✅ code done.** Atmosphere made scale-invariant (§3.1):
`toGpuAtmosphereParams` divides `rayleigh`/`mie` strength by `radius / R_ref` and the
shader's backwards β factor is removed; `/scene` strength sliders restored to `/planet`'s
~1.0 scale (the route-debug guesswork retired). Verify on GPU: one strength, same look at
radius 100 and world scale.

**Phase 4 — Body / view / quality split.** *Atmosphere-as-body-data ✅ done:*
`BodyAtmosphere` on `BodyNode` (optional → no `SCENE_DOC_VERSION` bump needed; the
hard-reject deserializer would otherwise drop existing scenes), per-body
`AtmosphereEditor`, procedural/focused render consume it, round-trips through the handoff.
*ViewportState ✅ done:* named saves persist body design only (`toBodySnapshot` /
`applyBodyDesign`); loading a planet no longer restores camera/look-mode (session still
does). *Deferred:* `RenderQualitySettings` — `integrateSteps` has no editor today (it's a
constant), so the split has no consumer yet. (body-vs-viewport Phases A–B.)

**Phase 5 — Single engine.** Move procedural terrain + atmosphere into `SceneEngine`'s
shared color+depth via `bodyRelativeView`; `objectOpacity` cross-fade (sphere fades out,
planet fades in, one writes depth); retire the CSS overlay + mask. (unified-scene-renderer.)

**Phase 6 — Eclipse shadows.** Analytic umbra (then penumbra), multiplied with terrain
self-shadow. (eclipse-shadows.)

**Later — graph compiler.** Generate cube-sphere/surface-patch shaders from one shaping
graph, once Phases 0–5 have made the contracts explicit and tested.

## 7. Acceptance criteria

- `/planet` and `/scene` render the same body **identically** given the same body
  design, camera, look mode, and style.
- Terrain noise/material is **invariant to tessellation** (the `body_dir` debug view is
  stable across levels).
- Atmosphere look is **invariant to radius** at equal authored strength.
- Named body saves contain **intrinsic design only**; camera/look-mode/quality persist
  elsewhere.
- `/scene` spheres and procedural bodies share **one** WebGPU color/depth target.

## 8. Source documents

| Doc | Role | Status |
|-----|------|--------|
| [scene-route-rendering-pipeline.md](scene-route-rendering-pipeline.md) | current `/scene` pipeline snapshot | current-state |
| [scene-vs-planet-renderer-comparison.md](scene-vs-planet-renderer-comparison.md) | environment-by-environment diff | current-state |
| [planet-shaping-pipeline-graph.md](planet-shaping-pipeline-graph.md) | shaping graph + param/space contract + compiler | proposal (compiler deferred) |
| [ideal-sphere-fragment-sampling.md](ideal-sphere-fragment-sampling.md) | tessellation-independent fragment sampling | proposal (Phase 2) |
| [scene-terrain-local-coordinates.md](scene-terrain-local-coordinates.md) | body-local `planetRotation` fix | implementation note |
| [body-vs-viewport-state.md](specs/body-vs-viewport-state.md) | body vs viewport vs quality split | proposal (Phase 4) |
| [unified-scene-renderer.md](specs/unified-scene-renderer.md) | one engine, shared depth, opacity fade | proposal (Phase 5) |
| [celestial-body-params.md](specs/celestial-body-params.md) | `BodyAppearance` + resolver | partly done (radius note updated by §5) |
| [eclipse-shadows.md](specs/eclipse-shadows.md) | analytic eclipse shadows | proposal (Phase 6) |
| [webgpu-unification-integration-plan.md](webgpu-unification-integration-plan.md) | prior integration plan | superseded by this doc |
