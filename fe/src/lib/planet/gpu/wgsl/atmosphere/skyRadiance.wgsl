#include "atmosphereParams.wgsl"
#include "integrate.wgsl"

fn sky_radiance(
  view_dir: vec3f,
  eye: vec3f,
  atmo: AtmosphereParams,
  sun_dir: vec3f,
) -> vec3f {
  let hit = ray_sphere_intersect(eye, view_dir, atmo.planet_center, atmo.outer_radius);
  let t_exit = select(hit.y, 1e5, hit.y < 0.0);
  return integrate_atmosphere(eye, view_dir, t_exit, sun_dir, atmo, no_eclipse()).rgb;
}
