# Solar-system model — celestial bodies, hierarchy, and the editor

**Status:** proposal · **Scope:** `scene/`, `params/`, `render/`, editor UI,
`documents/` migration · **Driver:** testing tidal bulges needs real bodies, which
turns the planet editor into a system editor.

## Why this exists

Tides (and seasons, day/night, eventually eclipses/rings) are caused by **other
bodies** at real positions. To author and test them you need an actual **star and
moon(s)** in the scene, each generated from the **same procedural parameter set**
as the planet. That makes every body a first-class entity and the app a
**solar-system editor**: select an active body, edit it, and place it in an
**orbital hierarchy**.

## Unifying insight: one body model for everything

A star, planet, and moon are the **same kind of object** — a procedural
celestial body — differing only in parameter values:

| Body | Distinguishing params |
|------|------------------------|
| **Star** | huge radius, no water, **emissive** surface (granulation), is a light source |
| **Gas giant** | large radius, relief ≈ 0, banding, no water |
| **Planet** | terrain + climate + ocean + atmosphere |
| **Moon** | small radius, often airless/waterless, cratered |

This is exactly what the [scale-independence](planet-scale-independence.md) and
[climate/palette/emissive](climate-fields-and-planet-types.md) work delivers: with
relief-as-ratios + emissive + palette, the existing `PlanetParameters` becomes a
general **`CelestialBody`** param set reused for all of them. So we don't need a
separate "star renderer" — a star is a body with the emissive field cranked and
water off.

## The hierarchy

A tree of bodies linked by **orbit-of-parent**:

```
System (root / barycentre)
└── Star
    └── Planet
        ├── Moon
        │   └── (Ring of moon, eventually)
        └── Ring
```

Stars → Planets → Moons/Rings → (Moon-Rings). The existing `scene/sceneTree.ts`
already provides hierarchical nodes with a `Transform` (position + rotation quat)
and `parentId`; add a **`celestial_body` node kind** carrying:

- `bodyType: 'star' | 'planet' | 'moon' | 'compact'` (+ a non-body `barycentre`
  node kind) — defaults/UI hints only; surface body types share the same param
  set, `compact` (black hole / neutron star / white dwarf) is surfaceless (see
  Advanced elements).
- `params: CelestialBody` — the procedural appearance (today's `PlanetParameters`
  + climate/palette/atmosphere/rings).
- `physical: { massKg }` — for tides/gravity (radius already lives in params).
- `orbit` — relative to the parent (below).
- `rotation: { spinRatePerSec, axialTiltQuat }` — already prototyped on the planet.

Rings attach to a body (a child node or a property of the body).

## Orbits

Per body, relative to its parent. Start simple, extend later:

