#include "material.wgsl"
#include "../atmosphere/skyRadiance.wgsl"

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

struct LightingResult {
  color: vec3f,
  direct_spec: vec3f,
  ibl_spec: vec3f,
}

fn fresnel_schlick(cos_theta: f32, f0: vec3f) -> vec3f {
  return f0 + (vec3f(1.0) - f0) * pow(clamp(1.0 - cos_theta, 0.0, 1.0), 5.0);
}

fn f0_from_ior(ior: f32) -> vec3f {
  let f0 = pow((ior - 1.0) / (ior + 1.0), 2.0);
  return vec3f(f0);
}

fn material_f0(material: SurfaceMaterial) -> vec3f {
  if (material.metallic > 0.5) {
    return material.albedo;
  }
  if (material.ior > 1.01) {
    return f0_from_ior(material.ior);
  }
  return vec3f(0.04);
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

fn burley_diffuse(roughness: f32, n_dot_v: f32, n_dot_l: f32, v_dot_h: f32) -> f32 {
  let f90 = 0.5 + 2.0 * v_dot_h * v_dot_h * roughness;
  let light_scatter = 1.0 + (f90 - 1.0) * pow(1.0 - n_dot_l, 5.0);
  let view_scatter = 1.0 + (f90 - 1.0) * pow(1.0 - n_dot_v, 5.0);
  return light_scatter * view_scatter / PI;
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

fn primary_sun_dir(lighting: LightingUniforms) -> vec3f {
  if (lighting.light_count > 0u && lighting.lights[0].position_or_dir.w < 0.5) {
    return normalize(lighting.lights[0].position_or_dir.xyz);
  }
  return vec3f(1.0, 0.0, 0.0);
}

/// 0 on the night hemisphere, 1 on the day hemisphere (smooth terminator).
fn sun_hemisphere(nrm: vec3f, sun_dir: vec3f) -> f32 {
  return clamp(max(dot(nrm, sun_dir), 0.0), 0.0, 1.0);
}

/// Lit factor for environment sampling — surface and reflection must face the sun.
fn environment_sun_lit(nrm: vec3f, refl: vec3f, sun_dir: vec3f) -> f32 {
  let surface_lit = sun_hemisphere(nrm, sun_dir);
  let refl_lit = clamp(max(dot(refl, sun_dir), 0.0), 0.0, 1.0);
  return surface_lit * refl_lit;
}

fn water_albedo_for_sun(material: SurfaceMaterial, sun_lit: f32) -> vec3f {
  let night = vec3f(0.008, 0.012, 0.025);
  return mix(night, material.albedo, pow(sun_lit, 0.55));
}

fn evaluate_ibl_spec(
  material: SurfaceMaterial,
  nrm: vec3f,
  view_dir: vec3f,
  altitude_meters: f32,
  sun_dir: vec3f,
) -> vec3f {
  let refl = reflect(-view_dir, nrm);
  let env_lit = environment_sun_lit(nrm, refl, sun_dir);
  let sky = sky_radiance(refl, altitude_meters);
  let night_sky = vec3f(0.002, 0.003, 0.01);
  let env = mix(night_sky, sky, pow(env_lit, 0.5));
  let n_dot_v = max(dot(nrm, view_dir), 0.0);
  let f0 = material_f0(material);
  let f = fresnel_schlick(n_dot_v, f0);
  var spec_strength = (1.0 - material.roughness) * (1.0 - material.metallic);
  if (material.biome_id == BIOME_WATER) {
    spec_strength *= pow(sun_hemisphere(nrm, sun_dir), 0.65);
  }
  return env * f * spec_strength;
}

fn tone_map_reinhard(color: vec3f, exposure: f32) -> vec3f {
  return vec3f(1.0) - exp(-color * max(exposure, 0.01));
}

fn evaluate_pbr(
  material: SurfaceMaterial,
  n: vec3f,
  v: vec3f,
  surface_pos: vec3f,
  lighting: LightingUniforms,
  altitude_meters: f32,
  overrides: MaterialOverrides,
) -> LightingResult {
  let nrm = normalize(n);
  let view_dir = normalize(v);
  let f0 = material_f0(material);
  let sun_dir = primary_sun_dir(lighting);
  let sun_lit = sun_hemisphere(nrm, sun_dir);

  let sky_up = sky_radiance(vec3f(0.0, 1.0, 0.0), altitude_meters);
  let day_amb = mix(lighting.ambient.xyz, sky_up * 0.35, 0.4);
  let night_amb = lighting.ambient.xyz * 0.15;
  let amb_power = select(0.4, 0.7, material.biome_id == BIOME_WATER);
  let amb = mix(night_amb, day_amb, pow(sun_lit, amb_power));
  var albedo = material.albedo;
  if (material.biome_id == BIOME_WATER) {
    albedo = water_albedo_for_sun(material, sun_lit);
  }
  var lo = albedo * amb;
  var direct_spec_acc = vec3f(0.0);

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
    let n_dot_v = max(dot(nrm, view_dir), 0.0);
    let h = normalize(view_dir + l);
    let v_dot_h = max(dot(view_dir, h), 0.0);

    let kd = (vec3f(1.0) - f0) * (1.0 - material.metallic);
    let f = fresnel_schlick(v_dot_h, f0);
    let diffuse = kd * albedo * burley_diffuse(material.roughness, n_dot_v, n_dot_l, v_dot_h) * (vec3f(1.0) - f);
    let spec = brdf_specular(nrm, view_dir, l, material.roughness, f0);
    let contrib = (diffuse + spec) * radiance * n_dot_l * atten;
    lo += contrib;
    direct_spec_acc += spec * radiance * n_dot_l * atten;
  }

  let ibl_spec = evaluate_ibl_spec(material, nrm, view_dir, altitude_meters, sun_dir);
  lo += ibl_spec;

  let mapped = tone_map_reinhard(lo, overrides.exposure);
  let mapped_direct_spec = tone_map_reinhard(direct_spec_acc, overrides.exposure);
  let mapped_ibl = tone_map_reinhard(ibl_spec, overrides.exposure);

  return LightingResult(mapped, mapped_direct_spec, mapped_ibl);
}
