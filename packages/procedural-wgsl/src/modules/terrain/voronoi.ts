import {
	FBM_WGSL,
	HASH_WGSL,
	KERNEL_HELPERS_WGSL,
	PLANET_TYPES_WGSL,
	VORONOI_WGSL
} from './wgslSnippets.js';

/** WGSL module `terrain.voronoi` — macro Voronoi relief cells. */
export const TERRAIN_VORONOI_SOURCE = `/*---
id: terrain.voronoi
entry: voronoi
category: Terrain
group: Domain
---*/
${HASH_WGSL}
${FBM_WGSL}
${VORONOI_WGSL}
${PLANET_TYPES_WGSL}
${KERNEL_HELPERS_WGSL}

fn voronoi(unit_dir: vec3f, distortion: f32, scale: ScaleContext, params: PlanetParams) -> vec3f {
  var vor = vec3f(0.5);
  if (should_eval_layer(10.0, scale, params.radius)) {
    vor = voronoi3(unit_dir * params.voronoi_scale + (distortion - 0.5) * params.voronoi_distortion_amplitude);
  }
  return vor;
}`;

export const TERRAIN_VORONOI_MODULE = {
	id: 'terrain.voronoi',
	source: TERRAIN_VORONOI_SOURCE
} as const;
