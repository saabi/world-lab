import {
	FBM_WGSL,
	HASH_WGSL,
	KERNEL_HELPERS_WGSL,
	PLANET_TYPES_WGSL,
	VORONOI_WGSL
} from './wgslSnippets.js';

const SHADOW_BODY = `const SHADOW_STEPS_MIN: u32 = 4u;
const SHADOW_STEPS_MAX: u32 = 64u;

fn sample_shadow_height(unit_dir: vec3f, params: PlanetParams) -> f32 {
  let v_amp = params.voronoi_amplitude * params.radius;
  let d_amp = params.detail_amplitude * params.radius;
  let total_amplitude = v_amp + d_amp;
  let wl = total_amplitude * (params.water_level - 0.5);

  var distortion = 0.0;
  if (params.voronoi_distortion_scale > 0.0) {
    distortion = fbm_4(unit_dir * params.voronoi_distortion_scale);
  }
  let vor = voronoi3(unit_dir * params.voronoi_scale + (distortion - 0.5) * params.voronoi_distortion_amplitude);

  var height = (vor.x - 0.5) * v_amp;
  var th = height - wl;
  var thf: f32;
  if (th > 0.0) {
    thf = total_amplitude - wl;
  } else {
    thf = wl - params.radius;
  }
  th /= thf;
  th = pow(th, params.erosion);
  th *= thf;
  height = wl + th;

  var radius = params.radius + height;
  return radius;
}

fn selfShadow(
  surface_pos: vec3f,
  sun_dir: vec3f,
  params: PlanetParams,
  meters_per_pixel: f32,
  planet_rot: vec4f,
  softness: f32,
  step_count: f32,
) -> f32 {
  let n = normalize(surface_pos);
  let sun_elev = dot(n, sun_dir);
  if (sun_elev <= 0.0) {
    return 0.0;
  }

  let total_amplitude = (params.voronoi_amplitude + params.detail_amplitude) * params.radius;
  if (total_amplitude <= 0.0) {
    return 1.0;
  }

  let bias = max(meters_per_pixel * 1.5, total_amplitude * 0.01);
  let max_dist = total_amplitude / max(sun_elev, 0.08);
  let steps = u32(clamp(step_count, f32(SHADOW_STEPS_MIN), f32(SHADOW_STEPS_MAX)));
  let step = max_dist / f32(steps);

  let k = mix(60.0, 4.0, clamp(softness, 0.0, 1.0));
  var shade = 1.0;
  var t = bias + step;
  for (var i = 0u; i < steps; i++) {
    let p = surface_pos + sun_dir * t;
    let surf_r = sample_shadow_height(rotate_vector_by_quat_inv(planet_rot, normalize(p)), params);
    let clearance = length(p) - surf_r;
    if (clearance < 0.0) {
      return 0.0;
    }
    shade = min(shade, k * clearance / t);
    t += step;
  }
  return clamp(shade, 0.0, 1.0);
}`;

/** WGSL module `terrain.selfShadow` — terrain_sun_shadow from planet shadow.wgsl. */
export const TERRAIN_SELF_SHADOW_SOURCE = `/*---
id: terrain.selfShadow
entry: selfShadow
category: Terrain
group: Domain
---*/
${HASH_WGSL}
${FBM_WGSL}
${VORONOI_WGSL}
${PLANET_TYPES_WGSL}
${KERNEL_HELPERS_WGSL}
${SHADOW_BODY}`;

export const TERRAIN_SELF_SHADOW_MODULE = {
	id: 'terrain.selfShadow',
	source: TERRAIN_SELF_SHADOW_SOURCE
} as const;
