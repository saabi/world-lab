/// Ray-sphere intersection (rd assumed normalized). Returns (t_enter, t_exit);
/// negative if miss.
///
/// Uses the perpendicular-distance form `disc = R² − |oc − (oc·rd)rd|²` instead
/// of `b² − c`. The latter subtracts two large near-equal numbers when the ray
/// origin is far from the centre (both ≈ distance²), losing f32 precision and
/// corrupting the thin-shell entry/exit. The perpendicular form computes the
/// small quantity directly, so it stays accurate at large distances.
fn ray_sphere_intersect(ro: vec3f, rd: vec3f, center: vec3f, radius: f32) -> vec2f {
  let oc = ro - center;
  let b = dot(oc, rd);
  let perp = oc - rd * b;
  let disc = radius * radius - dot(perp, perp);
  if (disc < 0.0) {
    return vec2f(-1.0, -1.0);
  }
  let s = sqrt(disc);
  return vec2f(-b - s, -b + s);
}

fn altitude_at(pos: vec3f, center: vec3f, planet_radius: f32) -> f32 {
  return length(pos - center) - planet_radius;
}
