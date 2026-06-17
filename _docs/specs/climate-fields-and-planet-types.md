# Climate fields & new planet types

**Status:** proposal · **Scope:** `gpu/wgsl/planet/material.wgsl` + `kernel.wgsl`,
`params/`, `documents/` migration

## Goal

Model many more *kinds* of bodies — tidally-locked worlds with a hot/sand side
and a cold/snow side, gas giants, lava worlds, ice moons, stars — by replacing
the hard-coded biome logic with a small set of **orientable climate fields** and
an **exposed material palette**. The user's prompt names the key technique:
"shifting some field axes a bit." This doc generalizes that.

## What's hard-coded today

In `material.wgsl::surface_material`, biome selection is driven by exactly two
fields, plus fixed colors/props:

1. **Elevation** — normalized height `tl = h / total_amplitude` drives sand /
   vegetation / snow / water via fixed thresholds.
2. **Latitude (Y only)** — `polar = (abs(world_pos.y)/radius − polar_scale) ·
   polar_amplitude` raises height near the poles → ice caps. The axis is
   **hard-wired to +Y**, the magnitude is fixed, and it can only make caps
   *colder* (additive height into the snow band).
3. **Fixed palette** — `ROCK/TREE/SAND/ICE/SHALLOW_WATER/DEEP_WATER` constants and
   per-biome `roughness/metallic/ior` in `biome_props()`.

There is **no temperature field independent of latitude**, no moisture, no
emissive, and every climate axis is locked to the geometry pole.

## Design: orientable climate fields

Introduce a generic **direction field** abstraction: a scalar derived from the
sample direction relative to a configurable axis. Each field has its own
**orientation (quaternion)** and **offset**, fully decoupled from geometry and
from each other. This is the "shift the field axes" mechanism.

```
field(dir, axis_quat, offset) = dot( rotate(axis_quat, +Y), dir ) - offset
```

Three independent climate inputs feed biome selection:

| Field | Driven by | Axis | Use |
|-------|-----------|------|-----|
| **Elevation** | terrain height (existing) | — | mountains, coasts |
| **Temperature** | direction vs a *thermal axis* | configurable | poles **or** substellar point |
| **Moisture** | a noise field (new, cheap) | — | deserts vs forests |

### Temperature: latitude OR substellar
A single `temperature_mode` switches what the thermal axis means:

- **Latitudinal** (Earth-like): thermal axis = spin pole. Use a **signed**
  latitude `lat = asin(dot(dir, pole))` (not `|lat|`), with `temp` peaking at a
  *reference latitude* `sub_solar_lat`: `temp = 1 − |lat − sub_solar_lat| / 90°`.
  At `sub_solar_lat = 0` this is the symmetric warm-equator / cold-poles case that
  subsumes today's polar caps. The pole axis is a quaternion (tiltable → obliquity)
  and the field can be offset (thermal equator ≠ geometric equator).
- **Substellar** (tidally-locked, e.g. a 1:1 resonance world): thermal axis = the
  fixed sun direction in the body frame. `temp = dot(dir, substellar)` → hot
  day-side, cold night-side. With the atmosphere on, the day side trends sand/rock
  and the night side trends snow/ice — exactly the requested Mercury-with-air
  look. (Reuse the existing planet-spin/axial-tilt quaternion to define the body
  frame; the substellar axis is just the sun direction expressed in it.)

### Seasons & asymmetric caps (tilted planets)
Using a **signed** latitude with a shiftable reference is what models seasons.
For an axis-tilted planet the sun's sub-solar latitude (declination) sweeps
`±axial_tilt` over the orbit, so the warm band shifts north/south off the
equator. Driving `sub_solar_lat` with this value:

- pushes the snow line **toward the winter pole** → that cap **grows**;
- pulls it back on the summer pole → that cap **shrinks**.

So a single signed offset on the latitudinal temperature field gives "more snow at
one pole, less at the other" — the exact effect requested. The control can be:

- **Static** — a `season` knob in `[−1, +1]` mapped to `sub_solar_lat =
  season · axial_tilt`; pick a fixed solstice/equinox look.
- **Animated** — drive `season = sin(orbital_phase)` so caps grow and shrink over
  the year; pairs naturally with the existing axial-tilt + spin state (the tilt
  sets the amplitude, an orbital-phase clock sets the phase). It's a per-frame
  uniform update, no extra per-pixel cost.

