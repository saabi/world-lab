import {
	FBM_WGSL,
	HASH_WGSL,
	KERNEL_HELPERS_WGSL,
	PLANET_TYPES_WGSL
} from './wgslSnippets.js';

/** WGSL module `terrain.domainWarp` — macro coord domain warp (planet kernel). */
export const TERRAIN_DOMAIN_WARP_SOURCE = `/*---
id: terrain.domainWarp
entry: domainWarp
category: Terrain
group: Domain
---*/
${HASH_WGSL}
${FBM_WGSL}
${PLANET_TYPES_WGSL}
${KERNEL_HELPERS_WGSL}

fn domainWarp(unit_dir: vec3f, scale: ScaleContext, params: PlanetParams) -> f32 {
  var distortion = 0.0;
  if (should_eval_layer(5.0, scale, params.radius) && params.voronoi_distortion_scale > 0.0) {
    distortion = fbm_4(unit_dir * params.voronoi_distortion_scale);
  }
  return distortion;
}`;

export const TERRAIN_DOMAIN_WARP_MODULE = {
	id: 'terrain.domainWarp',
	source: TERRAIN_DOMAIN_WARP_SOURCE
} as const;
