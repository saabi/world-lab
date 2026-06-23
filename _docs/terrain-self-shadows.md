# Terrain self-shadows

Procedural self-shadows for the primary directional sun, cast by the terrain
heightfield onto itself. Because the terrain is an analytic height function
(`sample_planet`), shadows are ray-marched in the fragment shader rather than
rendered into a shadow map.

## How it works

- `gpu/wgsl/planet/shadow.wgsl`
  - `sample_shadow_height(dir, params)` — a **coarse** terrain radius (macro
    voronoi relief + erosion remap + ocean clamp), skipping the detail and
    texture-noise layers.
  - `terrain_sun_shadow(surface_pos, sun_dir, params, scale)` — marches a fixed
    number of steps along the sun direction; at each step it compares the sample
    point's distance-from-center against the coarse terrain radius there.
    Returns `1.0` (lit) or `0.0` (occluded).
- `evaluate_pbr` (`lighting.wgsl`) multiplies the **direct** contribution by the
  shadow factor for **directional lights only**; sky/IBL ambient stays lit so
  shadowed valleys do not go black.
- The march runs in `cubeSphereVertex.wgsl` (orbit / cube-sphere path) and
  `surfacePatchVertex.wgsl` (flight / surface path), gated by the **Shading →
  Shadows** toggle (`MaterialOverrides.shadows`).
- `sample_shadow_height` and `terrain_sun_shadow` scale relief amplitudes by
  `params.radius` (same as `sample_planet`) so shadow reach and caster height stay
  correct at world scale, not only at the authoring reference radius.

## What makes this an MVP (vs. a complete implementation)

| Area | MVP (current) | Complete |
|------|---------------|----------|
| **Edge quality** | Hard shadows — single 0/1 occlusion test, prone to aliasing/banding at the edge. | Soft penumbra via tracked `min(clearance / t)` along the ray; penumbra widens with caster distance. |
| **Caster fidelity** | Coarse height only (macro voronoi). Detail/texture-noise relief neither casts nor self-occludes. | Match the caster to the visible surface, or a dedicated multi-scale height the shadow ray can afford. |
| **Coverage** | Cube-sphere and surface-patch fragment paths (orbit, flight, surface modes). | Eclipse / ring shadows composited with terrain self-shadow. |
| **Step budget** | Fixed `SHADOW_STEPS = 16`, uniform linear stepping, distance bounded by `relief / sin(sun elevation)`. | Altitude/LOD-adaptive step count and spacing; reuse `should_eval_layer` so distant pixels march cheaper. |
| **Grazing light** | March distance is capped, so very long terminator shadows are clipped. | Longer/adaptive marching or horizon-angle precomputation for grazing angles. |
| **Lights** | Primary directional sun only. | Optional shadows for additional directional lights; point-light shadowing is out of scope (too expensive per-pixel). |
| **Bias / acne** | Constant bias scaled by `meters_per_pixel`; the coarse caster vs. full-height receiver can mismatch near coastlines. | Slope-scaled bias and/or a consistent caster/receiver height to remove residual acne. |
| **Performance** | ~16 × (voronoi + fbm) per lit terrain pixel; no caching. Toggle is the only escape hatch. | Profiled step budgets, early-out heuristics, possibly a screen-space or cached horizon term. |

## Knobs

- **Shading → Shadows** — on/off (skips the march entirely when off).
- **Shading → Shadow Fill** — fraction of direct sun retained inside shadows
  (`0` = black, `1` = no shadow). Lifts the shadow factor via
  `mix(shadow_fill, 1.0, raw_shadow)`, a cheap stand-in for Rayleigh-scattered
  light wrapping past the terminator fold. It is a flat scalar lift, **not** a
  wavelength-tinted or distance-aware scatter model — those would be the
  "complete" version.
- `SHADOW_STEPS` in `shadow.wgsl` — step count / cost.
- Bias and `max_dist` heuristics in `terrain_sun_shadow`.

## Next steps (suggested order)

1. Soft penumbra (one-line change to the marcher).
2. Detail relief in the shadow caster for detail-heavy presets.
3. Performance: altitude-adaptive step budget.

## Related

- [specs/eclipse-shadows.md](specs/eclipse-shadows.md) — body-to-body eclipses (moon
  transits, planetary umbra/penumbra). Composes with terrain self-shadow as
  `body_eclipse × terrain_self`; also analytic, no shadow maps.
