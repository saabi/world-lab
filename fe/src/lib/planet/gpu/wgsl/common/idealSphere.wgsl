// Ideal-sphere fragment sampling (see _docs/ideal-sphere-fragment-sampling.md).
//
// Fragment terrain analytics must not read the interpolated vertex direction: across a
// flat triangle that value is a chord approximation whose error changes with tessellation,
// so noise/material crawl as the mesh resolution changes. Instead, reconstruct the view
// ray for the fragment, intersect the *ideal base sphere* (planet centre at the local
// origin, radius = base_radius), and recompute body_dir from that hit. Geometry/depth may
// still come from the displaced mesh; only the analytic coordinate is recomputed here.
//
// Requires rotate_vector_by_quat_inv (planet/kernel.wgsl, included by the terrain shaders).

struct IdealHit {
  hit: bool,
  body_dir: vec3f,
}

fn ideal_sphere_body_dir(
  frag_xy: vec2f,        // @builtin(position).xy — framebuffer pixels
  viewport: vec2f,       // [widthPx, heightPx]
  inv_vp: mat4x4f,       // inverse(view_projection)
  cam_pos: vec3f,        // camera position in the render frame
  planet_rot: vec4f,     // body rotation quaternion
  base_radius: f32,
) -> IdealHit {
  var out: IdealHit;
  out.hit = false;
  out.body_dir = vec3f(0.0, 1.0, 0.0);

  // Pixel → NDC. WebGPU: framebuffer y is down, NDC y is up; clip z ∈ [0, 1].
  let uv = frag_xy / max(viewport, vec2f(1.0));
  let ndc = vec2f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);

  // Unproject a far-plane point (z = 1) and shoot the ray from the camera through it.
  let far_h = inv_vp * vec4f(ndc, 1.0, 1.0);
  if (abs(far_h.w) < 1e-12) {
    return out;
  }
  let far_world = far_h.xyz / far_h.w;
  let dir = normalize(far_world - cam_pos);

  // Ray/sphere intersection, sphere centred at the origin (|cam + t·dir|² = r²).
  let b = dot(cam_pos, dir);
  let c = dot(cam_pos, cam_pos) - base_radius * base_radius;
  let disc = b * b - c;
  if (disc < 0.0) {
    return out; // ray misses the base sphere (grazing / above silhouette — deferred)
  }
  let sq = sqrt(disc);
  var t = -b - sq;          // near root (front face)
  if (t < 0.0) {
    t = -b + sq;            // camera inside the sphere → use the far root
  }
  if (t < 0.0) {
    return out;             // sphere entirely behind the camera
  }

  let world_dir = normalize(cam_pos + dir * t);
  out.body_dir = rotate_vector_by_quat_inv(planet_rot, world_dir);
  out.hit = true;
  return out;
}
