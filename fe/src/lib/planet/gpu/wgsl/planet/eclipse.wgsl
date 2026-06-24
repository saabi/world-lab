const MAX_ECLIPSE_OCCLUDERS: u32 = 8u;
const ECLIPSE_PI: f32 = 3.141592653589793;

struct EclipseUniforms {
  sun_position_radius: vec4f,
  params: vec4f, // count, enabled, _, _
  occluders: array<vec4f, MAX_ECLIPSE_OCCLUDERS>,
}

// Disabled set (params.y = 0 ⇒ body_eclipse_visibility returns 1.0). For callers with no
// eclipse data, e.g. the standalone /planet atmosphere passing through integrate_atmosphere.
fn no_eclipse() -> EclipseUniforms {
  return EclipseUniforms(vec4f(0.0), vec4f(0.0), array<vec4f, MAX_ECLIPSE_OCCLUDERS>());
}

fn eclipse_disk_overlap_area(a: f32, b: f32, d: f32) -> f32 {
  if (a <= 0.0 || b <= 0.0 || d >= a + b) {
    return 0.0;
  }
  let min_r = min(a, b);
  let max_r = max(a, b);
  if (d <= max_r - min_r) {
    return ECLIPSE_PI * min_r * min_r;
  }
  let aa = a * a;
  let bb = b * b;
  let dd = d * d;
  let ca = clamp((dd + aa - bb) / max(2.0 * d * a, 1e-8), -1.0, 1.0);
  let cb = clamp((dd + bb - aa) / max(2.0 * d * b, 1e-8), -1.0, 1.0);
  let lens = 0.5 * sqrt(max(0.0, (-d + a + b) * (d + a - b) * (d - a + b) * (d + a + b)));
  return aa * acos(ca) + bb * acos(cb) - lens;
}

fn eclipse_disk_obscuration(sun_radius: f32, occluder_radius: f32, separation: f32) -> f32 {
  let sun_area = ECLIPSE_PI * sun_radius * sun_radius;
  if (sun_area <= 0.0) {
    return 0.0;
  }
  return clamp(eclipse_disk_overlap_area(sun_radius, occluder_radius, separation) / sun_area, 0.0, 1.0);
}

fn body_eclipse_visibility(surface_pos: vec3f, eclipse: EclipseUniforms) -> f32 {
  if (eclipse.params.y < 0.5) {
    return 1.0;
  }
  let sun_vec = eclipse.sun_position_radius.xyz - surface_pos;
  let sun_dist = length(sun_vec);
  let sun_radius_m = eclipse.sun_position_radius.w;
  if (sun_radius_m <= 0.0 || sun_dist <= sun_radius_m) {
    return 1.0;
  }
  let sun_dir = sun_vec / sun_dist;
  let sun_angular_radius = asin(clamp(sun_radius_m / sun_dist, 0.0, 1.0));
  var max_obscuration = 0.0;
  let count = min(u32(eclipse.params.x + 0.5), MAX_ECLIPSE_OCCLUDERS);
  for (var i = 0u; i < MAX_ECLIPSE_OCCLUDERS; i++) {
    if (i >= count) {
      break;
    }
    let occ = eclipse.occluders[i];
    let occ_vec = occ.xyz - surface_pos;
    let occ_dist = length(occ_vec);
    let occ_radius_m = occ.w;
    if (occ_radius_m <= 0.0 || occ_dist <= occ_radius_m || occ_dist >= sun_dist) {
      continue;
    }
    let occ_dir = occ_vec / occ_dist;
    let toward_sun = dot(occ_dir, sun_dir);
    if (toward_sun <= 0.0) {
      continue;
    }
    let occ_angular_radius = asin(clamp(occ_radius_m / occ_dist, 0.0, 1.0));
    let separation = acos(clamp(toward_sun, -1.0, 1.0));
    let obscuration = eclipse_disk_obscuration(sun_angular_radius, occ_angular_radius, separation);
    max_obscuration = max(max_obscuration, obscuration);
  }
  return 1.0 - clamp(max_obscuration, 0.0, 1.0);
}
