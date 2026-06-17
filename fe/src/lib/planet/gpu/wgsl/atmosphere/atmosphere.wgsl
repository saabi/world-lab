#include "skyRadiance.wgsl"

fn atmosphere_fog(
  view_dir: vec3f,
  altitude_meters: f32,
  fog_density: f32,
) -> vec4f {
  let horizon = pow(max(dot(view_dir, vec3f(0.0, 1.0, 0.0)), 0.0), 2.0);
  let fog_amount = 1.0 - exp(-fog_density * max(altitude_meters, 1.0) * 0.0001 * (1.0 + horizon * 4.0));
  let sky = sky_radiance(view_dir, altitude_meters);
  return vec4f(sky, clamp(fog_amount, 0.0, 0.85));
}
