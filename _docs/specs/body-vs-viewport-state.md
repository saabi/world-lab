# Body data vs viewport state — what belongs on a celestial node

**Status:** proposal · **Scope:** separate **intrinsic body design** from **camera,
renderer, and session** concerns; unify `/planet` documents with `/scene` body nodes.
**Driver:** the legacy `PlanetSnapshot` bundles camera settings (e.g. `lookAtHorizon`)
with terrain params; the solar-system renderer already stores appearance on
`BodyNode` while camera state is ephemeral in `SceneViewport3D`. **Related:**
[celestial-body-params.md](celestial-body-params.md),
[solar-system-model.md](solar-system-model.md),
[scene-routing.md](scene-routing.md),
[scene-procedural-rendering.md](scene-procedural-rendering.md),
[device-tessellation-defaults.md](device-tessellation-defaults.md),
[../fe/src/lib/planet/documents/README.md](../../fe/src/lib/planet/documents/README.md).

## Problem

Two parallel persistence models disagree about what a "planet" is:

| Concern | `/planet` (`PlanetSnapshot`) | `/scene` (`PlanetScene`) |
|---------|------------------------------|---------------------------|
| Terrain / materials | `params` + `presetName` | `BodyNode.appearance` |
| Atmosphere (design) | `atmosphere` block (incl. `integrateSteps` — misplaced) | **Not on body yet** — defaults in procedural layers |
| Atmosphere march quality | `atmosphere.integrateSteps` in snapshot | Not exposed — hardcoded default (12) |
| Physical size | `params.radius` (render-space) | `radiusMeters` (SI) |
| Spin / axial tilt | Ephemeral UI (`spinAngle`, `axialTilt`) | `spinPeriodSeconds` on orbit chain |
| Camera | **`camera` saved in documents** | Ephemeral in `SceneViewport3D` |
| Tessellation / shading | Ephemeral (partial device persist) | Hardcoded defaults in procedural path |
| System lights | Local `createDefaultPlanetScene()` | Toy system graph (Sol, starlight, …) |

Opening a saved planet document restores **where you were looking** (`lookAtHorizon`,
azimuth, altitude) as if those were properties of Ferro or Cerule. They are not — they
are **viewport state**. The same mistake would propagate if we copied `PlanetSnapshot`
onto scene body nodes without splitting first.

[`AppearanceEditor.svelte`](../../fe/src/lib/planet/components/AppearanceEditor.svelte)
already states the intended boundary for `/scene`:

> Appearance = the planet shape/materials params (not atmosphere/camera/tessellation).

This spec makes that boundary authoritative across routes, persistence, and the editor.

## Decision

**A celestial body node carries only what the body *is*.** Camera pose, look mode,
flight modes, tessellation, debug shading, and document-selection metadata live
elsewhere.

```mermaid
flowchart TB
  subgraph persist_scene [Persist: scene document]
    bodies["BodyNode: appearance, atmosphere, spin, lod, radiusMeters"]
    graph["Orbits, drivers, lights, groups"]
  end

  subgraph persist_session [Persist: session only]
    viewport["ViewportState: camera, lookMode, fly modes"]
    selection["activeDocumentId, URL selection"]
  end

  subgraph persist_prefs [Persist: user or device prefs]
    tess["TessellationSettings"]
    atmoQuality["RenderQuality: atmosphereIntegrateSteps, …"]
    shade["MaterialOverrides, debug toggles"]
  end

  subgraph ephemeral [Ephemeral per frame]
    clock["System clock t"]
    lod_runtime["LOD hysteresis state"]
  end

  persist_scene --> renderer["Solar system + focused-body renderer"]
  persist_session --> renderer
  persist_prefs --> renderer
  ephemeral --> renderer
```

## What belongs on a body node

Intrinsic to the celestial body; saved in the **scene document** (`vp.systemScene`) or
a per-body export; travels when the body is duplicated or shared.

| Field | Status today | Notes |
|-------|--------------|-------|
| `bodyType`, `radiusMeters`, `standIn` | On `BodyNode` | Physical identity |
| `appearance` (preset + overrides) | On `BodyNode` | See [celestial-body-params.md](celestial-body-params.md) |
| `lod` thresholds | On `BodyNode` | Screen-size render policy |
| **`atmosphere`** | **Missing on node** | Today only in `PlanetSnapshot`; procedural layers call `defaultAtmosphereParams` |
| **Spin + axial tilt** | **Split** | Toy system: `spinPeriodSeconds` on nodes; `/planet` UI: `spinAngle` / `axialTilt` not saved |
| `massKg`, rings, emissive | Future | [solar-system-model.md](solar-system-model.md) |