Same idea generalizes any latitudinal field: a small signed offset on the
**moisture** or **banding** axis biases features toward one hemisphere
(monsoon belts, off-center gas-giant bands).
- **Substellar** (tidally-locked, e.g. a 1:1 resonance world): thermal axis = the
  fixed sun direction in the body frame. `temp = dot(dir, substellar)` → hot
  day-side, cold night-side. With the atmosphere on, the day side trends sand/rock
  and the night side trends snow/ice — exactly the requested Mercury-with-air
  look. (Reuse the existing planet-spin/axial-tilt quaternion to define the body
  frame; the substellar axis is just the sun direction expressed in it.)

> Because the field is `dot(dir, axis) − offset`, "shifting the axis a bit" (a
> small rotation away from the sun direction, or an offset) puts the hottest point
> off the sub-solar point — a slightly leading/lagging terminator, asymmetric caps,
> banded deserts, etc. This one knob yields a large variety of worlds.

### Biome selection from (elevation, temperature, moisture)
Replace the elevation-only `if` ladder with a small classification, Whittaker-style:

```
water  if elevation < sea_level
ice    if temperature < freeze_line            (snow/glacier; was "polar caps")
sand   if temperature > arid_line  && moisture < dry_line   (hot deserts)
veg    if temperate && moisture > wet_line
rock   otherwise
```

`freeze_line`, `arid_line`, `dry/wet_line` are 0–1 fractions (scale-independent).
The existing elevation thresholds remain as additional gates (snow on high
peaks even when warm; sand on low warm flats). Keep it a handful of `mix`/`step`
blends so it stays cheap and continuous (no hard biome seams).

### Moisture field (new, optional)
One extra `fbm`/value-noise lookup on `unit_dir` with its own scale + an
orientable axis bias. Cheap, and it's what separates "banded desert world" from
"uniform desert world" and gives Earth-like climate variety. Gate it at the same
LOD layer as the macro voronoi.

## Tides — gravity-summed water-level field

The sea level today is a constant scalar. Make it a **directional field** so the
ocean bulges into a tidal ellipsoid, as a **sum of per-body fields** for the star
and any moons — the same orientable-field machinery, applied to water level.

### The field
Each tidal body raises a bulge shaped by the second Legendre polynomial — a bulge
both **toward and away** from the body (two high tides per rotation):

```
P2(x) = (3·x² − 1) / 2
tide(dir) = Σ_b  k_b · P2( dot(dir, n_b) )
sea_level(dir) = base_sea_level + tide(dir)
```

- `n_b` — unit direction from the planet centre to body *b* (sun, moons), in the
  body frame.
- `k_b` — tidal strength **∝ M_b / d_b³**. Note the **cube**: the tide is the
  *gradient* of gravity across the body (a differential force), so it falls off as
  distance⁻³, not ⁻². This is why a nearby small moon can out-tide a distant huge
  star (Earth: the Moon's tide ≈ 2× the Sun's despite the Sun being ~27 M× more
  massive).

`k_b` can be derived from real mass/distance, or exposed directly as an artist
"tidal strength" per body.

### What it buys, for almost free
- **One body** → a prolate ellipsoid bulging along `n_b` (the requested ellipsoidal
  water shape).
- **Sum of bodies** → **spring/neap tides emerge automatically**: when sun and
  moon align (`n_sun ≈ n_moon`) the P₂ fields reinforce (large bulge); at 90°
  they partially cancel (small bulge). No special-casing — it's just the sum.
- **Animation for free** — the bulge tracks `n_b`. As the planet spins (existing
  spin/tilt quaternion) and moons orbit, coastlines flood and drain over time. A
  per-frame uniform update; **zero** extra per-pixel cost beyond a few dot products.

### Where it plugs in
`sample_planet` (`kernel.wgsl`) already derives `wl` (water level) and clamps the
ocean surface to `max(height, wl)`. Make `wl` directional: `wl_dir = wl +
tide(unit_dir)`, and use `wl_dir` for both the geometry clamp and the biome water
test (`height ≤ wl_dir`). The bulge therefore lifts the actual rendered water
surface, not just the shading.

### New scene concept: tidal bodies / moons
The `(n_b, k_b)` per body comes from real celestial bodies (the star + moons) at
real orbital positions — see [solar-system-model.md](solar-system-model.md). For
the shader, tides only need the small array `(direction, strength)`, exactly like
the lights array; the bodies' positions (hence directions/distances) are computed
from the orbital hierarchy and a system clock, so the bulge animates from actual
orbital motion. Optionally apply a small fraction of the same field to the
**solid** surface (body tide) for rocky/airless worlds; oceans are the dominant
visible effect, so v1 can be water-only.

