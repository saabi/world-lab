#include "types.wgsl"
#include "params.wgsl"
#include "kernel.wgsl"

fn sphere_tangent_frame(unit_dir: vec3f) -> mat3x3f {
  var up = vec3f(0.0, 1.0, 0.0);
  if (abs(dot(unit_dir, up)) > 0.95) {
    up = vec3f(1.0, 0.0, 0.0);
  }
  let east = normalize(cross(up, unit_dir));
  let north = cross(unit_dir, east);
  return mat3x3f(east, north, unit_dir);
}

fn planet_surface_normal(
  unit_dir: vec3f,
  params: PlanetParams,
  scale: ScaleContext,
) -> vec3f {
  let radius = max(params.radius, 1.0);
  let angular_eps = clamp(scale.meters_per_pixel / radius, 1e-6, 0.06);
  // Sphere fallback only at very coarse orbit LOD.
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
}