Target body payload (conceptual — not all fields exist yet):

```ts
/** Intrinsic atmosphere look — saved on the body / scene document. */
interface BodyAtmosphere {
  enabled: boolean;
  shellHeightMeters: number;
  scaleHeightMeters: number;
  rayleighStrength: number;
  mieStrength: number;
  mieG: number;
  groundFogDensity: number;
  sunDiskIntensity: number;
}

interface CelestialBodyData {
  appearance: BodyAppearance;
  atmosphere?: BodyAtmosphere;
  // spin: spinPeriodSeconds + axial tilt on transform / rotation spec
  lod?: BodyLod;
}
```

**Atmosphere design vs march quality:** today’s [`AtmosphereParameters`](../../fe/src/lib/planet/params/atmosphereParams.ts)
also carries `integrateSteps` (UI label **Quality** — ray-march step count in
[`integrate.wgsl`](../../fe/src/lib/planet/gpu/wgsl/atmosphere/integrate.wgsl)). That
field is **not** part of what the body *is*; it is a **performance / sampling quality**
knob in the same category as tessellation vertex budget. More steps reduce banding in
the volume integral; they do not change shell height, sky colour, or haze character.

Split it into **`RenderQualitySettings`** (device or user prefs, not on the node):

```ts
interface RenderQualitySettings {
  /** Ray-march steps for the atmosphere volume integral (today: integrateSteps, default 12). */
  atmosphereIntegrateSteps: number;
  // future: terrain shadow steps (SHADOW_STEPS), etc.
}
```

At upload time, `toGpuAtmosphereParams(bodyAtmosphere, radius, center, integrateSteps)`
already accepts an external override for the last argument — the renderer should pass
`renderQuality.atmosphereIntegrateSteps`, not a value stored on the body.

**Two radii stay separate:** `radiusMeters` (SI, orbits, spheres) vs
`PlanetParameters.radius` (render-space noise relations). The resolver does not merge
them — see [celestial-body-params.md](celestial-body-params.md).

## What must NOT be on a body / planet document

### Camera and viewport

Currently in [`PlanetCameraState`](../../fe/src/lib/planet/documents/types.ts) and
written by [`toSnapshot`](../../fe/src/lib/planet/documents/snapshot.ts):

| Field | Why it is viewport state |
|-------|--------------------------|
| `azimuth`, `elevation` | Where the camera orbits |
| `altitudeMeters` / `distance` | Zoom / altitude |
| `lookAtHorizon` | Camera look mode (`horizon` vs `planet-center`) — **not a body property** |
| `orbitSpeedRadPerSec` | Camera auto-orbit animation |

Same category — ephemeral in [`PlanetViewport.svelte`](../../fe/src/lib/planet/components/PlanetViewport.svelte), correctly **not** in snapshot today, but grouped under "Camera" in the editor:

- `cameraRotation`, free-fly position/rotation
- Spaceflight modes, HUD, orbit predictor settings
- `SceneViewport3D` orbit camera (`azimuth`, `elevation`, `distance`) — already not persisted

**Target type:** `ViewportState` (or `CameraBookmark`) keyed by `(route, focusedBodyId,
viewMode)`. Restore from **session** only (`virtual-planet:session:v1` or a dedicated
`viewport:v1` key). Named planet saves must not include camera fields.

### Renderer quality and debug

Never body data:

| Field | Target home |
|-------|-------------|
| `TessellationSettings` | Device / user prefs ([device-tessellation-defaults.md](device-tessellation-defaults.md)) |
| **`atmosphere.integrateSteps`** | **`RenderQualitySettings.atmosphereIntegrateSteps`** — global/device pref; mobile/desktop defaults like tessellation |
| `MaterialOverrides` (exposure, shadow fill, …) | View prefs or session |
| Wireframe, patch borders, face colors, material debug | Session / debug prefs |

Move the **Quality** slider out of the Atmosphere super-section into **View / Renderer**
(next to Tessellation). Persist with device profile or `virtual-planet:render-quality:v1`,
not in named planet saves or `BodyAtmosphere`.

### Editor and registry metadata

| Field | Target home |
|-------|-------------|
| `presetName` at snapshot root | Redundant with `appearance.preset`; document registry label only |
| `activeDocumentId` | Session envelope (already separate) |

