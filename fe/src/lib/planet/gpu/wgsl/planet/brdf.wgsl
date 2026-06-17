// Cook-Torrance microfacet BRDF (GGX / Trowbridge-Reitz) + split-sum IBL helpers.
// References: Walter et al. 2007, Burley 2012 (Disney), Karis 2013 (UE4 mobile).

const PI: f32 = 3.141592653589793;

fn fresnel_schlick(cos_theta: f32, f0: vec3f) -> vec3f {
  return f0 + (vec3f(1.0) - f0) * pow(clamp(1.0 - cos_theta, 0.0, 1.0), 5.0);
}

fn fresnel_schlick_roughness(cos_theta: f32, f0: vec3f, roughness: f32) -> vec3f {
  let max_r = max(vec3f(1.0 - roughness), f0);
  return f0 + (max_r - f0) * pow(clamp(1.0 - cos_theta, 0.0, 1.0), 5.0);
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

/// Smith GGX geometry for direct lighting (k = (r+1)²/8).
fn geometry_schlick_ggx_direct(n_dot_x: f32, roughness: f32) -> f32 {
  let r = roughness + 1.0;
  let k = (r * r) / 8.0;
  return n_dot_x / max(n_dot_x * (1.0 - k) + k, 1e-4);
}

fn geometry_smith_direct(n_dot_v: f32, n_dot_l: f32, roughness: f32) -> f32 {
  return geometry_schlick_ggx_direct(n_dot_v, roughness) * geometry_schlick_ggx_direct(n_dot_l, roughness);
}

fn burley_diffuse(roughness: f32, n_dot_v: f32, n_dot_l: f32, v_dot_h: f32) -> f32 {
  let f90 = 0.5 + 2.0 * v_dot_h * v_dot_h * roughness;
  let light_scatter = 1.0 + (f90 - 1.0) * pow(1.0 - n_dot_l, 5.0);
  let view_scatter = 1.0 + (f90 - 1.0) * pow(1.0 - n_dot_v, 5.0);
  return light_scatter * view_scatter / PI;
}

fn brdf_specular_direct(
  n_dot_v: f32,
  n_dot_l: f32,
  n_dot_h: f32,
  v_dot_h: f32,
  roughness: f32,
  f0: vec3f,
) -> vec3f {
  let d = distribution_ggx(n_dot_h, roughness);
  let g = geometry_smith_direct(n_dot_v, n_dot_l, roughness);
  let f = fresnel_schlick(v_dot_h, f0);
  let denom = 4.0 * n_dot_v * n_dot_l + 1e-4;
  return (d * g * f) / denom;
}

/// Epic split-sum BRDF LUT approximation (Lazarov / UE4 notes).
fn env_brdf_approx(n_dot_v: f32, roughness: f32) -> vec2f {
  let c0 = vec4f(-1.0, -0.0275, -0.572, 0.022);
  let c1 = vec4f(1.0, 0.0425, 1.04, -0.04);
  let r = roughness * c0 + c1;
  let a004 = min(r.x * r.x, exp2(-9.28 * n_dot_v)) * r.x + r.y;
  return vec2f(-1.04, 1.04) * a004 + vec2f(r.z, r.w);
}
