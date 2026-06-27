import {
	FBM_WGSL,
	HASH_WGSL,
	KERNEL_HELPERS_WGSL,
	MATERIAL_TYPES_WGSL,
	PLANET_TYPES_WGSL
} from './wgslSnippets.js';

const BIOME_MATERIAL_BODY = `const ROCK: vec3f = vec3f(0.50, 0.35, 0.15);
const TREE: vec3f = vec3f(0.05, 1.15, 0.10);
const SAND: vec3f = vec3f(1.00, 1.00, 0.85);
const ICE: vec3f = vec3f(0.85, 1.00, 1.20);

const BIOME_ROCK: u32 = 0u;
const BIOME_VEGETATION: u32 = 1u;
const BIOME_SAND: u32 = 2u;
const BIOME_WATER: u32 = 3u;
const BIOME_ICE: u32 = 4u;

fn biome_props(biome_id: u32) -> BiomeProps {
  switch (biome_id) {
    case BIOME_VEGETATION: { return BiomeProps(0.8, 0.0, 1.0); }
    case BIOME_SAND: { return BiomeProps(0.6, 0.0, 1.0); }
    case BIOME_WATER: { return BiomeProps(0.06, 0.0, 1.33); }
    case BIOME_ICE: { return BiomeProps(0.3, 0.0, 1.31); }
    default: { return BiomeProps(0.9, 0.0, 1.0); }
  }
}

fn biomeMaterial(sample: PlanetSample, params: PlanetParams, scale: ScaleContext) -> SurfaceMaterial {
  var spots = sample.vor.x * (1.0 - params.voronoi_albedo) + params.voronoi_albedo;
  spots *= sample.vor.y * (1.0 - params.voronoi_albedo_y) + params.voronoi_albedo_y;
  spots *= sample.vor.z * (1.0 - params.voronoi_albedo_z) + params.voronoi_albedo_z;
  spots *= sample.distortion * (1.0 - params.voronoi_distortion_albedo) + params.voronoi_distortion_albedo;
  spots *= sample.detail * (1.0 - params.detail_albedo) + params.detail_albedo;

  var col = ROCK * vec3f(spots);
  var biome_id = BIOME_ROCK;
  let tex_amp = params.texture_noise_amplitude * params.radius;
  let polar_amp = params.polar_amplitude * params.radius;
  let total_amplitude = (params.voronoi_amplitude + params.detail_amplitude) * params.radius;

  var tn = 0.0;
  if (should_eval_layer(0.05, scale, params.radius) && params.texture_noise_scale > 0.0) {
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
  if (tl > pow(params.snow_cover, 2.0)) {
    col = ICE + vec3f(tl);
    biome_id = BIOME_ICE;
    col *= vec3f(spots);
  }

  let props = biome_props(biome_id);
  var roughness = props.roughness;
  if (should_eval_layer(0.05, scale, params.radius)) {
    let micro = (sample.detail - 0.5) * 0.25 + (tn / max(tex_amp, 0.001)) * 0.1;
    roughness = clamp(roughness + micro, 0.02, 1.0);
  }

  return SurfaceMaterial(col, roughness, props.metallic, props.ior, biome_id);
}`;

/** WGSL module `terrain.biomeMaterial` — surface_material from planet material.wgsl. */
export const TERRAIN_BIOME_MATERIAL_SOURCE = `/*---
id: terrain.biomeMaterial
entry: biomeMaterial
category: Material
group: Domain
---*/
${HASH_WGSL}
${FBM_WGSL}
${PLANET_TYPES_WGSL}
${MATERIAL_TYPES_WGSL}
${KERNEL_HELPERS_WGSL}
${BIOME_MATERIAL_BODY}`;

export const TERRAIN_BIOME_MATERIAL_MODULE = {
	id: 'terrain.biomeMaterial',
	source: TERRAIN_BIOME_MATERIAL_SOURCE
} as const;
