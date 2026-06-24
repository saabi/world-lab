#include "atmosphereParams.wgsl"
#include "integrate.wgsl"
#include "../planet/lighting.wgsl"
#include "../planet/material.wgsl"

struct AtmosphereFrame {
  inv_view_projection: mat4x4f,
  camera_pos: vec4f,
  viewport_size: vec4f,
}

struct VSOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@group(0) @binding(0) var<uniform> atmo_frame: AtmosphereFrame;
@group(0) @binding(1) var<uniform> lighting: LightingUniforms;
@group(0) @binding(2) var<uniform> mat_overrides: MaterialOverrides;
@group(0) @binding(3) var<uniform> atmo: AtmosphereParams;
@group(1) @binding(0) var scene_color: texture_2d<f32>;
@group(1) @binding(1) var scene_depth: texture_depth_2d;
@group(1) @binding(2) var scene_sampler: sampler;

@vertex
fn vs_main(@builtin(vertex_index) vid: u32) -> VSOut {
  let positions = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f(3.0, -1.0),
    vec2f(-1.0, 3.0),
  );
  let p = positions[vid];
  var out: VSOut;
  out.position = vec4f(p, 0.0, 1.0);
  out.uv = p * 0.5 + 0.5;
  out.uv.y = 1.0 - out.uv.y;
  return out;
}

fn world_ray(uv: vec2f) -> vec3f {
  let ndc_x = uv.x * 2.0 - 1.0;
  let ndc_y = (1.0 - uv.y) * 2.0 - 1.0;
  let near_h = atmo_frame.inv_view_projection * vec4f(ndc_x, ndc_y, 0.0, 1.0);
  let far_h = atmo_frame.inv_view_projection * vec4f(ndc_x, ndc_y, 1.0, 1.0);
  let near_pt = near_h.xyz / near_h.w;
  let far_pt = far_h.xyz / far_h.w;
  return normalize(far_pt - near_pt);
}

fn tone_map_reinhard_atmo(color: vec3f) -> vec3f {
  return vec3f(1.0) - exp(-color * max(mat_overrides.exposure, 0.01));
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4f {
  let eye = atmo_frame.camera_pos.xyz;
  let omega = world_ray(in.uv);
  let sun_dir = primary_sun_dir(lighting);

  let dims = vec2f(textureDimensions(scene_depth));
  let texel = vec2i(in.uv * dims);
  let shell_hit = ray_sphere_intersect(eye, omega, atmo.planet_center, atmo.outer_radius);
  let t_atmo = select(shell_hit.y, 1e5, shell_hit.y < 0.0);

  // Terrain vs. sky comes from the rendered alpha (1 where terrain drew, 0 on the
  // cleared sky), which is precision-safe at any distance — unlike a depth
  // threshold, whose hyperbolic value approaches the clear value as the far plane
  // grows with camera distance, which dropped distant terrain.
  let scene = textureLoad(scene_color, texel, 0);
  let has_terrain = scene.a > 0.5;
  let scene_rgb = scene.rgb;

  var t_max = t_atmo;
  if (has_terrain) {
    let depth = textureLoad(scene_depth, texel, 0);
    let ndc_x = in.uv.x * 2.0 - 1.0;
    let ndc_y = (1.0 - in.uv.y) * 2.0 - 1.0;
    let clip = vec4f(ndc_x, ndc_y, depth, 1.0);
    let world_h = atmo_frame.inv_view_projection * clip;
    let world_pt = world_h.xyz / world_h.w;
    let t_terrain = length(world_pt - eye);
    t_max = min(t_atmo, t_terrain);
  }

  let scatter = integrate_atmosphere(eye, omega, t_max, sun_dir, atmo, no_eclipse());
  let inscatter = tone_map_reinhard_atmo(scatter.rgb);
  let transmittance = scatter.a;

  if (!has_terrain) {
    return vec4f(inscatter, 1.0);
  }

  let out_rgb = scene_rgb * transmittance + inscatter;
  return vec4f(out_rgb, 1.0);
}
