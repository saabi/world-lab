fn sky_radiance(view_dir: vec3f, _altitude_meters: f32) -> vec3f {
  let horizon = pow(max(dot(view_dir, vec3f(0.0, 1.0, 0.0)), 0.0), 2.0);
  return mix(vec3f(0.4, 0.6, 0.9), vec3f(0.7, 0.8, 1.0), horizon);
}