- **v1 (enough for tides):** circular orbit — `radius`, `inclination`,
  `ascendingNode`, `phaseAtEpoch`, `periodSec` (or derive the period from the
  parent mass via Kepler's third law). Position(t) is a rotation of a circle in the
  parent frame.
- **later:** full Keplerian elements (eccentricity, argument of periapsis) for
  ellipses, precession.

Each frame, walk the tree from the root and compute every body's **world
position** = parent world position + orbit(t). A shared **system clock** (with
play / pause / scrub / rate) drives `t` — the same clock can drive planet spin and
the seasonal sub-solar latitude, so orbits, tides, seasons, and day/night all stay
in sync.

## Derived quantities for the focused planet

From the bodies' world positions, derive what the surface shaders already consume —
no special cases, just real geometry:

- **Star light:** direction = `normalize(star_world − planet_world)`; intensity ∝
  `luminosity / distance²` (luminosity from the star's emissive/size). Replaces the
  hand-set directional sun (which can remain as a manual override).
- **Tidal bodies** (feeds [tides](climate-fields-and-planet-types.md#tides--gravity-summed-water-level-field)):
  for the star + each moon, `n_b = normalize(body_world − planet_world)` expressed
  in the planet body frame, `k_b ∝ massKg / distance³`. Spring/neap and the
  animated bulge then emerge from real orbital motion.
- **Day/night & seasons:** from the star direction + the planet's spin/tilt — the
  machinery already specced.

## Rendering multiple bodies

The biggest new piece. Current pipeline renders one body (cube-sphere LOD).

- **Focused body:** full cube-sphere LOD as today; the local frame centres on it.
- **Other bodies:** the same `sample_planet`/material shaders with their own params
  uniform + transform, but LOD by **angular size** — distant bodies get a handful
  of patches or a single lit/emissive sphere, sub-pixel bodies become a point/
  sprite (a star gets a bright disk + glare). Loop visible bodies, each with its
  own params/atmosphere/transform bind groups.
- **Star as light + emissive:** emissive surface for the look; its position feeds
  the lighting of everything else.

### Precision at system scale
Separations reach AU (~1.5×10¹¹ m) — far beyond f32. Render **each body in its own
camera-relative local frame** (the rebasing already exists for the focused body);
distant bodies are positioned relative to the camera, their own geometry evaluated
in their local frame. This is the standard large-world approach and reuses
`math/localFrame.ts`.

## Editor UX → system editor

- **System tree panel** — hierarchical list (Star → Planet → Moons/Rings); click to
  **select/focus** a body. Extends/parallels the existing `SceneTreePanel`.
- **Active-body selection** — the parameter panel edits the *selected* body; the
  camera orbits the *focused* body (often the same, but focus can differ for
  framing).
- **Add/remove bodies**, set `bodyType`, set orbit; **body-type presets** (star,
  gas giant, rocky planet, moon) built on the scale-independent param set.
- **Time controls** — play/pause/scrub/rate on the system clock to watch tides,
  seasons, orbits, and (later) eclipses evolve.
- **Persistence** — the document becomes a *system* (tree of bodies + orbits +
  clock), not a single planet. Migration: an existing single-planet doc becomes a
  one-body system (a star can be synthesized from the current manual sun, or left
  as a manual light).

## Where it lives: a parallel route (decided)

The system editor is a **new `/system` route**, not a mutation of `/planet`.
`/planet` becomes the **legacy per-body editor — "the new old"** (as `/old` is to
`/planet` now): left **untouched but functional**, and reached *from* `/system` to
edit a selected body.

**Routes mirror the scene tree** — navigating into a body drills the URL:

```
/system/{system}/planet/{planet}/moon/{moon} …
```

Selecting a body in `/system` (map or tree) + an "edit" action routes into the
per-body editor at the matching path. *(Scaffolded: `/system` hosts the map + tree;
the "Edit in planet editor" link is a stub to `/planet` until per-body params + the
nested routes exist.)*

**Dependency rule (important):** `/planet` and `/system/**` share `lib/`. When a
shared `/planet` dependency must change for `/system`, **either** keep the change
backward-compatible so `/planet` still works, **or** fork a `/system`-specific copy
— never silently alter `/planet`'s behavior. (E.g. the system tree is a separate
`SystemTreePanel`, leaving `/planet`'s `SceneTreePanel` untouched.)

Split by what's shared vs system-specific:

- **Shared model → stays in `lib/`** and benefits both routes: scale-independence
  (relief ratios, log radius), the climate/temperature/palette/emissive fields,
  tides-as-a-water-level-field. These are improvements to the *body* model itself;
  `/planet` gains them (with the snapshot migration), so no duplication.
- **System-specific → the new route/component:** the body hierarchy + orbits +
  system clock, multi-body rendering, focus/active-body selection, and the system
  tree UI.

If `/planet` must stay *byte-for-byte frozen*, the alternative is forking the
`lib/` namespace for the system editor — but that duplicates and diverges the
whole model; prefer the shared-`lib/` + new-route split unless there's a hard
reason to freeze.

## Advanced elements (notes — consider early, build later)

These don't need building now, but the hierarchy/lighting/tidal model should not
preclude them.

### Binary & multi-star systems
The N-body design already accommodates this — lighting and tides are **arrays**, so
two suns = two lights + two tidal contributors (double sunsets, overlapping
shadows, complex day/night fall out). The one structural need is a **barycentre
node**: a (massless or mass-summed) node two stars orbit, and which planets can
orbit. That distinguishes **S-type** (planet orbits one star) from **circumbinary
/ P-type** (planet orbits the pair). So: allow non-body **barycentre** nodes as
orbital parents; everything else generalizes for free.

### Compact objects & black holes
A black hole is a **non-surface body** — it has mass but no procedural surface, so
gravity/orbits/tides treat it as a massive point (the `k ∝ M/d³` and Kepler math
need no change; extreme mass is just a large value). The **visuals** are a separate
render path:

- **Event horizon** — a black disk/sphere (trivial).
- **Accretion disk** — reuse the **ring/disk machinery** ([planetary-rings.md](planetary-rings.md))
  with a hot **emissive** profile; optional Doppler/relativistic brightness
  asymmetry.
- **Gravitational lensing** — the hard, iconic part: bend background light around
  the hole. A specialized **ray-bending fullscreen post-pass** (deflect view rays by
  the mass/impact-parameter), analogous to but heavier than the atmosphere pass.
  Mark **advanced/optional**; the disk + horizon already read as a black hole
  without it.

`bodyType: 'compact'` covers the family — **neutron stars / white dwarfs** are the
intermediate case (tiny radius, extreme emissive, no lensing needed), reusing the
emissive body model with no new machinery.

## Phasing

1. **Minimal tidal test** — add a star and a moon as **positioned bodies** with
   simple circular orbits and masses; compute their positions to drive the planet's
   **star-light direction** and **tidal `(n_b, k_b)`**. Render them cheaply (bright
   billboard star, small sphere moon — or even gizmos) so the **bulge on the focused
   planet** is visible and animates. *No focus switching or multi-detail rendering
   yet.* This is the smallest thing that validates tides end-to-end.
2. **System tree + selection/focus + per-body params + time controls** — the editor
   becomes a system editor; still simple rendering for non-focused bodies.
3. **Full multi-body rendering** — angular-size LOD, star emissive + as the real
   light source, per-body local-frame precision for AU scales.
4. **Rings on bodies; moon-rings; eclipses** (ring/planet/moon shadows already
   analytic — see [planetary-rings.md](planetary-rings.md)).

Start with (1): it's the targeted slice that unblocks tide authoring without
committing to the full multi-body renderer.

## Related
- [climate-fields-and-planet-types.md](climate-fields-and-planet-types.md) — tides
  consume the `(n_b, k_b)` produced here; bodies reuse the climate/palette/emissive
  params.
- [planet-scale-independence.md](planet-scale-independence.md) — one param set from
  meteor to star is what makes "every body is a CelestialBody" practical.
- [planetary-rings.md](planetary-rings.md) — rings attach to bodies in this tree.
