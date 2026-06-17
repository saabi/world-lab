#include "types.wgsl"
#include "params.wgsl"
#include "kernel.wgsl"
#include "../noise/fbm.wgsl"

const ROCK: vec3f = vec3f(0.50, 0.35, 0.15);
const TREE: vec3f = vec3f(0.05, 1.15, 0.10);
const SAND: vec3f = vec3f(1.00, 1.00, 0.85);
const ICE: vec3f = vec3f(0.85, 1.00, 1.20);
const SHALLOW_WATER: vec3f = vec3f(0.4, 1.0, 1.9);
const DEEP_WATER: vec3f = vec3f(0.0, 0.1, 0.7);

struct SurfaceMaterial {
  albedo: vec3f,
  roughness: f32,
  metallic: f32,
}

fn surface_material(sample: PlanetSample, params: PlanetParams, scale: ScaleContext) -> SurfaceMaterial {
  var spots = sample.vor.x * (1.0 - params.voronoi_albedo) + params.voronoi_albedo;
  spots *= sample.vor.y * (1.0 - params.voronoi_albedo_y) + params.voronoi_albedo_y;
  spots *= sample.vor.z * (1.0 - params.voronoi_albedo_z) + params.voronoi_albedo_z;
  spots *= sample.distortion * (1.0 - params.voronoi_distortion_albedo) + params.voronoi_distortion_albedo;
  spots *= sample.detail * (1.0 - params.detail_albedo) + params.detail_albedo;

  var col = ROCK * vec3f(spots);
  var roughness = 0.9;
  var metallic = 0.0;
  let total_amplitude = params.voronoi_amplitude + params.detail_amplitude;

  var tn = 0.0;
  if (should_eval_layer(5.0, scale) && params.texture_noise_scale > 0.0) {
    tn = (fbm_4(sample.world_pos * sqrt(params.texture_noise_scale)) - 0.5) * params.texture_noise_amplitude;
  }
  var polar = 0.0;
  if (should_eval_layer(200.0, scale)) {
    polar = ((abs(sample.world_pos.y) / params.radius) - params.polar_scale) * params.polar_amplitude;
  }
  let h = sample.height_meters + tn + polar;
  let tl = h / total_amplitude;
  let wl = total_amplitude * (params.water_level - 0.5);

  if (tl < pow(params.vegetation_level, 2.0)) {
    col = TREE * vec3f(spots);
    roughness = 0.75;
  }
  if (tl < pow(params.sand_cutoff, 2.0)) {
    col = SAND * vec3f(spots);
    roughness = 0.55;
  }
  if (params.render_water > 0.5 && sample.height_meters <= wl) {
    let depth = sqrt(spots);
    col = mix(SHALLOW_WATER, DEEP_WATER, depth);
    roughness = 0.05;
  }
  if (tl > pow(params.snow_cover, 2.0)) {
    col = ICE + vec3f(tl);
    roughness = 0.35;
    if (params.render_water > 0.5 && sample.height_meters > wl) {
      col *= vec3f(spots);
    }
  }
  return SurfaceMaterial(col, roughness, metallic);
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
