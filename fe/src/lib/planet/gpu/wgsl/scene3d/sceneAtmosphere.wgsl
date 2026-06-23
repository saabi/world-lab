#include "../atmosphere/atmosphereParams.wgsl"
#include "../atmosphere/integrate.wgsl"
#include "../planet/lighting.wgsl"

// Scene atmosphere composite (Phase 5). Like atmosphereFullscreen.wgsl, but adapted to
// the scene engine's shared depth and selected-surface target. It samples the scene color
// rendered in the first pass and writes the final composite explicitly:
//   result = sceneColor * avgTransmittance + inscatter.
// Run in the focused body's body-local frame
// (planet_center = origin). The selected body's march end comes from a linear
// surface-distance target written by the same terrain fragments that color the planet,
// so it matches the tessellated mesh while avoiding scene-depth reconstruction precision
// loss. Foreground occlusion still uses the shared scene depth as a raw depth-order test
// against the atmosphere shell front.

struct AtmosphereFrame {
  inv_view_projection: mat4x4f,
  view_projection: mat4x4f,
  camera_pos: vec4f,
  viewport_size: vec4f,
  debug: vec4f,
}

const ATMOS_DEBUG_NONE: u32 = 0u;
const ATMOS_DEBUG_INSCATTER: u32 = 1u;
const ATMOS_DEBUG_TRANSMITTANCE: u32 = 2u;
const ATMOS_DEBUG_VIEW_SUN: u32 = 3u;
const ATMOS_DEBUG_SURFACE_MASK: u32 = 4u;

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
@group(1) @binding(2) var selected_surface_t: texture_2d<f32>;

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

fn projected_depth(t: f32, eye: vec3f, omega: vec3f) -> f32 {
  let p = eye + omega * t;
  let clip = atmo_frame.view_projection * vec4f(p, 1.0);
  return clip.z / clip.w;
}

fn scene_depth_at(uv: vec2f) -> f32 {
  let dims = vec2i(textureDimensions(scene_depth));
  let texel = clamp(vec2i(uv * vec2f(dims)), vec2i(0), dims - vec2i(1));
  return textureLoad(scene_depth, texel, 0);
}

fn scene_color_at(uv: vec2f) -> vec3f {
  let dims = vec2i(textureDimensions(scene_color));
  let texel = clamp(vec2i(uv * vec2f(dims)), vec2i(0), dims - vec2i(1));
  return textureLoad(scene_color, texel, 0).rgb;
}

fn selected_surface_t_at(uv: vec2f) -> f32 {
  let dims = vec2i(textureDimensions(selected_surface_t));
  let texel = clamp(vec2i(uv * vec2f(dims)), vec2i(0), dims - vec2i(1));
  return textureLoad(selected_surface_t, texel, 0).x;
}

fn shade_atmosphere(uv: vec2f, scene_rgb: vec3f, hardware_alpha: bool) -> vec4f {
  let eye = atmo_frame.camera_pos.xyz;
  let omega = world_ray(uv);
  let debug_mode = u32(atmo_frame.debug.x + 0.5);
  let surface_t = selected_surface_t_at(uv);

  if (debug_mode == ATMOS_DEBUG_SURFACE_MASK) {
    let hit = select(0.0, 1.0, surface_t >= 0.0);
    return vec4f(vec3f(hit), 1.0);
  }

  // Cheap reject: pixels whose ray never crosses the atmosphere shell contribute nothing.
  let shell = ray_sphere_intersect(eye, omega, atmo.planet_center, atmo.outer_radius);
  if (shell.y < 0.0) {
    if (hardware_alpha) {
      return vec4f(0.0);
    }
    return vec4f(select(scene_rgb, vec3f(0.0), debug_mode > ATMOS_DEBUG_NONE), 1.0);
  }

  // March end = the surface distance produced by the selected body's terrain fragments.
  // Where no terrain distance was written, fall back to the analytic base-sphere surface so
  // the march still stops at the planet rather than cutting through it. This matters during
  // the sphere→terrain cross-fade: valley fragments below the base radius lose the depth
  // test to the base sphere and write no surface_t, so without this they'd march the full
  // shell through the planet interior. A genuine miss (sky/halo, base sphere not hit) keeps
  // marching the full shell.
  let sun_dir = primary_sun_dir(lighting);
  var t_max = shell.y;
  if (surface_t >= 0.0) {
    t_max = surface_t;
  } else {
    let surf = ray_sphere_intersect(eye, omega, atmo.planet_center, atmo.planet_radius);
    if (surf.x > 0.0) {
      t_max = surf.x;
    }
  }

  if (debug_mode == ATMOS_DEBUG_VIEW_SUN) {
    let phase = dot(omega, sun_dir) * 0.5 + 0.5;
    return vec4f(vec3f(phase), 1.0);
  }

  // The shared depth contains both foreground bodies and the selected terrain. Do not
  // reconstruct a distance from it for the selected body's surface: that was the scene
  // precision failure. Use raw depth only to reject geometry that is in front of the
  // atmosphere shell's near side, which covers moons/planets between the camera and this
  // atmosphere without self-occluding on the selected terrain depth.
  if (shell.x > 0.0) {
    let shell_front_depth = projected_depth(shell.x, eye, omega);
    let depth = scene_depth_at(uv);
    if (depth + 0.0001 < shell_front_depth) {
      if (hardware_alpha) {
        return vec4f(0.0);
      }
      return vec4f(select(scene_rgb, vec3f(0.0), debug_mode > ATMOS_DEBUG_NONE), 1.0);
    }
  }

  let scatter = integrate_atmosphere(eye, omega, t_max, sun_dir, atmo);
  let inscatter = tone_map_reinhard_atmo(scatter.rgb);
  if (debug_mode == ATMOS_DEBUG_INSCATTER) {
    return vec4f(inscatter, 1.0);
  }
  if (debug_mode == ATMOS_DEBUG_TRANSMITTANCE) {
    return vec4f(vec3f(scatter.a), 1.0);
  }
  if (hardware_alpha) {
    return vec4f(inscatter, clamp(1.0 - scatter.a, 0.0, 1.0));
  }
  let out_rgb = scene_rgb * scatter.a + inscatter;
  return vec4f(out_rgb, 1.0);
}

@fragment
fn fs_explicit(in: VSOut) -> @location(0) vec4f {
  return shade_atmosphere(in.uv, scene_color_at(in.uv), false);
}

@fragment
fn fs_alpha(in: VSOut) -> @location(0) vec4f {
  return shade_atmosphere(in.uv, vec3f(0.0), true);
}