### Misplaced inside `PlanetParameters`

| Field | Issue | Target |
|-------|-------|--------|
| `illumination` | Toggles scene light collection — render mode, not terrain shape | View pref or scene-level lighting flag |

### Misplaced inside `AtmosphereParameters`

| Field | Issue | Target |
|-------|-------|--------|
| `integrateSteps` | Volume ray-march count — GPU cost, not sky design | `RenderQualitySettings.atmosphereIntegrateSteps` |

When migrating atmosphere onto `BodyNode`, **do not** copy `integrateSteps` onto the
node. One-time migration: read the old saved value into render-quality prefs if present,
then drop the field from body atmosphere schema.

## Rotation: editor vs model mismatch

[`PlanetEditorPanel`](../../fe/src/lib/planet/components/PlanetEditorPanel.svelte) groups
**Orbit** and **Rotation** under "Camera":

- **Orbit** controls → viewport (camera)
- **Rotation** (`axialTilt`, `spinAngle`, `spinSpeedRadPerSec`) → **body** — drives
  `planetRotation` in the renderer

Spin is animated in `/planet` but **not written to `PlanetSnapshot`**. The toy system
models spin as `spinPeriodSeconds` on body nodes evaluated by `evaluateScene`. These
paths must converge: body carries spin/tilt; camera does not.

## Current renderer wiring gaps

The solar-system path ([`SceneViewport3D`](../../fe/src/lib/planet/components/SceneViewport3D.svelte)
→ [`ProceduralBodyLayer`](../../fe/src/lib/planet/components/ProceduralBodyLayer.svelte)):

- Reads **`resolveBodyParams(body)`** for terrain — correct.
- Uses **`defaultAtmosphereParams(params.radius)`** — should use **`body.atmosphere`**.
- Uses **`DEFAULT_TESSELLATION`**, **`DEFAULT_MATERIAL_OVERRIDES`** — view/device prefs.
- Camera from host scene — correct (ephemeral); **`lookAtHorizon` not shared** —
  procedural layer hardcodes `lookMode: 'planet-center'`.
- Lighting from **`collectSceneLights`** — correct direction; focused body should use
  **`collectLightsForBody(scene, bodyId)`** when scoping matters.
- Passes the selected body's evaluated world transform rotation into
  **`planetRotation`** — scene spin and inherited frame rotation now reach terrain
  sampling. Full parity still needs a shared spin/tilt body model across `/planet`
  and `/scene`.

Legacy `/planet` path still owns a monolithic snapshot and a local `createDefaultPlanetScene()` for lights instead of the system graph.

## Migration from `PlanetSnapshot`

Today’s [`PlanetSnapshot`](../../fe/src/lib/planet/documents/types.ts):

```ts
interface PlanetSnapshot {
  presetName: PlanetPresetName;
  params: PlanetParameters;
  atmosphere: AtmosphereParameters;  // includes integrateSteps today — split on migrate
  camera: PlanetCameraState;  // ← remove from named saves
}
```

**Target:**

1. **Body fields** → scene node: `appearance`, `BodyAtmosphere` (without `integrateSteps`), spin/tilt on node.
2. **`integrateSteps`** → `RenderQualitySettings` (device/session pref).
3. **Camera fields** → session `ViewportState` only.
4. **Single-planet documents** → one-body scene (synthetic star or manual sun) per
   [solar-system-model.md](solar-system-model.md) persistence section.
5. **`/planet`** becomes a **focused-body view** of a scene path; shared `lib/` gains
   body fields; snapshot format deprecates after migration + version bump in
   [`migrate.ts`](../../fe/src/lib/planet/documents/migrate.ts).

Load path stays strict: `raw JSON → migrate → coerce` — never merge unknown keys into
live state ([documents README](../../fe/src/lib/planet/documents/README.md)).

## Implementation plan

### Phase A — Types and save behaviour (low risk)

1. Introduce `ViewportState` in `documents/types.ts` (or `scene/viewportState.ts`).
2. ✅ **Named documents = body design only:** `toBodySnapshot` (neutral camera) +
   `applyBodyDesign` (restore preset/params/atmosphere, never camera). `handleSave`/
   `handleSaveAs` use them; loading a saved planet no longer moves the camera. (Camera
   is kept required in the type with a neutral value rather than made optional — avoids a
   schema/coerce change; `coerceSnapshot` already tolerates a missing camera anyway.)
