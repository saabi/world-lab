import {
	FBM_WGSL,
	HASH_WGSL,
	KERNEL_HELPERS_WGSL,
	PLANET_TYPES_WGSL
} from './wgslSnippets.js';

/** WGSL module `terrain.fineTextureNoise` — fragment fine texture relief. */
export const TERRAIN_FINE_TEXTURE_NOISE_SOURCE = `/*---
id: terrain.fineTextureNoise
entry: fineTextureNoise
category: Terrain
group: Domain
---*/
${HASH_WGSL}
${FBM_WGSL}
${PLANET_TYPES_WGSL}
${KERNEL_HELPERS_WGSL}

fn fineTextureNoise(unit_dir: vec3f, scale: ScaleContext, params: PlanetParams) -> f32 {
  let tex_amp = params.texture_noise_amplitude * params.radius;
  var tn = 0.0;
  if (should_eval_layer(0.05, scale, params.radius) && params.texture_noise_scale > 0.0) {
    tn = (fbm_4(unit_dir * 100.0 * sqrt(params.texture_noise_scale)) - 0.5) * tex_amp;
  }
  return tn;
}`;

export const TERRAIN_FINE_TEXTURE_NOISE_MODULE = {
	id: 'terrain.fineTextureNoise',
	source: TERRAIN_FINE_TEXTURE_NOISE_SOURCE
} as const;
