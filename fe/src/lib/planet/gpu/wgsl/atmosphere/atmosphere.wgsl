#include "atmosphereParams.wgsl"
#include "integrate.wgsl"

fn atmosphere_fog(
  view_dir: vec3f,
  distance: f32,
  eye: vec3f,
  sun_dir: vec3f,
  atmo: AtmosphereParams,
) -> vec4f {
  let result = integrate_atmosphere(eye, view_dir, distance, sun_dir, atmo, no_eclipse());
  let fog_amount = 1.0 - result.a;
  return vec4f(result.rgb, clamp(fog_amount, 0.0, 0.95));
}
