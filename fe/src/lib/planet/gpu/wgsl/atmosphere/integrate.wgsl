#include "atmosphereParams.wgsl"
#include "raySphere.wgsl"
#include "density.wgsl"
#include "phase.wgsl"
#include "../planet/eclipse.wgsl"

const SUN_STEPS: u32 = 4u;

// Strengths arrive pre-normalized by R_ref/radius from toGpuAtmosphereParams (the scale
// contract lives on the CPU now), so β applies no radius factor of its own. A previous
// `radius/100` factor here scaled β *up* with radius — the wrong direction — compounding
// with the radius-growing path into ~radius² optical depth (the world-scale overexposure).
fn rayleigh_beta(atmo: AtmosphereParams) -> vec3f {
  return vec3f(0.0058, 0.0135, 0.0331) * atmo.rayleigh_strength;
}

fn mie_beta(atmo: AtmosphereParams) -> vec3f {
  return vec3f(atmo.mie_strength * 0.004);
}

fn sun_transmittance(
  pos: vec3f,
  sun_dir: vec3f,
  atmo: AtmosphereParams,
  sigma_t: vec3f,
) -> vec3f {
  let shell_h = atmo.outer_radius - atmo.planet_radius;
  let max_dist = shell_h * 2.0 + atmo.scale_height * 4.0;
  let dt = max_dist / f32(SUN_STEPS);
  var transmittance = vec3f(1.0);
  for (var i = 0u; i < SUN_STEPS; i++) {
    let sample_pos = pos + sun_dir * ((f32(i) + 0.5) * dt);
    let h = altitude_at(sample_pos, atmo.planet_center, atmo.planet_radius);
    if (h < 0.0) {
      return vec3f(0.0);
    }
    if (h > shell_h) {
      break;
    }
    let rho = atmosphere_density(h, atmo);
    transmittance *= exp(-rho * sigma_t * dt);
  }
  return transmittance;
}

/// Integrate single-scattering along a ray. Returns rgb=inscatter, a=avg transmittance.
fn integrate_atmosphere(
  eye: vec3f,
  omega: vec3f,
  t_max: f32,
  sun_dir: vec3f,
  atmo: AtmosphereParams,
  eclipse: EclipseUniforms,
) -> vec4f {
  // March only the segment of the ray that lies inside the atmosphere shell,
  // clamped to the occluder distance (terrain) in `t_max`. The step size then
  // depends on the shell-crossing length, not the camera distance — so a fixed
  // step budget keeps the same sampling quality near the surface and from far
  // orbit. Marching from the eye instead wastes nearly every step in the vacuum
  // before the shell once the camera leaves the atmosphere, and the thin shell
  // gets under one sample.
  let shell = ray_sphere_intersect(eye, omega, atmo.planet_center, atmo.outer_radius);
  let t_start = max(shell.x, 0.0);
  let t_end = min(shell.y, max(t_max, 0.0));
  if (shell.y <= 0.0 || t_end <= t_start) {
    return vec4f(0.0, 0.0, 0.0, 1.0); // ray misses the atmosphere: no inscatter, full transmittance
  }

  let step_count = u32(clamp(atmo.integrate_steps, 4.0, 64.0));
  let dt = (t_end - t_start) / f32(step_count);
  let beta_r = rayleigh_beta(atmo);
  let beta_m = mie_beta(atmo);
  let sigma_t = beta_r + beta_m;
  let shell_h = atmo.outer_radius - atmo.planet_radius;

  // Phase depends only on the (constant) view/sun angle — hoist out of the loop.
  let cos_theta = dot(omega, sun_dir);
  let phase = beta_r * rayleigh_phase(cos_theta) + beta_m * mie_phase(cos_theta, atmo.mie_g);

  var transmittance = vec3f(1.0);
  var inscatter = vec3f(0.0);

  for (var i = 0u; i < step_count; i++) {
    let t = t_start + (f32(i) + 0.5) * dt;
    let pos = eye + omega * t;
    let h = altitude_at(pos, atmo.planet_center, atmo.planet_radius);
    if (h < 0.0 || h > shell_h) {
      continue;
    }
    let rho = atmosphere_density(h, atmo);
    let ext = rho * sigma_t;
    let sample_trans = exp(-ext * dt);
    let sun_trans = sun_transmittance(pos, sun_dir, atmo, sigma_t);
    // Body-to-body eclipse, sampled per step: the fraction of the sun's disk visible at
    // THIS point. Only samples inside the umbra/penumbra cone darken, so the shadow shows
    // as a volume crossing the halo rather than dimming the whole atmosphere at once.
    let sun_vis = body_eclipse_visibility(pos, eclipse);
    // Source radiance is ∫ rho * beta * phase * dt. `sample_trans` still uses
    // sigma_t for extinction, but using (1 - sample_trans) here would multiply by
    // sigma_t and then by the beta already present in `phase`, effectively squaring
    // the radius-normalized coefficients and making world-scale atmospheres black.
    inscatter += transmittance * rho * phase * dt * sun_trans * sun_vis * atmo.sun_radiance;
    transmittance *= sample_trans;
  }

  let avg_trans = (transmittance.x + transmittance.y + transmittance.z) / 3.0;
  return vec4f(inscatter, avg_trans);
}
