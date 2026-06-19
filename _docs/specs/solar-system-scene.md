# Solar system scene — bodies, orbit hierarchy, selective illumination

**Status:** proposal · increment 1 in progress · **Scope (increment 1, all owned
here):** `scene/types.ts` (body node + light scoping), `scene/sceneTree.ts`
(body/owner helpers + label), `scene/collectLights.ts` (per-body collection),
`scene/solarSystem.ts` (new — toy preset), `scene/*.test.ts`, light-touch
`components/SceneTreePanel.svelte` (show bodies). · **Driver:** the scene graph is
lights-only around one planet. We want a solar system — a star, several small rocky
planets, gas-giant/star stand-ins, and moons — and, crucially, **selective
illumination**: a moon's (future) reflected light must illuminate only the planet
that owns its orbit, not every body.

## Where we are

`PlanetScene` is a flat `Map<id, SceneNode>` with `group` + `directional/point/
ambient` light nodes; world transforms compose through `parentId`. `collectSceneLights`
walks the tree and flattens **every** enabled light into one list for the single
rendered planet (`PlanetParameters`). No bodies, no orbits, no light scoping; the
scene isn't persisted.

## Target model

### Body nodes
A new `body` node kind represents a celestial body. Orbit **ownership is the
hierarchy**: a moon is a child of its planet; a planet is a child of its star.
"Owns its orbit" = nearest ancestor body.

```ts
export type BodyType = 'star' | 'planet' | 'gas_giant' | 'moon';

export interface BodyNode extends SceneNodeBase {
  kind: 'body';
  bodyType: BodyType;
  radiusMeters: number;
  /** The designer has no real facilities for this body yet (stars, gas giants) —
   *  a placeholder until it does. Real rocky planets are not stand-ins. */
  standIn: boolean;
}
```

`transform.position` is the body's current position relative to its parent (a static
toy layout for now; orbital elements + animation are a later increment). The focused,
fully-designed planet remains the single `PlanetParameters`; linking a `body` to full
per-body parameters is also later.

### Selective illumination (the architectural core)
Directional and point lights gain an optional scope:

```ts
/** null/undefined = global (all bodies, e.g. starlight). A bodyId scopes the light
 *  to that body only — e.g. a moon's reflected light illuminates only the planet
 *  that owns the moon's orbit. */
affects?: string | null;
```

Ambient stays global (environmental). Collection becomes **per-body**:

```ts
collectLightsForBody(scene, bodyId, illuminationOn): CollectedLighting
//   includes: ambient + every enabled light whose affects is null (global)
//             or === bodyId (scoped to this body).
```

This is the whole point: rendering planet A never pays for a moon-of-B reflection.
The existing flat `collectSceneLights` stays (global lights only behave identically),
so the current single-planet render is unchanged until it opts into a focused body.

## Toy solar system (`createToySolarSystemScene`)

Small bodies — rocky planets 400–600 km radius (≈ 1/12 Earth), everything else sized
to match:

| Body | Type | Radius | Parent | Notes |
|---|---|---|---|---|
| Sol (stand-in) | star | ~50,000 km | root | stand-in |
| Ferro | planet | 500 km | star | 1 moon |
| Cerule | planet | 450 km | star | |
| Ochre | planet | 600 km | star | 2 moons |
| Tempest (stand-in) | gas_giant | ~7,000 km | star | stand-in, 1 moon |
| Luna-F | moon | 120 km | Ferro | |
| Pebble / Cobble | moon | 90 / 70 km | Ochre | |
| Gale | moon | 200 km | Tempest | |

Lights: a global **Starlight** (directional for now — matches the current render path;
a point source at the star is a later refinement) + ambient. Each moon carries a
**disabled placeholder reflection light** scoped (`affects`) to its parent planet —
proving the model end-to-end without simulating reflection yet.

## Increment 1 (this change) — headless, no render-behavior change

1. `BodyNode` + `affects` on directional/point lights (`types.ts`); `'body'` in the
   `SceneNode` union and `nodeKindLabel`.
2. `sceneTree.ts`: `listBodies`, `findOwnerBody` (nearest ancestor body).
3. `collectLights.ts`: `collectLightsForBody` (+ keep `collectSceneLights`).
4. `scene/solarSystem.ts`: `createToySolarSystemScene`.
5. `SceneTreePanel.svelte`: render body rows (type + radius); a "Load toy system"
   affordance so it's reachable in the tree.
6. Tests: preset structure + ownership; scoping (a scoped reflection appears only for
   its owner body, the global star for all); flat collection unchanged.

Default scene stays `createDefaultPlanetScene`; the toy system is opt-in. Loading it
leaves the rendered planet lit by the global starlight only (placeholder reflections
are disabled), so no surprise lighting.

## Body LOD — distant bodies are points (`patches/bodyLod.ts`)

In a solar-system view most bodies are far away and **point-like**, so the renderer
needs an outer LOD tier *above* the patch scheduler:

1. **Point-source floor.** If a body's projected radius is below a few pixels
   (`POINT_BODY_RADIUS_PX ≈ 3`), do **not** tessellate — draw a single colored point,
   the average of the body's albedo + atmosphere tint. (Color computation is part of
   the future multi-body render path; the threshold decision lives here now.)
2. **Pixel-bounded tessellation.** When a body *is* meshed, never tessellate more
   triangles than the pixels it covers (≈ π·r²). This is the same screen-space
   principle the cube-sphere scheduler already applies via `targetVertexSpacingPx`
   / `resolutionFromDiameter`; the body tier just supplies the per-body cap.

`classifyBodyLod(radiusMeters, distanceMeters, focalLengthPx)` (pure, tested)
returns `{ tier: 'point' }` or `{ tier: 'mesh', maxTriangles }`. It uses the
codebase's projection convention (`px = worldSize·focalLengthPx / distance`). The
multi-body renderer will call this per body each frame: skip point-tier bodies'
tessellation entirely, and feed `maxTriangles` to the scheduler's budget for
mesh-tier bodies.

## Deferred (later increments)

- **Multi-body rendering** — the big one: drawing the star/planets/moons with
  solar-system-scale precision, applying the body-LOD tiers above (point vs. mesh).
  The current pipeline renders one origin-centered planet; this is a separate effort.
- **Reflection simulation** — compute each moon's reflected directional light
  (sun colour × albedo × phase, direction moon→planet), enable the scoped lights.
- **Orbital elements + animation** — replace static `transform.position` with
  semi-major axis / period / phase and advance them over time.
- **Per-body designed planets** — link a `body` to full `PlanetParameters`; star /
  gas-giant designer facilities (today they're stand-ins).
- **Editing UI** — add/remove/re-parent bodies and lights; scene persistence
  (scene is not in `documents/snapshot` today).

## Risks / checks

- Adding `BodyNode` to the union forces every exhaustive `switch` on
  `SceneNode['kind']` to handle `'body'` (`nodeKindLabel`; `npm run check` flags the
  rest). Lighting walkers use `if/else` and ignore non-light kinds — bodies are
  inert to `collectSceneLights`.
- `affects` defaults to global, so existing scenes and the flat collector are
  unaffected.
