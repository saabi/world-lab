#include "types.wgsl"
#include "params.wgsl"
#include "kernel.wgsl"
#include "../noise/fbm.wgsl"

const ROCK: vec3f = vec3f(0.50, 0.35, 0.15);
const TREE: vec3f = vec3f(0.05, 1.15, 0.10);
const SAND: vec3f = vec3f(1.00, 1.00, 0.85);
const ICE: vec3f = vec3f(0.85, 1.00, 1.20);
const SHALLOW_WATER: vec3f = vec3f(0.12, 0.35, 0.55);
const DEEP_WATER: vec3f = vec3f(0.01, 0.04, 0.12);

const BIOME_ROCK: u32 = 0u;
const BIOME_VEGETATION: u32 = 1u;
const BIOME_SAND: u32 = 2u;
const BIOME_WATER: u32 = 3u;
const BIOME_ICE: u32 = 4u;

struct BiomeProps {
  roughness: f32,
  metallic: f32,
  ior: f32,
}

struct SurfaceMaterial {
  albedo: vec3f,
  roughness: f32,
  metallic: f32,
  ior: f32,
  biome_id: u32,
}

struct MaterialOverrides {
  exposure: f32,
  roughness_mult: f32,
  water_gloss: f32,
  material_debug: f32,
  fog_density: f32,
  shadows_enabled: f32,
  shadow_fill: f32,
  _pad2: f32,
}

fn biome_props(biome_id: u32) -> BiomeProps {
  switch (biome_id) {
    case BIOME_VEGETATION: { return BiomeProps(0.8, 0.0, 1.0); }
    case BIOME_SAND: { return BiomeProps(0.6, 0.0, 1.0); }
    case BIOME_WATER: { return BiomeProps(0.06, 0.0, 1.33); }
    case BIOME_ICE: { return BiomeProps(0.3, 0.0, 1.31); }
    default: { return BiomeProps(0.9, 0.0, 1.0); }
  }
}

fn apply_material_overrides(material: SurfaceMaterial, overrides: MaterialOverrides) -> SurfaceMaterial {
  var out = material;
  var rough = material.roughness * overrides.roughness_mult;
  if (material.biome_id == BIOME_WATER) {
    rough /= max(overrides.water_gloss, 0.1);
  }
  out.roughness = clamp(rough, 0.02, 1.0);
  return out;
}

fn surface_material(sample: PlanetSample, params: PlanetParams, scale: ScaleContext) -> SurfaceMaterial {
  var spots = sample.vor.x * (1.0 - params.voronoi_albedo) + params.voronoi_albedo;
  spots *= sample.vor.y * (1.0 - params.voronoi_albedo_y) + params.voronoi_albedo_y;
  spots *= sample.vor.z * (1.0 - params.voronoi_albedo_z) + params.voronoi_albedo_z;
  spots *= sample.distortion * (1.0 - params.voronoi_distortion_albedo) + params.voronoi_distortion_albedo;
  spots *= sample.detail * (1.0 - params.detail_albedo) + params.detail_albedo;

  var col = ROCK * vec3f(spots);
  var biome_id = BIOME_ROCK;
  // Relief amplitudes are ratios of radius (scale-independent); convert to metres.
  let tex_amp = params.texture_noise_amplitude * params.radius;
  let polar_amp = params.polar_amplitude * params.radius;
  let total_amplitude = (params.voronoi_amplitude + params.detail_amplitude) * params.radius;

  var tn = 0.0;
  if (should_eval_layer(0.05, scale, params.radius) && params.texture_noise_scale > 0.0) {
    // Sample the unit direction at a reference radius (the presets' 100 m) instead of
    // world_pos (= unit_dir·radius), so the fine texture is scale-invariant like the
    // macro relief — else at world scale it's radius/100 ≈ thousands× too fine.
    tn = (fbm_4(sample.unit_dir * 100.0 * sqrt(params.texture_noise_scale)) - 0.5) * tex_amp;
  }
  var polar = 0.0;
  if (should_eval_layer(2.0, scale, params.radius)) {
    polar = ((abs(sample.world_pos.y) / params.radius) - params.polar_scale) * polar_amp;
  }
  let h = sample.height_meters + tn + polar;
  let tl = h / total_amplitude;
  let wl = total_amplitude * (params.water_level - 0.5);

  if (tl < pow(params.vegetation_level, 2.0)) {
    col = TREE * vec3f(spots);
    biome_id = BIOME_VEGETATION;
  }
  if (tl < pow(params.sand_cutoff, 2.0)) {
    col = SAND * vec3f(spots);
    biome_id = BIOME_SAND;
  }
  if (params.render_water > 0.5 && sample.height_meters <= wl) {
    let depth = sqrt(spots);
    col = mix(SHALLOW_WATER, DEEP_WATER, depth);
    biome_id = BIOME_WATER;
  }
  if (tl > pow(params.snow_cover, 2.0)) {
    col = ICE + vec3f(tl);
    biome_id = BIOME_ICE;
    if (params.render_water > 0.5 && sample.height_meters > wl) {
      col *= vec3f(spots);
    }
  }

  let props = biome_props(biome_id);
  var roughness = props.roughness;
  if (should_eval_layer(0.05, scale, params.radius)) {
    let micro = (sample.detail - 0.5) * 0.25 + (tn / max(tex_amp, 0.001)) * 0.1;
    roughness = clamp(roughness + micro, 0.02, 1.0);
  }

  return SurfaceMaterial(col, roughness, props.metallic, props.ior, biome_id);
}

fn shade_planet(sample: PlanetSample, params: PlanetParams, scale: ScaleContext) -> vec3f {
  return surface_material(sample, params, scale).albedo;
}

fn face_debug_color(face: u32) -> vec3f {
  let colors = array<vec3f, 6>(
    vec3f(1.0, 0.3, 0.3),
    vec3f(0.3, 1.0, 0.3),
    vec3f(0.3, 0.3, 1.0),
    vec3f(1.0, 1.0, 0.3),
    vec3f(1.0, 0.3, 1.0),
    vec3f(0.3, 1.0, 1.0)
  );
  return colors[min(face, 5u)];
}

fn ring_debug_color(ring: u32) -> vec3f {
  let hue = f32(ring) * 0.13;
  return vec3f(fract(hue), fract(hue + 0.33), fract(hue + 0.66));
}
