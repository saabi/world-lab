#include "../planet/material.wgsl"
#include "../planet/normal.wgsl"
#include "../planet/lighting.wgsl"
#include "../planet/shadow.wgsl"
#include "../debug/materialDebug.wgsl"
#include "../common/frame.wgsl"
#include "../common/idealSphere.wgsl"
#include "../atmosphere/atmosphereParams.wgsl"

struct ViewUniforms {
  view_projection: mat4x4f,
  view: mat4x4f,
  camera_pos: vec4f,
  debug: vec4f,
  planet_rot: vec4f, // planet rotation quaternion [x, y, z, w]
  inv_view_projection: mat4x4f,
  viewport: vec4f, // [widthPx, heightPx, _, _]
}

@group(0) @binding(0) var<uniform> view_u: ViewUniforms;
@group(0) @binding(1) var<uniform> lighting: LightingUniforms;
@group(0) @binding(2) var<uniform> mat_overrides: MaterialOverrides;
@group(0) @binding(3) var<uniform> atmo: AtmosphereParams;
@group(1) @binding(0) var<uniform> planet: PlanetParams;
@group(2) @binding(0) var<uniform> scale_ctx: ScaleContext;
@group(3) @binding(0) var<storage, read> patches: array<CubeSpherePatchGpu>;

struct VSOut {
  @builtin(position) position: vec4f,
  @location(0) world_pos: vec3f,
  @location(1) unit_dir: vec3f,
  @location(2) @interpolate(flat) face: u32,
  @location(3) patch_uv: vec2f,
  @location(4) bary: vec3f,
  @location(5) body_dir: vec3f,
}

@vertex
fn vs_main(
  @builtin(vertex_index) vid: u32,
  @builtin(instance_index) iid: u32,
) -> VSOut {
  let patch_desc = patches[iid];
  let res = max(patch_desc.resolution, 1u);
  let tri_global = vid / 3u;
  let cell = tri_global / 2u;
  let tri_in_cell = tri_global % 2u;
  let corner = vid % 3u;
  let cell_x = cell % res;
  let cell_y = cell / res;
  let quad_verts = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
    vec2f(1.0, 0.0), vec2f(1.0, 1.0), vec2f(0.0, 1.0)
  );
  let uv_cell = quad_verts[tri_in_cell * 3u + corner];
  let uv_local = (vec2f(f32(cell_x), f32(cell_y)) + uv_cell) / f32(res);
  let uv = mix(vec2f(patch_desc.uv_min_x, patch_desc.uv_min_y), vec2f(patch_desc.uv_max_x, patch_desc.uv_max_y), uv_local);
  let unit_dir = cube_face_uv_to_unit_dir(patch_desc.face, uv.x, uv.y);
  // Sample terrain in the planet's body frame (world dir rotated by -spin), but
  // place the vertex at the world direction so the camera/sun stay fixed and the
  // terrain rotates beneath them.
  let body_dir = rotate_vector_by_quat_inv(view_u.planet_rot, unit_dir);
  let sample = sample_planet(body_dir, planet, scale_ctx);
  let world_pos = unit_dir * sample.world_radius_meters;
  var out: VSOut;
  out.world_pos = world_pos;
  out.unit_dir = unit_dir;
  out.body_dir = body_dir;
  out.face = patch_desc.face;
  out.patch_uv = uv_local;
  let baries = array<vec3f, 3>(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), vec3f(0.0, 0.0, 1.0));
  out.bary = baries[corner];
  out.position = view_u.view_projection * vec4f(world_pos, 1.0);
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4f {
  // Recompute body_dir from the ideal-sphere fragment coordinate so terrain analytics
  // don't crawl with tessellation; fall back to the interpolated value on a miss
  // (grazing / above-silhouette, deferred). See common/idealSphere.wgsl.
  let ideal = ideal_sphere_body_dir(
    in.position.xy, view_u.viewport.xy, view_u.inv_view_projection,
    view_u.camera_pos.xyz, view_u.planet_rot, planet.radius
  );
  let body_dir = select(in.body_dir, ideal.body_dir, ideal.hit);
  let sample = sample_planet(body_dir, planet, scale_ctx);
  var material = apply_material_overrides(surface_material(sample, planet, scale_ctx), mat_overrides);
  var col = material.albedo;
  if (view_u.debug.y > 0.5) {
    col = face_debug_color(in.face);
  }
  if (view_u.debug.z > 0.5) {
    let border = min(min(in.patch_uv.x, 1.0 - in.patch_uv.x), min(in.patch_uv.y, 1.0 - in.patch_uv.y));
    if (border < 0.05) {
      col = mix(col, vec3f(0.0), 0.6);
    }
  }
  var lit = LightingResult(col, vec3f(0.0), vec3f(0.0));
  var n = normalize(in.world_pos);
  if (planet.illumination > 0.5) {
    // Normal computed in body space, rotated back to world by +rotation.
    let n_body = planet_surface_normal(body_dir, planet, scale_ctx);
    n = rotate_vector_by_quat(view_u.planet_rot, n_body);
    let v = view_u.camera_pos.xyz - in.world_pos;
    var sun_shadow = 1.0;
    if (mat_overrides.shadows_enabled > 0.5 && lighting.light_count > 0u) {
      let raw_shadow = terrain_sun_shadow(in.world_pos, primary_sun_dir(lighting), planet, scale_ctx, view_u.planet_rot);
      // Lift shadows back toward full sun by shadow_fill, faking scattered fill past the fold.
      sun_shadow = mix(clamp(mat_overrides.shadow_fill, 0.0, 1.0), 1.0, raw_shadow);
    }
    lit = evaluate_pbr(
      material,
      n,
      v,
      in.world_pos,
      lighting,
      mat_overrides,
      atmo,
      view_u.camera_pos.xyz,
      sun_shadow,
    );
    col = lit.color;
  }

  let debug_mode = u32(mat_overrides.material_debug + 0.5);
  if (debug_mode > 0u) {
    col = apply_material_debug(debug_mode, n, body_dir, material, lit);
  }

  // Wireframe overlay: bright lines along triangle edges (barycentric distance).
  if (view_u.debug.x > 0.5) {
    let edge = min(min(in.bary.x, in.bary.y), in.bary.z);
    let aa = fwidth(edge) * 1.5;
    let line = 1.0 - smoothstep(0.0, max(aa, 1e-5), edge);
    col = mix(col, vec3f(0.05, 1.0, 0.4), line);
  }

  return vec4f(col, 1.0);
}
