import { KERNEL_HELPERS_WGSL, PLANET_TYPES_WGSL } from './wgslSnippets.js';

/** WGSL module `terrain.polarTerm` — pseudo-latitude polar relief. */
export const TERRAIN_POLAR_TERM_SOURCE = `/*---
id: terrain.polarTerm
entry: polarTerm
category: Terrain
group: Domain
---*/
${PLANET_TYPES_WGSL}
${KERNEL_HELPERS_WGSL}

fn polarTerm(world_pos: vec3f, scale: ScaleContext, params: PlanetParams) -> f32 {
  let polar_amp = params.polar_amplitude * params.radius;
  var polar = 0.0;
  if (should_eval_layer(2.0, scale, params.radius)) {
    polar = ((abs(world_pos.y) / params.radius) - params.polar_scale) * polar_amp;
  }
  return polar;
}`;

export const TERRAIN_POLAR_TERM_MODULE = {
	id: 'terrain.polarTerm',
	source: TERRAIN_POLAR_TERM_SOURCE
} as const;
