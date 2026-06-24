#include "../atmosphere/atmosphereParams.wgsl"
#include "../atmosphere/integrate.wgsl"
#include "../planet/lighting.wgsl"
#include "../planet/eclipse.wgsl"

// Scene atmosphere composite (Phase 5+). Samples the shared scene color + depth and
// composites every procedural body's atmosphere in one fullscreen pass using the scene
// camera. Body centers are camera-relative (world position − eye) for precision at
// astronomical scale. Bodies are composited far-to-near along the view ray so every
// halo in the frustum contributes without chained overlay passes.

struct AtmosphereFrame {
  inv_view_projection: mat4x4f,
  view_projection: mat4x4f,
  camera_pos: vec4f,
  viewport_size: vec4f,
  debug: vec4f,
}

const MAX_SCENE_ATMO_BODIES: u32 = 8u;

struct SceneAtmosphereSet {
  body_count: u32,
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
  opacity: array<f32, 8>,
  bodies: array<AtmosphereParams, 8>,
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
@group(0) @binding(3) var<uniform> atmo_set: SceneAtmosphereSet;
@group(0) @binding(4) var<uniform> eclipse: EclipseUniforms;
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

// Camera-relative: the camera sits at the origin, so a point at ray distance t is
// just omega * t. view_projection is the eye-relative matrix, which yields the same
// clip-space depth as the absolute scene VP (translation does not affect z/w), so
// this stays comparable to the shared scene depth buffer.
fn projected_depth_rel(t: f32, omega: vec3f) -> f32 {
  let p_rel = omega * t;
  let clip = atmo_frame.view_projection * vec4f(p_rel, 1.0);
  return clip.z / clip.w;
}

fn scene_depth_at(uv: vec2f) -> f32 {
  let dims = vec2i(textureDimensions(scene_depth));
  let texel = clamp(vec2i(uv * vec2f(dims)), vec2i(0), dims - vec2i(1));
  return textureLoad(scene_depth, texel, 0);
}

fn scene_color_sample(uv: vec2f) -> vec4f {
  let dims = vec2i(textureDimensions(scene_color));
  let texel = clamp(vec2i(uv * vec2f(dims)), vec2i(0), dims - vec2i(1));
  return textureLoad(scene_color, texel, 0);
}

fn scene_color_at(uv: vec2f) -> vec3f {
  return scene_color_sample(uv).rgb;
}

// Reconstruct the camera-relative position of a depth sample. inv_view_projection is
// the eye-relative inverse, so the result is (world - eye) — small even when the body
// is far from the world origin, which is what keeps the march boundary precise.
fn reconstruct_rel_from_depth(uv: vec2f, depth: f32) -> vec3f {
  let ndc_x = uv.x * 2.0 - 1.0;
  let ndc_y = (1.0 - uv.y) * 2.0 - 1.0;
  let rel_h = atmo_frame.inv_view_projection * vec4f(ndc_x, ndc_y, depth, 1.0);
  return rel_h.xyz / rel_h.w;
}

fn body_march_end(
  uv: vec2f,
  eye_rel: vec3f,
  omega: vec3f,
  atmo: AtmosphereParams,
  shell: vec2f,
) -> f32 {
  var t_max = shell.y;
  let surf = ray_sphere_intersect(eye_rel, omega, atmo.planet_center, atmo.planet_radius);
  if (surf.x > 0.0) {
    t_max = surf.x;
  }

  // End the march at tessellated terrain / sphere depth when this body owns the pixel.
  // Everything here is camera-relative: planet_center is (world - eye) and the depth
  // sample reconstructs to the same frame, so no large world coordinates are formed.
  let scene = scene_color_sample(uv);
  if (scene.a > 0.02) {
    let depth = scene_depth_at(uv);
    let p_rel = reconstruct_rel_from_depth(uv, depth);
    if (length(p_rel - atmo.planet_center) < atmo.outer_radius * 1.05) {
      let t_geom = dot(p_rel - eye_rel, omega);
      if (t_geom > 0.0) {
        t_max = min(t_max, t_geom);
      }
    }
  }

  return t_max;
}

fn selected_surface_t_at(uv: vec2f) -> f32 {
  let dims = vec2i(textureDimensions(selected_surface_t));
  let texel = clamp(vec2i(uv * vec2f(dims)), vec2i(0), dims - vec2i(1));
  return textureLoad(selected_surface_t, texel, 0).x;
}

fn body_params(index: u32) -> AtmosphereParams {
  return atmo_set.bodies[index];
}

fn body_opacity(index: u32) -> f32 {
  return atmo_set.opacity[index];
}

fn shell_entry_t(eye: vec3f, omega: vec3f, atmo: AtmosphereParams) -> f32 {
  let shell = ray_sphere_intersect(eye, omega, atmo.planet_center, atmo.outer_radius);
  if (shell.y < 0.0) {
    return 1e30;
  }
  return shell.x;
}

fn composite_body_atmosphere(
  uv: vec2f,
  scene_rgb: vec3f,
  eye_rel: vec3f,
  omega: vec3f,
  sun_dir: vec3f,
  atmo: AtmosphereParams,
  atmosphere_opacity: f32,
  hardware_alpha: bool,
) -> vec4f {
  let shell = ray_sphere_intersect(eye_rel, omega, atmo.planet_center, atmo.outer_radius);
  if (shell.y < 0.0) {
    if (hardware_alpha) {
      return vec4f(scene_rgb, 0.0);
    }
    return vec4f(scene_rgb, 1.0);
  }

  let t_max = body_march_end(uv, eye_rel, omega, atmo, shell);

  // Foreground occlusion: compare shell entry depth (eye-relative clip space, which
  // matches the absolute scene VP depth) against the shared scene depth.
  if (shell.x > 0.0) {
    let shell_front_depth = projected_depth_rel(shell.x, omega);
    let depth = scene_depth_at(uv);
    if (depth + 0.0001 < shell_front_depth) {
      if (hardware_alpha) {
        return vec4f(0.0);
      }
      return vec4f(scene_rgb, 1.0);
    }
  }

  // Eclipse is sampled per march step inside integrate_atmosphere, so only the volume of
  // the halo crossing the umbra/penumbra cone darkens (not the whole atmosphere at once).
  let scatter = integrate_atmosphere(eye_rel, omega, t_max, sun_dir, atmo, eclipse);
  let inscatter = tone_map_reinhard_atmo(scatter.rgb);
  let inscatter_faded = inscatter * atmosphere_opacity;
  let transmittance_faded = mix(1.0, scatter.a, atmosphere_opacity);
  if (hardware_alpha) {
    return vec4f(inscatter_faded, clamp(1.0 - transmittance_faded, 0.0, 1.0));
  }
  // Sky pixels (no geometry): match /planet — inscatter only, no background extinction.
  if (scene_color_sample(uv).a <= 0.02) {
    return vec4f(scene_rgb + inscatter_faded, 1.0);
  }
  let out_rgb = scene_rgb * transmittance_faded + inscatter_faded;
  return vec4f(out_rgb, 1.0);
}

fn shade_atmosphere(uv: vec2f, scene_rgb: vec3f, hardware_alpha: bool) -> vec4f {
  // The composite runs in camera-relative space: the eye is the origin and every
  // body center / depth sample is relative to it. atmo_frame.camera_pos is unused.
  let eye_rel = vec3f(0.0);
  let omega = world_ray(uv);
  let debug_mode = u32(atmo_frame.debug.x + 0.5);
  let body_count = min(atmo_set.body_count, MAX_SCENE_ATMO_BODIES);

  if (debug_mode == ATMOS_DEBUG_SURFACE_MASK) {
    let hit = select(0.0, 1.0, selected_surface_t_at(uv) >= 0.0);
    return vec4f(vec3f(hit), 1.0);
  }

  if (body_count == 0u) {
    return vec4f(scene_rgb, 1.0);
  }

  let sun_dir = primary_sun_dir(lighting);

  if (debug_mode == ATMOS_DEBUG_VIEW_SUN) {
    let phase = dot(omega, sun_dir) * 0.5 + 0.5;
    return vec4f(vec3f(phase), 1.0);
  }

  // Far-to-near along the view ray (insertion sort — N is small).
  var order = array<u32, 8>(0u, 1u, 2u, 3u, 4u, 5u, 6u, 7u);
  for (var i = 0u; i < body_count; i++) {
    for (var j = i + 1u; j < body_count; j++) {
      let ti = shell_entry_t(eye_rel, omega, body_params(order[i]));
      let tj = shell_entry_t(eye_rel, omega, body_params(order[j]));
      if (tj < ti) {
        let tmp = order[i];
        order[i] = order[j];
        order[j] = tmp;
      }
    }
  }

  var rgb = scene_rgb;
  var alpha_out = 0.0;

  for (var pass_i = 0u; pass_i < body_count; pass_i = pass_i + 1u) {
    let body_index = order[pass_i];
    let atmo = body_params(body_index);
    let opacity = clamp(body_opacity(body_index), 0.0, 1.0);
    if (opacity <= 0.0) {
      continue;
    }
    let layer = composite_body_atmosphere(
      uv,
      rgb,
      eye_rel,
      omega,
      sun_dir,
      atmo,
      opacity,
      hardware_alpha,
    );
    rgb = layer.rgb;
    if (hardware_alpha) {
      alpha_out = layer.a;
    }
  }

  if (debug_mode == ATMOS_DEBUG_INSCATTER) {
    return vec4f(rgb, 1.0);
  }
  if (debug_mode == ATMOS_DEBUG_TRANSMITTANCE) {
    return vec4f(vec3f(0.0), 1.0);
  }

  if (hardware_alpha) {
    return vec4f(rgb, alpha_out);
  }
  return vec4f(rgb, 1.0);
}

@fragment
fn fs_explicit(in: VSOut) -> @location(0) vec4f {
  return shade_atmosphere(in.uv, scene_color_at(in.uv), false);
}

@fragment
fn fs_alpha(in: VSOut) -> @location(0) vec4f {
  return shade_atmosphere(in.uv, vec3f(0.0), true);
}