## Exposed material palette

Promote the hard-coded constants to parameters so the *same* climate logic paints
wildly different worlds:

- **Per-biome albedo** (rock / sand / vegetation / ice / shallow-water /
  deep-water) — ice world (all white/blue), Mars (rust), alien (teal veg), etc.
- **Per-biome `roughness / metallic / ior`** (today fixed in `biome_props`) —
  metallic asteroid, glassy ice, oily seas.
- Store as a small palette struct in the params uniform (or a second uniform).

## New planet archetypes unlocked

| Archetype | How |
|-----------|-----|
| **Tidally-locked (Mercury+air)** | `temperature_mode = substellar`; arid_line low ⇒ sand day-side; freeze_line high ⇒ snow night-side; atmosphere stays on |
| **Tilted seasons / asymmetric caps** | latitudinal temp, signed latitude, `sub_solar_lat = season · axial_tilt`; static for a fixed solstice or animated from orbital phase ⇒ one cap grows while the other shrinks |
| **Gas giant** | relief ≈ 0; **banding field** = `sin(latitude · band_count)` driving palette + the existing domain warp for turbulent bands; no water |
| **Lava world / volcanic** | **emissive** term driven by temperature/elevation (see below); dark rock + glowing cracks |
| **Star** | relief ≈ 0; emissive everywhere driven by a granulation noise field; pairs with making the body a *light source* (scene-light emission, separate work) |
| **Ice moon** | freeze_line ≈ 1, palette all ice/rock, no veg |

### Emissive / self-illumination
Add an `emissive` field to `SurfaceMaterial` (currently lit-only). Driven by a
configurable field — temperature (hot → glow), elevation (lava in valleys), or a
noise (stellar granulation) — with a color + intensity. This is the missing piece
for lava worlds and stars, and it composes with the existing PBR path (add
emissive after lighting, before tone-map). Making a star actually *emit scene
light* is a larger, separate item (lighting/IBL), but the **look** comes from
this field cheaply.

## Banding field (gas giants)
A latitude-striped modulation: `band = sin(latitude · band_count + warp)` mixed
into the palette, where `warp` reuses the voronoi-distortion domain offset for
turbulent, Jupiter-like ribbons. Orientable axis (so bands can tilt). Pairs with
relief ≈ 0 and water off.

## Parameter & uniform impact

New params (all scale-independent ratios / fractions / quats):
`temperature_mode`, `thermal_axis_quat`, `thermal_offset`, `season`
(→ `sub_solar_lat = season · axial_tilt`, static or animated from orbital phase),
`freeze_line`, `arid_line`, `moisture_scale`, `moisture_axis`,
`wet_line`/`dry_line`, `band_count`, `emissive_*`, plus the per-biome palette
(colors + props), plus a **tidal-bodies array** `(n_b, k_b)` for the star + moons.

This grows the params uniform; likely split into:
`PlanetShape` (terrain), `PlanetClimate` (fields/thresholds/axes),
`PlanetPalette` (colors/material/emissive), and a small `TidalBodies` array
(like the lights array). A migration bump is required; old snapshots map:
polar-cap → latitudinal temperature with the same axis, default moisture off,
default palette = today's constants, no tidal bodies (so existing worlds look
unchanged).

## Phasing

1. **Temperature field + substellar mode** — unlocks the requested tidally-locked
   hot/cold world with minimal new code (one field + thresholds; subsumes polar
   caps). Highest value, smallest change.
2. **Exposed palette** (colors first, then per-biome props) — huge visual range
   for free; no new fields.
3. **Moisture field** — climate variety / deserts vs forests.
4. **Tides (sun-only)** — directional sea level from the existing sun direction;
   self-contained, animates with planet spin. Add **moons** (the `(n_b, k_b)`
   array) next for spring/neap.
5. **Emissive** — lava worlds and the *look* of stars.
6. **Banding field** — gas giants.
7. **Make a star a real light source** — separate lighting work, later.

Start with (1): it directly answers the Mercury-with-atmosphere request and lays
the field/axis abstraction that everything else reuses.

## Related
[planet-scale-independence.md](planet-scale-independence.md) — the orthogonal
axis: the *same* shape rendered from meteor to star.
