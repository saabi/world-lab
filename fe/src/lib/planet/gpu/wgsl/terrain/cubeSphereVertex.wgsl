#include "../planet/material.wgsl"
#include "../planet/normal.wgsl"
#include "../planet/lighting.wgsl"
#include "../common/frame.wgsl"
#include "../atmosphere/atmosphere.wgsl"

struct ViewUniforms {
  view_projection: mat4x4f,
  view: mat4x4f,
  camera_pos: vec4f,
  debug: vec4f,
}

@group(0) @binding(0) var<uniform> view_u: ViewUniforms;
@group(0) @binding(1) var<uniform> lighting: LightingUniforms;
@group(1) @binding(0) var<uniform> planet: PlanetParams;
@group(2) @binding(0) var<uniform> scale_ctx: ScaleContext;
@group(3) @binding(0) var<storage, read> patches: array<CubeSpherePatchGpu>;

struct VSOut {
  @builtin(position) position: vec4f,
  @location(0) world_pos: vec3f,
  @location(1) unit_dir: vec3f,
  @location(2) @interpolate(flat) face: u32,
  @location(3) patch_uv: vec2f,
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
  let sample = sample_planet(unit_dir, planet, scale_ctx);
  var out: VSOut;
  out.world_pos = sample.world_pos;
  out.unit_dir = unit_dir;
  out.face = patch_desc.face;
  out.patch_uv = uv_local;
  out.position = view_u.view_projection * vec4f(sample.world_pos, 1.0);
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4f {
  let sample = sample_planet(in.unit_dir, planet, scale_ctx);
  let material = surface_material(sample, planet, scale_ctx);
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
  if (view_u.debug.x > 0.5) {
    return vec4f(vec3f(0.2, 0.8, 0.2), 1.0);
  }
  if (planet.illumination > 0.5) {
    let n = planet_surface_normal(in.unit_dir, planet, scale_ctx);
    let v = view_u.camera_pos.xyz - sample.world_pos;
    col = evaluate_pbr(material, n, v, sample.world_pos, lighting);
  }
  let view_dir = normalize(in.world_pos - view_u.camera_pos.xyz);
  let fog = atmosphere_fog(view_dir, scale_ctx.camera_altitude_meters, 0.8);
  col = mix(col, fog.rgb, fog.a);
  return vec4f(col, 1.0);
}
