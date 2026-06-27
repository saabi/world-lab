import {
	FBM_WGSL,
	HASH_WGSL,
	KERNEL_HELPERS_WGSL,
	PLANET_TYPES_WGSL,
	SAMPLE_PLANET_WGSL,
	VORONOI_WGSL
} from './wgslSnippets.js';

const NORMAL_BODY = `fn sphere_tangent_frame(unit_dir: vec3f) -> mat3x3f {
  var up = vec3f(0.0, 1.0, 0.0);
  if (abs(dot(unit_dir, up)) > 0.95) {
    up = vec3f(1.0, 0.0, 0.0);
  }
  let east = normalize(cross(up, unit_dir));
  let north = cross(unit_dir, east);
  return mat3x3f(east, north, unit_dir);
}

fn normalEstimator(
  unit_dir: vec3f,
  params: PlanetParams,
  scale: ScaleContext,
) -> vec3f {
  let radius = max(params.radius, 1.0);
  let angular_eps = clamp(scale.meters_per_pixel / radius, 1e-6, 0.06);
  if (angular_eps >= 0.055) {
    return normalize(unit_dir);
  }

  let frame = sphere_tangent_frame(unit_dir);
  let east = frame[0];
  let north = frame[1];

  let h0 = sample_planet(unit_dir, params, scale).world_radius_meters;
  let dir_e = normalize(unit_dir + east * angular_eps);
  let dir_n = normalize(unit_dir + north * angular_eps);
  let h_e = sample_planet(dir_e, params, scale).world_radius_meters;
  let h_n = sample_planet(dir_n, params, scale).world_radius_meters;

  let p0 = unit_dir * h0;
  let p_e = dir_e * h_e;
  let p_n = dir_n * h_n;

  let tangent_e = p_e - p0;
  let tangent_n = p_n - p0;
  return normalize(cross(tangent_e, tangent_n));
}`;

/** WGSL module `terrain.normalEstimator` — planet_surface_normal finite-difference. */
export const TERRAIN_NORMAL_ESTIMATOR_SOURCE = `/*---
id: terrain.normalEstimator
entry: normalEstimator
category: Terrain
group: Domain
---*/
${HASH_WGSL}
${FBM_WGSL}
${VORONOI_WGSL}
${PLANET_TYPES_WGSL}
${KERNEL_HELPERS_WGSL}
${SAMPLE_PLANET_WGSL}
${NORMAL_BODY}`;

export const TERRAIN_NORMAL_ESTIMATOR_MODULE = {
	id: 'terrain.normalEstimator',
	source: TERRAIN_NORMAL_ESTIMATOR_SOURCE
} as const;
