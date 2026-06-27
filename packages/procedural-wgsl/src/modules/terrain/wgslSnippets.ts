/** Verbatim planet WGSL fragments (copied from fe/src/lib/planet/gpu/wgsl — do not rewrite math). */

export const HASH_WGSL = `fn hash3(x: vec3f) -> vec3f {
  let p = vec3f(
    dot(x, vec3f(127.1, 311.7, 74.7)),
    dot(x, vec3f(269.5, 183.3, 246.1)),
    dot(x, vec3f(113.5, 271.9, 124.6))
  );
  return fract(sin(p) * 43758.5453123);
}`;

export const FBM_WGSL = `fn mod289_f(x: f32) -> f32 { return x - floor(x * (1.0 / 289.0)) * 289.0; }
fn mod289_v4(x: vec4f) -> vec4f { return x - floor(x * (1.0 / 289.0)) * 289.0; }
fn perm_v4(x: vec4f) -> vec4f { return mod289_v4((x * 34.0 + 1.0) * x); }

fn noise3(p: vec3f) -> f32 {
  let a = floor(p);
  var d = p - a;
  d = d * d * (3.0 - 2.0 * d);
  let b = a.xxyy + vec4f(0.0, 1.0, 0.0, 1.0);
  let k1 = perm_v4(b.xyxy);
  let k2 = perm_v4(k1.xyxy + b.zzww);
  let c = k2 + a.zzzz;
  let k3 = perm_v4(c);
  let k4 = perm_v4(c + 1.0);
  let o1 = fract(k3 * (1.0 / 41.0));
  let o2 = fract(k4 * (1.0 / 41.0));
  let o3 = o2 * d.z + o1 * (1.0 - d.z);
  let o4 = o3.yw * d.x + o3.xz * (1.0 - d.x);
  return o4.y * d.y + o4.x * (1.0 - d.y);
}

const M3: mat3x3f = mat3x3f(
  vec3f(0.00, 0.80, 0.60),
  vec3f(-0.80, 0.36, -0.48),
  vec3f(-0.60, -0.48, 0.64)
);

fn fbm_4(x: vec3f) -> f32 {
  var p = x;
  var f = 2.0;
  let s = 0.5;
  var a = 0.0;
  var b = 0.5;
  for (var i = 0; i < 4; i++) {
    let n = noise3(p);
    a += b * n;
    b *= s;
    p = f * M3 * p;
  }
  return a;
}`;

export const VORONOI_WGSL = `fn voronoi3(x: vec3f) -> vec3f {
  let p = floor(x);
  let f = fract(x);
  var id = 0.0;
  var res = vec2f(100.0);
  for (var k = -1; k <= 1; k++) {
    for (var j = -1; j <= 1; j++) {
      for (var i = -1; i <= 1; i++) {
        let b = vec3f(f32(i), f32(j), f32(k));
        let r = b - f + hash3(p + b);
        let d = dot(r, r);
        if (d < res.x) {
          id = dot(p + b, vec3f(1.0, 57.0, 113.0));
          res = vec2f(d, res.x);
        } else if (d < res.y) {
          res.y = d;
        }
      }
    }
  }
  return vec3f(sqrt(res), abs(id));
}`;

export const PLANET_TYPES_WGSL = `struct PlanetSample {
  unit_dir: vec3f,
  height_meters: f32,
  water_height_meters: f32,
  world_radius_meters: f32,
  distortion: f32,
  vor: vec3f,
  detail: f32,
  erosion_value: f32,
  world_pos: vec3f,
}

struct ScaleContext {
  camera_altitude_meters: f32,
  distance_to_camera_meters: f32,
  meters_per_pixel: f32,
  max_feature_frequency: f32,
  mode: u32,
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
}

struct PlanetParams {
  radius: f32,
  voronoi_scale: f32,
  voronoi_amplitude: f32,
  voronoi_albedo: f32,
  voronoi_albedo_y: f32,
  voronoi_albedo_z: f32,
  voronoi_distortion_scale: f32,
  voronoi_distortion_amplitude: f32,
  voronoi_distortion_albedo: f32,
  detail_scale: f32,
  detail_amplitude: f32,
  detail_albedo: f32,
  water_level: f32,
  render_water: f32,
  erosion: f32,
  sand_cutoff: f32,
  vegetation_level: f32,
  snow_cover: f32,
  texture_noise_scale: f32,
  texture_noise_amplitude: f32,
  polar_scale: f32,
  polar_amplitude: f32,
  illumination: f32,
  time: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
}`;

export const KERNEL_HELPERS_WGSL = `fn should_eval_layer(min_mpp_ratio: f32, scale: ScaleContext, radius: f32) -> bool {
  return scale.meters_per_pixel <= min_mpp_ratio * radius;
}

fn rotate_vector_by_quat(q: vec4f, v: vec3f) -> vec3f {
  let temp = cross(q.xyz, v) + q.w * v;
  return v + 2.0 * cross(q.xyz, temp);
}

fn rotate_vector_by_quat_inv(q: vec4f, v: vec3f) -> vec3f {
  let temp = cross(-q.xyz, v) + q.w * v;
  return v + 2.0 * cross(-q.xyz, temp);
}`;

export const SAMPLE_PLANET_WGSL = `fn sample_planet(unit_dir: vec3f, params: PlanetParams, scale: ScaleContext) -> PlanetSample {
  var p = unit_dir;
  var r: PlanetSample;
  r.unit_dir = unit_dir;

  let v_amp = params.voronoi_amplitude * params.radius;
  let d_amp = params.detail_amplitude * params.radius;
  let total_amplitude = v_amp + d_amp;
  let wl = total_amplitude * (params.water_level - 0.5);

  var distortion = 0.0;
  if (should_eval_layer(5.0, scale, params.radius) && params.voronoi_distortion_scale > 0.0) {
    distortion = fbm_4(p * params.voronoi_distortion_scale);
  }
  r.distortion = distortion;

  var vor = vec3f(0.5);
  if (should_eval_layer(10.0, scale, params.radius)) {
    vor = voronoi3(p * params.voronoi_scale + (distortion - 0.5) * params.voronoi_distortion_amplitude);
  }
  r.vor = vor;

  var detail = 0.5;
  if (should_eval_layer(0.5, scale, params.radius) && params.detail_scale > 0.0) {
    detail = fbm_4(p * params.detail_scale);
  }
  r.detail = detail;

  var height = (vor.x - 0.5) * v_amp + (detail - 0.5) * d_amp;
  var th = height - wl;
  var thf: f32;
  if (th > 0.0) {
    thf = total_amplitude - wl;
  } else {
    thf = wl - params.radius;
  }
  th /= thf;
  th = pow(th, params.erosion);
  r.erosion_value = th;
  th *= thf;
  height = wl + th;
  r.height_meters = height;
  r.water_height_meters = wl;

  var radius = params.radius + height;
  r.world_radius_meters = radius;
  r.world_pos = p * radius;
  return r;
}`;

export const MATERIAL_TYPES_WGSL = `struct BiomeProps {
  roughness: f32,
  metallic: f32,
  ior: f32,
}

struct SurfaceMaterial {
  albedo: vec3f,
  roughness: f32,
  metallic: f32,
  ior: f32,
  biome_id: u32,
}

struct MaterialOverrides {
  exposure: f32,
  roughness_mult: f32,
  water_gloss: f32,
  material_debug: f32,
  fog_density: f32,
  shadows_enabled: f32,
  shadow_fill: f32,
  object_opacity: f32,
  height_blend: f32,
  displacement_blend: f32,
  shadow_softness: f32,
  shadow_steps: f32,
}`;