3. ✅ **Session restore:** the session envelope still keeps the live camera
   (`toSnapshot` + `applySnapshot` in the autosave/hydrate path).
4. UI: document Save does not claim to persist camera (tooltip or section label).

### Phase B — Body node completeness + render quality split

5. Split `AtmosphereParameters` → `BodyAtmosphere` + `RenderQualitySettings`; remove
   `integrateSteps` from body type.
6. ✅ Add `atmosphere?: BodyAtmosphere` to `BodyNode`. **No `SCENE_DOC_VERSION` bump** —
   the field is optional and `deserializeScene` hard-rejects a mismatched version (no
   migration path), so bumping would silently drop every existing scene; an optional field
   is backward-compatible (old scenes load, atmosphere absent → radius-derived defaults).
   Done: `BodyAtmosphere` type, `resolveBodyAtmosphere`/bridge converters, per-body
   `AtmosphereEditor`, `ProceduralBodyLayer`/`FocusedBodyView` wiring, handoff round-trip.
7. Introduce `RenderQualitySettings` + device/session persist (mirror
   [device-tessellation-defaults.md](device-tessellation-defaults.md) pattern); wire
   `terrainPass` / `atmospherePass` to pass external step count into
   `toGpuAtmosphereParams`.
8. Atmosphere editor on `/scene` for planet/moon bodies (design fields only); move
   **Quality** slider to View / Renderer section.
9. Wire `ProceduralBodyLayer`, `FocusedBodyView` to body atmosphere + render quality;
   `ProceduralBodyLayer` already receives evaluated body-frame world rotation instead
   of identity.

### Phase C — Document → scene migration

10. `migratePlanetDocToScene(snapshot)` → minimal `PlanetScene` with one body node.
11. Document registry optionally stores scene subgraph or `{ systemId, bodyPath }`.
12. Bump `CURRENT_SNAPSHOT_VERSION`; migration copies params/atmosphere to appearance
    (strip `integrateSteps` → render-quality pref); drops camera from stored documents
    (camera stays in session if present).

### Phase D — Editor reorganization

13. **Camera** super-section: viewport only; **Rotation** → body section on `/scene`.
14. **Shading / Tessellation / Atmosphere Quality / Debug** → "View" or "Renderer"
    (not saved with body).
15. Move `illumination` out of `PlanetParameters` into view/scene lighting toggle.

### Phase E — Renderer integration

16. Focused procedural render: `collectLightsForBody(scene, bodyId)`.
17. Viewport restore keyed by URL path (`/scene/.../ferro`).
18. Align look modes between scene camera, procedural layer, and future surface flight.

## Quick wins vs large lifts

| Effort | Change |
|--------|--------|
| **Quick** | Stop persisting `lookAtHorizon`, azimuth, elevation, altitude, orbit speed in **named document** saves |
| **Quick** | Label editor sections as "Body" vs "View" vs "Session" |
| **Medium** | Split `integrateSteps` → `RenderQualitySettings`; move Quality slider to Renderer |
| **Medium** | `BodyNode.atmosphere` (design only) + procedural wiring |
| **Large** | Scene document as single source of truth; `/planet` as focused view ([unified-scene-renderer.md](unified-scene-renderer.md)) |

## Acceptance criteria

- Saving "Ferro" and reloading on another machine restores **terrain and atmosphere
  design** (shell, colours, fog), not camera pose, look-at-horizon, or atmosphere
  march quality (`integrateSteps`).
- A high `integrateSteps` saved on one machine does not force that GPU cost when
  opening the same body elsewhere — quality comes from **device render prefs**.
- Two viewports on the same body (map + 3D, or split) can hold **different**
  `ViewportState` without conflicting body data.
- `AppearanceEditor` comment remains true: atmosphere is edited on the body, not mixed
  into camera controls.
- Toy system bodies round-trip through `serializeScene` with appearance + atmosphere +
  spin; no camera fields in scene JSON.

## Related

- [celestial-body-params.md](celestial-body-params.md) — `BodyAppearance` + resolver
- [solar-system-model.md](solar-system-model.md) — system persistence replaces single-planet doc
- [scene-routing.md](scene-routing.md) — URL mirrors scene tree; viewport keyed by path
- [device-tessellation-defaults.md](device-tessellation-defaults.md) — tessellation as device pref; same pattern for atmosphere march steps
- [../terrain-self-shadows.md](../terrain-self-shadows.md) — `SHADOW_STEPS` is another future render-quality candidate
