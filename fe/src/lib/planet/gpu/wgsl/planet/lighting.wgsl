#include "material.wgsl"

const MAX_LIGHTS: u32 = 4u;
const PI: f32 = 3.141592653589793;

struct GpuLight {
  position_or_dir: vec4f,
  color: vec4f,
  params: vec4f,
}

struct LightingUniforms {
  ambient: vec4f,
  light_count: u32,
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
  lights: array<GpuLight, MAX_LIGHTS>,
}

fn fresnel_schlick(cos_theta: f32, f0: vec3f) -> vec3f {
  return f0 + (vec3f(1.0) - f0) * pow(clamp(1.0 - cos_theta, 0.0, 1.0), 5.0);
}

fn distribution_ggx(n_dot_h: f32, roughness: f32) -> f32 {
  let a = roughness * roughness;
  let a2 = a * a;
  let denom = n_dot_h * n_dot_h * (a2 - 1.0) + 1.0;
  return a2 / max(PI * denom * denom, 1e-7);
}

fn geometry_schlick_ggx(n_dot_x: f32, roughness: f32) -> f32 {
  let r = roughness + 1.0;
  let k = (r * r) / 8.0;
  return n_dot_x / max(n_dot_x * (1.0 - k) + k, 1e-4);
}

fn geometry_smith(n_dot_v: f32, n_dot_l: f32, roughness: f32) -> f32 {
  return geometry_schlick_ggx(n_dot_v, roughness) * geometry_schlick_ggx(n_dot_l, roughness);
}

fn brdf_specular(
  n: vec3f,
  v: vec3f,
  l: vec3f,
  roughness: f32,
  f0: vec3f,
) -> vec3f {
  let h = normalize(v + l);
  let n_dot_v = max(dot(n, v), 0.0);
  let n_dot_l = max(dot(n, l), 0.0);
  let n_dot_h = max(dot(n, h), 0.0);
  let v_dot_h = max(dot(v, h), 0.0);

  let d = distribution_ggx(n_dot_h, roughness);
  let g = geometry_smith(n_dot_v, n_dot_l, roughness);
  let f = fresnel_schlick(v_dot_h, f0);

  let numerator = d * g * f;
  let denominator = 4.0 * n_dot_v * n_dot_l + 1e-4;
  return numerator / denominator;
}

fn attenuate_point(light_pos: vec3f, surface_pos: vec3f, range: f32) -> f32 {
  let dist = length(light_pos - surface_pos);
  let range_clamped = max(range, 1.0);
  let atten = 1.0 / (dist * dist + 1.0);
  let range_factor = clamp(1.0 - pow(dist / range_clamped, 4.0), 0.0, 1.0);
  return atten * range_factor * range_factor;
}

fn evaluate_pbr(
  material: SurfaceMaterial,
  n: vec3f,
  v: vec3f,
  surface_pos: vec3f,
  lighting: LightingUniforms,
) -> vec3f {
  let nrm = normalize(n);
  let view_dir = normalize(v);
  let f0 = mix(vec3f(0.04), material.albedo, material.metallic);

  var lo = material.albedo * lighting.ambient.xyz;

  for (var i = 0u; i < lighting.light_count; i++) {
    let light = lighting.lights[i];
    let intensity = light.color.w;
    let radiance = light.color.xyz * intensity;

    var l = vec3f(0.0);
    var atten = 1.0;
    if (light.position_or_dir.w < 0.5) {
      l = normalize(light.position_or_dir.xyz);
    } else {
      let light_pos = light.position_or_dir.xyz;
      l = normalize(light_pos - surface_pos);
      atten = attenuate_point(light_pos, surface_pos, light.params.x);
    }

    let n_dot_l = max(dot(nrm, l), 0.0);
    let diffuse = (1.0 - material.metallic) * material.albedo / PI;
    let spec = brdf_specular(nrm, view_dir, l, material.roughness, f0);
    lo += (diffuse + spec) * radiance * n_dot_l * atten;
  }

  return lo;
}
