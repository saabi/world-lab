import { KERNEL_HELPERS_WGSL } from './wgslSnippets.js';

/** WGSL module `terrain.worldNormal` — rotate body normal to world space via planet quaternion. */
export const TERRAIN_WORLD_NORMAL_SOURCE = `/*---
id: terrain.worldNormal
entry: worldNormal
category: Terrain
group: Domain
---*/
${KERNEL_HELPERS_WGSL}

fn worldNormal(body_normal: vec3f, planet_rot: vec4f) -> vec3f {
  return normalize(rotate_vector_by_quat(planet_rot, body_normal));
}`;

export const TERRAIN_WORLD_NORMAL_MODULE = {
	id: 'terrain.worldNormal',
	source: TERRAIN_WORLD_NORMAL_SOURCE
} as const;
