# Ocean Rendering Research Notes

## Why the Current Water Looks Too Crystalline

The current separated water pass is closer to a transparent glossy shell than an ocean
medium. It has Fresnel, depth tinting, sun glint, and procedural normal perturbation, but
it still blends a water color over the terrain rather than optically filtering the lit
scene through water.

Real-time ocean rendering usually combines:

- A water surface BRDF/BSDF: Fresnel reflection, rough specular glint, wave-slope normals.
- A volume model: absorption and scattering through the water column.
- A background read: lit scene color/depth behind the water, refracted/distorted and
  attenuated through the water medium.
- Multi-scale waves: low-frequency swells plus high-frequency ripple normals.
- Shore effects: foam, turbidity, and shallow-water color driven by terrain/water
  intersection.

## Relevant References

### Unreal Single Layer Water

Unreal's Single Layer Water model is the closest match to this renderer's architecture.
It renders water after the opaque/lit scene and uses the already rendered scene color and
depth to produce physically based water translucency/refraction. The model exposes
scattering coefficients, absorption coefficients, phase anisotropy, and color scale behind
water.

Important takeaways:

- Water should be treated as a participating medium, not just transparent blue material.
- Scene color and scene depth are core inputs.
- Opacity mixes between the surface BRDF and volume BSDF contribution.
- Refraction/tinting is produced by sampling what was already rendered behind water.

Source: <https://dev.epicgames.com/documentation/en-us/unreal-engine/single-layer-water-shading-model-in-unreal-engine>

### GPU Gems: Effective Water Simulation From Physical Models

GPU Gems recommends combining coarser geometric waves with finer pixel/normal waves. For
our current shell approach, the most useful point is that fine wave normals dominate
perceived water realism even when geometry displacement is modest.

Important takeaways:

- Use multiple directional waves with independent phase/speed.
- Compute surface orientation from wave derivatives where possible.
- Add finer-scale moving normal detail; do not rely on one smooth sine field.

Source: <https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-1-effective-water-simulation-physical-models>

### Tessendorf Ocean Notes

Tessendorf's work is the classic reference for wind-driven deep-ocean spectra and FFT
ocean surfaces. A full spectral implementation is more than we need immediately, but it
sets the long-term direction for wind-dependent wave energy, slope distributions, and
deep-water motion.

Source: <https://people.computing.clemson.edu/~jtessen/reports/papers_files/coursenotes2004.pdf>

### Ocean Rendering Survey

The Darles et al. survey frames the split between parametric/spectral deep-water methods
and more physical shallow/breaking-wave methods. This supports an incremental strategy:
use cheap spectral/parametric waves for orbit and open water, then add shore foam/turbidity
from terrain intersection rather than trying to solve full shallow-water dynamics.

Source: <https://arxiv.org/abs/1109.6494>

## Recommended Implementation Direction

### 1. Scene-Color Transmission

First priority: sample the pre-water lit scene color and apply depth-dependent absorption
and scattering before compositing. This should reduce the glass-shell look because terrain
under water is optically filtered instead of merely covered by translucent blue.

Required render-pipeline change:

- Render opaque scene into an offscreen scene-color texture.
- Render water into the final target or post-water texture.
- Bind the pre-water scene color and depth as sampled textures in the water shader.
- Do not sample a texture while it is also the active color/depth attachment.

### 2. RGB Absorption and Scattering

Replace the single artistic absorption scalar with coefficient-style controls:

- absorption RGB or preset coefficients, with a global multiplier.
- scattering RGB or preset coefficients, with a global multiplier.
- optional phase anisotropy for forward/back scattering.

The first implementation can use fixed RGB coefficients plus the existing absorption
slider as a multiplier.

### 3. Multi-Scale Wave Normals

Improve the current wave normal from a few smooth sines to a multi-scale slope field:

- low-frequency swells for broad highlights.
- high-frequency ripples for glint breakup.
- sharper crests using shaped sine or derivative-friendly wave functions.
- body-local coordinates so waves rotate with the planet.

### 4. Sky/Atmosphere Reflection Approximation

From orbit, ocean color is strongly influenced by reflected sky/atmosphere at grazing
angles. Add a cheap environment term:

- Fresnel mixes toward atmosphere/sky color at grazing angles.
- night/space-facing reflection is darker.
- sun glint rides on perturbed wave normals.

### 5. Shore Foam and Turbidity

Shore foam should be driven by a stable shore factor:

- water thickness or terrain-distance metric.
- smooth shallow-water threshold.
- foam mask synchronized with the wave phase.
- noise-modulated patches rather than a uniform coastline ring.

This should come after scene-color transmission and shore-factor debug views are reliable.

## Current Next Slice

Implement scene-color transmission:

- Add pre-water scene-color sampling to the water pass.
- Use depth gap to estimate water path length.
- Apply Beer-Lambert-style RGB attenuation to the sampled terrain color.
- Add a simple scattering term and Fresnel/specular on top.
- Keep existing water debug modes working.

## Implemented Follow-Up

The next shader pass adds synchronized shore foam and water diagnostics:

- Wave normals, crest strength, and foam use the same body-local wave phase.
- `Water Foam` scales the animated foam contribution.
- `Shore Width` controls how far the shallow-water/shore factor spreads from the terrain
  intersection.
- Water thickness now reconstructs the opaque scene point from depth with
  `inverse(viewProjection)` and measures the eye-relative distance from the water shell to
  that point. The depth buffer still handles occlusion, but absorption/shore/foam tuning no
  longer depends directly on hyperbolic clip-depth deltas.
- Material debug views now include:
  - `Water thickness`
  - `Water shore factor`
  - `Water wave normals`
  - `Water foam mask`

This is still a heuristic shore factor because it maps water-column distance to a shore
mask with artistic thresholds. The longer-term version can replace that threshold mapping
with a terrain-authored shoreline/coastal-energy metric, but the current metric is now
linear and camera-scale stable enough for shader tuning.

## Incremental slices

See [_docs/specs/ocean-water-slice-plan.md](specs/ocean-water-slice-plan.md).

**Slice A (RGB extinction + in-scatter):** `transmittance = exp(-ABSORPTION_RGB * column *
absorptionStrength)` filters scene color; `(1 - transmittance) * SCATTER_RGB *
scatterStrength` adds volume scatter. **Water Scatter** slider in Render → Shading.

**Slice B (refraction UV):** scene color is sampled at a wave-normal-offset UV
(shallow water refracts more). **Water Refraction** slider in Render → Shading.

**Slice C (sky reflection):** Fresnel-weighted analytic sky/atmosphere color at grazing
angles; `skyTint` from the focused body's atmosphere design. **Water Sky Reflect** slider.

**Slice D (shore turbidity):** shallow shore band tints transmitted color toward
sediment/murk. **Water Turbidity** slider in Render → Shading.
