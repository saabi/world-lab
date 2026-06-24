#include "../planet/material.wgsl"
#include "../planet/normal.wgsl"
#include "../planet/lighting.wgsl"
#include "../planet/shadow.wgsl"
#include "../planet/eclipse.wgsl"
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
@group(0) @binding(4) var<uniform> eclipse: EclipseUniforms;
@group(1) @binding(0) var<uniform> planet: PlanetParams;
@group(2) @binding(0) var<uniform> scale_ctx: ScaleContext;
@group(2) @binding(1) var<uniform> local_frame: LocalFrame;
@group(3) @binding(0) var<storage, read> surface_patches: array<SurfacePatchGpu>;

struct VSOut {
  @builtin(position) position: vec4f,
  @location(0) world_pos: vec3f,
  @location(1) unit_dir: vec3f,
  @location(2) @interpolate(flat) ring: u32,
  @location(3) patch_uv: vec2f,
}

struct FSOut {
  @location(0) color: vec4f,
  @location(1) surface_t: f32,
}

@vertex
fn vs_main(
  @builtin(vertex_index) vid: u32,
  @builtin(instance_index) iid: u32,
) -> VSOut {
  let patch_desc = surface_patches[iid];
  let quad_verts = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
    vec2f(1.0, 0.0), vec2f(1.0, 1.0), vec2f(0.0, 1.0)
  );
  let tri = vid / 3u;
  let corner = vid % 3u;
  let uv_cell = quad_verts[tri * 3u + corner];
  let local_xy = vec2f(patch_desc.origin_x, patch_desc.origin_y) + (uv_cell - 0.5) * patch_desc.size_meters;
  let unit_dir = tangent_offset_to_unit_dir(local_xy, local_frame);
  let body_dir = rotate_vector_by_quat_inv(view_u.planet_rot, unit_dir);
  var world_radius = planet.radius;
  if (mat_overrides.displacement_blend > 1e-4) {
    let sample = sample_planet(body_dir, planet, scale_ctx);
    world_radius = mix(planet.radius, sample.world_radius_meters, mat_overrides.displacement_blend);
  }
  let local_pos = unit_dir * world_radius;
  var out: VSOut;
  out.world_pos = local_pos;
  out.unit_dir = body_dir;
  out.ring = patch_desc.ring;
  out.patch_uv = uv_cell;
  out.position = view_u.view_projection * vec4f(local_pos, 1.0);
  return out;
}

@fragment
fn fs_main(in: VSOut) -> FSOut {
  // Geometry/height/material/normal follow the displaced surface (the interpolated body
  // dir, here in.unit_dir); only the fine texture noise uses the tessellation-stable
  // ideal-sphere dir (with a grazing-miss fallback). See common/idealSphere.wgsl.
  let body_dir = in.unit_dir;
  let ideal = ideal_sphere_body_dir(
    in.position.xy, view_u.viewport.xy, view_u.inv_view_projection,
    view_u.camera_pos.xyz, view_u.planet_rot, planet.radius
  );
  let tex_dir = select(body_dir, ideal.body_dir, ideal.hit);
  let full_sample = sample_planet(body_dir, planet, scale_ctx);
  let sample = apply_height_blend(full_sample, planet.radius, mat_overrides.height_blend);
  var material = apply_material_overrides(surface_material(sample, planet, scale_ctx, tex_dir), mat_overrides);
  var col = material.albedo;
  if (view_u.debug.w > 0.5) {
    col = ring_debug_color(in.ring);
  }
  if (view_u.debug.z > 0.5) {
    let border = min(min(in.patch_uv.x, 1.0 - in.patch_uv.x), min(in.patch_uv.y, 1.0 - in.patch_uv.y));
    if (border < 0.04) {
      col = mix(col, vec3f(1.0), 0.5);
    }
  }

  var lit = LightingResult(col, vec3f(0.0), vec3f(0.0));
  var n = normalize(in.world_pos);
  if (planet.illumination > 0.5) {
    let n_body = planet_surface_normal(body_dir, planet, scale_ctx);
    n = rotate_vector_by_quat(view_u.planet_rot, n_body);
    let v = view_u.camera_pos.xyz - in.world_pos;
    var sun_shadow = 1.0;
    if (lighting.light_count > 0u) {
      // Terrain self-shadow (relief) is gated by the toggle; body eclipse (occluding
      // moons/planets) always applies. They operate at different scales and multiply.
      var raw_shadow = 1.0;
      if (mat_overrides.shadows_enabled > 0.5) {
        raw_shadow = terrain_sun_shadow(in.world_pos, primary_sun_dir(lighting), planet, scale_ctx, view_u.planet_rot, mat_overrides.shadow_softness, mat_overrides.shadow_steps);
      }
      let eclipse_visibility = body_eclipse_visibility(in.world_pos, eclipse);
      sun_shadow = mix(clamp(mat_overrides.shadow_fill, 0.0, 1.0), 1.0, raw_shadow * eclipse_visibility);
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
    col = apply_material_debug(debug_mode, n, body_dir, material, lit, sample, planet);
  }

  var out: FSOut;
  out.color = vec4f(col, mat_overrides.object_opacity);
  out.surface_t = length(in.world_pos - view_u.camera_pos.xyz);
  return out;
}
