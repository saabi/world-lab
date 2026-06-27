import {
	FBM_WGSL,
	HASH_WGSL,
	KERNEL_HELPERS_WGSL,
	PLANET_TYPES_WGSL
} from './wgslSnippets.js';

/** WGSL module `terrain.detailFbm` — fine relief FBM layer. */
export const TERRAIN_DETAIL_FBM_SOURCE = `/*---
id: terrain.detailFbm
entry: detailFbm
category: Terrain
group: Domain
---*/
${HASH_WGSL}
${FBM_WGSL}
${PLANET_TYPES_WGSL}
${KERNEL_HELPERS_WGSL}

fn detailFbm(unit_dir: vec3f, scale: ScaleContext, params: PlanetParams) -> f32 {
  var detail = 0.5;
  if (should_eval_layer(0.5, scale, params.radius) && params.detail_scale > 0.0) {
    detail = fbm_4(unit_dir * params.detail_scale);
  }
  return detail;
}`;

export const TERRAIN_DETAIL_FBM_MODULE = {
	id: 'terrain.detailFbm',
	source: TERRAIN_DETAIL_FBM_SOURCE
} as const;
