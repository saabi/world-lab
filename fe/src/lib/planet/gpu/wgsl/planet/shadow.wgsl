// Procedural terrain self-shadows for the primary directional sun.
//
// The terrain is an analytic height function, so instead of a shadow map we
// march a ray from the shaded point toward the sun and ask whether the terrain
// rises above the ray before it escapes. The world is spherical with radial
// displacement, so at each step we compare the sample point's distance from the
// planet center against the terrain radius in that direction.
//
// Sun only, coarse (macro-relief) height. Soft penumbra via closest-approach, with
// knob-controlled softness and step count (see terrain_sun_shadow).

#include "kernel.wgsl"

const SHADOW_STEPS_MIN: u32 = 4u;
const SHADOW_STEPS_MAX: u32 = 64u;

/// Coarse terrain radius used for shadow casting: macro voronoi relief plus the
/// erosion remap, skipping the detail/texture-noise layers that
/// rarely cast meaningful shadows. Cheaper than a full `sample_planet`.
fn sample_shadow_height(unit_dir: vec3f, params: PlanetParams) -> f32 {
  // Relief amplitudes are ratios of radius (scale-independent); convert to metres.
  let v_amp = params.voronoi_amplitude * params.radius;
  let d_amp = params.detail_amplitude * params.radius;
  let total_amplitude = v_amp + d_amp;
  let wl = total_amplitude * (params.water_level - 0.5);

  var distortion = 0.0;
  if (params.voronoi_distortion_scale > 0.0) {
    distortion = fbm_4(unit_dir * params.voronoi_distortion_scale);
  }
  let vor = voronoi3(unit_dir * params.voronoi_scale + (distortion - 0.5) * params.voronoi_distortion_amplitude);

  var height = (vor.x - 0.5) * v_amp;
  var th = height - wl;
  var thf: f32;
  if (th > 0.0) {
    thf = total_amplitude - wl;
  } else {
    thf = wl - params.radius;
  }
  th /= thf;
  th = pow(th, params.erosion);
  th *= thf;
  height = wl + th;

  var radius = params.radius + height;
  return radius;
}

/// 1.0 = lit, 0.0 = fully shadowed, with a soft penumbra in between. `surface_pos` is
/// planet-centered world space. `softness` ∈ [0,1] widens the penumbra (0 ≈ crisp);
/// `step_count` trades cost for smoothness (clamped to [4, 64]).
fn terrain_sun_shadow(
  surface_pos: vec3f,
  sun_dir: vec3f,
  params: PlanetParams,
  scale: ScaleContext,
  planet_rot: vec4f, // planet rotation quaternion [x, y, z, w]
  softness: f32,
  step_count: f32,
) -> f32 {
  let n = normalize(surface_pos);
  let sun_elev = dot(n, sun_dir);
  if (sun_elev <= 0.0) {
    return 0.0; // sun below the local horizon — the body itself occludes it
  }

  let total_amplitude = (params.voronoi_amplitude + params.detail_amplitude) * params.radius;
  if (total_amplitude <= 0.0) {
    return 1.0; // flat planet, nothing to cast a shadow
  }

  // Bias off the surface to dodge self-intersection from discretization.
  let bias = max(scale.meters_per_pixel * 1.5, total_amplitude * 0.01);
  // A shadow's horizontal reach grows as relief / sin(sun elevation); bound the
  // march so grazing light stays affordable (longer shadows are clipped softly).
  let max_dist = total_amplitude / max(sun_elev, 0.08);
  let steps = u32(clamp(step_count, f32(SHADOW_STEPS_MIN), f32(SHADOW_STEPS_MAX)));
  let step = max_dist / f32(steps);

  // Soft penumbra (Inigo-Quilez closest-approach): track the smallest ratio of the ray's
  // clearance above the terrain to distance travelled. Negative clearance is a hard hit
  // (umbra). `k` is the penumbra hardness — high = crisp edge, low = wide/soft.
  let k = mix(60.0, 4.0, clamp(softness, 0.0, 1.0));
  var shade = 1.0;
  var t = bias + step;
  for (var i = 0u; i < steps; i++) {
    let p = surface_pos + sun_dir * t;
    let surf_r = sample_shadow_height(rotate_vector_by_quat_inv(planet_rot, normalize(p)), params);
    let clearance = length(p) - surf_r;
    if (clearance < 0.0) {
      return 0.0; // terrain rises above the ray — fully occluded
    }
    shade = min(shade, k * clearance / t);
    t += step;
  }
  return clamp(shade, 0.0, 1.0);
}
