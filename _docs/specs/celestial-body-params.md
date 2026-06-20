# Per-body appearance — the `CelestialBody` params model

**Status:** proposal · **Scope:** give scene bodies a procedural appearance
(`PlanetParameters`) so they can be rendered/edited as real planets. A
`scene/bodyParams.ts` resolver + a body schema + the editor wiring; later, the
procedural render path. **Related:** [scene-routing.md](scene-routing.md) (phasing
item 4, "per-body params + body-editor view"), [scene-3d-viewport.md](scene-3d-viewport.md)
(Phase 4 procedural upgrade), the `/planet` renderer + `params/`.

## Problem

Scene bodies are stand-ins: `BodyNode = { bodyType, radiusMeters, standIn }` — no
appearance. So the 3D viewport draws flat spheres, and "open in the planet editor" is
a dead link. The `/planet` renderer is driven by `PlanetParameters` (radius + voronoi
/ detail noise, water, erosion, biomes, …) with named `PLANET_PRESETS`. The missing
link is **how a body carries its `PlanetParameters`** — the prerequisite for both
procedural bodies in 3D *and* the per-body editor.

## Model

A body gains an optional **appearance**: a preset reference plus sparse overrides —
not a full inlined param block. Compact, shareable across bodies, and override-diff is
what the editor writes.

```ts
interface BodyAppearance {
  preset: PlanetPresetName;          // a built-in template (starter, desert, frozen, …)
  overrides?: Partial<PlanetParameters>; // sparse per-body tweaks
}
// on BodyNode:  appearance?: BodyAppearance
```

**Resolve** (`scene/bodyParams.ts`, pure + tested):

```ts
resolveBodyParams(body: BodyNode): PlanetParameters
//  = { ...PLANET_PRESETS[body.appearance.preset], ...overrides }
```

- **Two distinct radii (discovered during impl):** `PlanetParameters.radius` is
  ~render-space (presets use `100`; it scales noise relations), **not** SI. The body's
  physical size is `radiusMeters` (SI). They are *not* the same unit, so the resolver
  does **not** fold one into the other — `radiusMeters` is the world scale applied at
  render/composite time; `params.radius` stays the appearance's. Not redundant.
- **Default appearance:** absent → `DEFAULT_PRESET` (and unknown name → default too),
  so existing bodies resolve without migration.
- **Scope by body type:** only `planet` / `moon` carry terrain appearance. `star` /
  `gas_giant` stay stand-ins (emissive / banded spheres — their own appearance models
  are later); the editor shows "no designer yet" for them, as today.

## Editor

A **Appearance** section in the `/scene` node editor for planet/moon bodies: a
**preset picker** + the existing `paramEditorSchema` sliders editing
`appearance.overrides` (a tweak writes the diff vs the preset; "reset" clears it).
This reuses the param-editor schema that already drives `/planet`'s panel — no new
slider UI.

## Rendering & LOD

Rendering is **per-body screen-size LOD**, not one "focused" body. Each frame, every
visible body's projected size (px) picks its representation, with hysteresis to avoid
flicker at the boundary:

- **dot** (sub-pixel / a few px) — a point/billboard;
- **sphere** (small–medium) — the current scene-3d shaded sphere;
- **procedural** (large — fills meaningful screen area) — the full `/planet` pipeline
  (terrain patches + atmosphere), fed `resolveBodyParams(body)`.

**Several bodies may be procedural at once** — the body you're on *plus* any others
large enough — so from a moon's surface its gas-giant primary renders procedurally,
through its atmosphere. The thresholds are an **`lod` policy on the body** (editable in
the tree — the "LOD node" idea), e.g. `{ proceduralAbovePx, sphereAbovePx }`.

This is the project's multi-scale promise, and a major rendering arc with real
prerequisites (well beyond the model in this spec):

- **Multi-body procedural rendering** — generalize the backend (today: one planet) to
  draw N procedural bodies + atmospheres in one frame, depth-composited.
- **Floating origin** — rebase the render origin to the camera each frame so Float32
  spans cm-at-surface *and* ~1e8 m inter-body (the existing `localFrame` rebasing,
  applied per camera). This is what makes "moon surface + distant gas giant" precise.
- **Unified camera** — one camera in system space, orbit *or* near-surface; LOD +
  floating origin do the rest. Reuses `/planet`'s surface camera modes.
- **A procedural-body budget** — how many bodies may be procedural simultaneously.

Reusing `/planet` means parameterizing `PlanetViewport` to accept external params +
emit changes (rather than owning preset state), and lifting its single-planet pipeline
toward multi-body — the main integration cost, taken incrementally.

## Decisions to confirm

1. **Storage:** preset + sparse overrides (recommended) vs full inline `PlanetParameters`.
2. **Radius:** ~~radiusMeters authoritative, params.radius derived~~ → *revised*:
   `radiusMeters` (SI, physical) and `params.radius` (render-space) are different
   units, kept separate; the resolver doesn't merge them (physical size applied at
   render).
3. **Focused-body view:** embed `PlanetViewport` inline in `/scene` (recommended — stays
   in scene context) vs link out to `/planet` with params.
4. **Body types:** only planet/moon get appearance now; star/gas_giant stay stand-ins
   (recommended).

## Phasing

1. **Model + resolve** — `BodyAppearance` (+ `lod` policy) on `BodyNode`;
   `resolveBodyParams` (pure, tested); default preset; doc-version bump. No UI.
2. **✅ Appearance editor** — `AppearanceEditor`: preset picker + override sliders
   (reused from `PARAM_EDITOR_SECTIONS` shape/materials) writing `appearance.overrides`
   (overridden rows flagged; one-click reset) + the `lod` thresholds, in the `/scene`
   editor for planet/moon.
3. **Screen-size LOD selection** — scene-3d computes each body's projected px and picks
   dot/sphere from the `lod` policy (still cheap, no procedural yet). Proves the LOD.
4. **First procedural body composited** — render the largest on-screen body via the
   `/planet` pipeline + floating origin, depth-composited with the sphere scene.
5. **Multi-procedural + atmosphere + near-surface camera** — N procedural bodies, their
   atmospheres, the unified camera. The "gas giant from a moon's surface" milestone.

Start with (1): pure model + resolver + tests, unblocks everything, touches no
rendering. The rendering arc (3–5) is large and lands incrementally.
