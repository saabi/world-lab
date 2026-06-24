// Transparent sea-level shells drawn after terrain into the shared scene depth buffer.
#include "../planet/eclipse.wgsl"

struct Uniforms {
	viewProj : mat4x4<f32>,
	lightPos : vec4<f32>,
	lightColor : vec4<f32>,
	ambient : vec4<f32>,
	waterGloss : f32,
	exposure : f32,
	waterOpacity : f32,
	waterDebug : u32,
	viewport : vec2<f32>,
	time : f32,
	waveStrength : f32,
	glintStrength : f32,
	absorptionStrength : f32,
	foamStrength : f32,
	shoreWidth : f32,
	invViewProj : mat4x4<f32>,
};

@group(0) @binding(0) var<uniform> u : Uniforms;
@group(0) @binding(1) var<uniform> eclipse : EclipseUniforms;
@group(1) @binding(0) var scene_depth : texture_depth_2d;
@group(1) @binding(1) var scene_color : texture_2d<f32>;
@group(1) @binding(2) var scene_sampler : sampler;

const SHALLOW_WATER : vec3f = vec3f(0.12, 0.35, 0.55);
const DEEP_WATER : vec3f = vec3f(0.01, 0.04, 0.12);
const FOAM_TINT : vec3f = vec3f(0.72, 0.9, 1.0);

struct VSIn {
	@location(0) pos : vec3f,
	@location(1) normal : vec3f,
	@location(2) m0 : vec4<f32>,
	@location(3) m1 : vec4<f32>,
	@location(4) m2 : vec4<f32>,
	@location(5) m3 : vec4<f32>,
};

struct VSOut {
	@builtin(position) clip : vec4<f32>,
	@location(0) normal : vec3<f32>,
	@location(1) worldPos : vec3<f32>,
	@location(2) localDir : vec3<f32>,
};

struct CopyVSOut {
	@builtin(position) clip : vec4<f32>,
	@location(0) uv : vec2<f32>,
};

struct WaveState {
	normal : vec3f,
	crest : f32,
	slope : f32,
};

@vertex
fn vs_fullscreen(@builtin(vertex_index) vid : u32) -> CopyVSOut {
	let pos = array<vec2f, 3>(
		vec2f(-1.0, -1.0),
		vec2f(3.0, -1.0),
		vec2f(-1.0, 3.0)
	);
	let p = pos[vid];
	var out : CopyVSOut;
	out.clip = vec4f(p, 0.0, 1.0);
	out.uv = vec2f(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
	return out;
}

@fragment
fn fs_copy_scene(in : CopyVSOut) -> @location(0) vec4<f32> {
	return textureSampleLevel(scene_color, scene_sampler, in.uv, 0.0);
}

@vertex
fn vs(in : VSIn) -> VSOut {
	let model = mat4x4<f32>(in.m0, in.m1, in.m2, in.m3);
	let unit = normalize(in.pos);
	let world = model * vec4<f32>(unit, 1.0);
	var out : VSOut;
	out.clip = u.viewProj * vec4<f32>(world.xyz, 1.0);
	out.normal = normalize(world.xyz - model[3].xyz);
	out.worldPos = world.xyz;
	out.localDir = unit;
	return out;
}

fn water_latlong_grid(dir: vec3f) -> vec3f {
	let d = normalize(dir);
	let base = d * 0.5 + 0.5;
	let lat = asin(clamp(d.y, -1.0, 1.0));
	let lon = atan2(d.z, d.x);
	let step = radians(15.0);
	let lat_u = lat / step;
	let lon_u = lon / step;
	let lat_d = abs(fract(lat_u + 0.5) - 0.5);
	let lon_d = abs(fract(lon_u + 0.5) - 0.5);
	let lat_aa = max(fwidth(lat_u) * 0.75, 1e-5);
	let lon_aa = max(fwidth(lon_u) * 0.75, 1e-5);
	let line = max(1.0 - smoothstep(0.0, lat_aa, lat_d), 1.0 - smoothstep(0.0, lon_aa, lon_d));
	return mix(base, vec3f(1.0), line);
}

fn wave_state(in : VSOut, base_n : vec3f) -> WaveState {
	let d = normalize(in.localDir);
	let lat = asin(clamp(d.y, -1.0, 1.0));
	let lon = atan2(d.z, d.x);
	let t = u.time * 0.14;
	let w0 = sin(lon * 18.0 + lat * 7.0 + t * 1.4);
	let w1 = sin(lon * -11.0 + lat * 15.0 + t * 0.9);
	let w2 = sin((lon + lat) * 26.0 - t * 1.7);
	let r0 = sin(lon * 73.0 + lat * 31.0 + t * 3.1);
	let r1 = sin(lon * -47.0 + lat * 69.0 - t * 2.4);
	let crest0 = pow(clamp(w0 * 0.5 + 0.5, 0.0, 1.0), 3.0);
	let crest1 = pow(clamp(w1 * 0.5 + 0.5, 0.0, 1.0), 4.0);
	let ripple = r0 * 0.08 + r1 * 0.06;
	let dx = w0 * 0.5 + w1 * 0.22 + w2 * 0.16 + ripple;
	let dy = w0 * -0.18 + w1 * 0.44 + w2 * 0.24 + r0 * 0.05 - r1 * 0.04;
	let tangent_a = cross(vec3f(0.0, 1.0, 0.0), base_n);
	let tangent_b = cross(vec3f(1.0, 0.0, 0.0), base_n);
	let tangent = normalize(select(tangent_b, tangent_a, dot(tangent_a, tangent_a) > 1e-4));
	let bitangent = normalize(cross(base_n, tangent));
	var out : WaveState;
	let strength = clamp(u.waveStrength, 0.0, 2.0);
	out.normal = normalize(base_n + (tangent * dx + bitangent * dy) * strength * 0.055);
	out.crest = clamp(crest0 * 0.65 + crest1 * 0.35 + ripple * 0.5, 0.0, 1.0);
	out.slope = clamp(length(vec2f(dx, dy)) * strength, 0.0, 1.0);
	return out;
}

fn reconstruct_rel_from_depth(uv: vec2f, depth: f32) -> vec3f {
	let ndc_x = uv.x * 2.0 - 1.0;
	let ndc_y = (1.0 - uv.y) * 2.0 - 1.0;
	let rel_h = u.invViewProj * vec4f(ndc_x, ndc_y, depth, 1.0);
	return rel_h.xyz / rel_h.w;
}

fn water_column_meters(in : VSOut, uv : vec2f, scene_depth_value : f32, depth_gap : f32) -> f32 {
	if (scene_depth_value >= 0.999999) {
		return 1500.0;
	}
	let scene_rel = reconstruct_rel_from_depth(uv, scene_depth_value);
	let column = distance(scene_rel, in.worldPos);
	let visible = select(0.0, 1.0, depth_gap >= -2.0e-5);
	return max(column, 0.0) * visible;
}

fn water_thickness(column_meters : f32) -> f32 {
	let absorption = max(u.absorptionStrength, 0.0);
	return clamp(1.0 - exp(-max(column_meters, 0.0) * 0.0018 * absorption), 0.0, 1.0);
}

fn shore_factor_from_thickness(thickness : f32) -> f32 {
	let shallow = 1.0 - thickness;
	let width = clamp(u.shoreWidth, 0.05, 0.9);
	return smoothstep(1.0 - width, 1.0, shallow);
}

fn foam_mask(in : VSOut, thickness : f32, wave : WaveState) -> f32 {
	let d = normalize(in.localDir);
	let lat = asin(clamp(d.y, -1.0, 1.0));
	let lon = atan2(d.z, d.x);
	let t = u.time * 0.2;
	let shore = shore_factor_from_thickness(thickness);
	let breakup = sin(lon * 91.0 + lat * 57.0 + t * 2.7) * 0.5 + 0.5;
	let streak = sin(lon * -37.0 + lat * 83.0 - t * 1.9) * 0.5 + 0.5;
	let patchMask = smoothstep(0.42, 0.88, breakup * 0.65 + streak * 0.35);
	let crest = smoothstep(0.48, 0.95, wave.crest + wave.slope * 0.35);
	return clamp(shore * patchMask * crest * max(u.foamStrength, 0.0), 0.0, 1.0);
}

fn shade_water(in : VSOut, column_meters : f32, background : vec3f) -> vec3<f32> {
	let shell_n = normalize(in.normal);
	let wave = wave_state(in, shell_n);
	let n = wave.normal;
	let l = normalize(u.lightPos.xyz - in.worldPos);
	let v = normalize(-in.worldPos);
	let r = reflect(-l, n);
	let ndl = max(dot(n, l), 0.0);
	let ndv = max(dot(n, v), 0.0);
	let eclipse_vis = body_eclipse_visibility(in.worldPos, eclipse);
	let rough = clamp(0.045 / max(u.waterGloss, 0.1), 0.012, 0.35);
	let glint = pow(max(dot(r, v), 0.0), mix(24.0, 420.0, 1.0 - rough));
	let fresnel = pow(1.0 - ndv, 5.0);
	let thickness = water_thickness(column_meters);
	let shore = shore_factor_from_thickness(thickness);
	let foam = foam_mask(in, thickness, wave);
	let shallow = 1.0 - thickness;
	let grazing = pow(1.0 - ndv, 2.0);
	let base = mix(SHALLOW_WATER, DEEP_WATER, thickness);
	let absorb = mix(vec3f(0.9, 0.97, 1.0), vec3f(0.08, 0.22, 0.5), thickness);
	let transmitted = background * absorb;
	let lit = u.ambient.rgb * 0.45 + u.lightColor.rgb * u.lightColor.w * ndl * eclipse_vis;
	let diffuse = base * lit * (0.12 + thickness * 0.45);
	let rim_scatter = SHALLOW_WATER * fresnel * (0.5 + 0.7 * grazing);
	let foam_hint = FOAM_TINT * (foam * 0.85 + shore * 0.05);
	let specular = u.lightColor.rgb * u.lightColor.w * glint * eclipse_vis * u.glintStrength * (0.08 + 1.4 * fresnel);
	let surface = (diffuse + rim_scatter + foam_hint + specular) * u.exposure;
	let surface_mix = clamp(u.waterOpacity * (0.18 + 0.55 * thickness + 0.45 * fresnel + foam * 0.5), 0.0, 1.0);
	return mix(transmitted, surface, surface_mix);
}

fn is_camera_facing_shell(in : VSOut) -> bool {
	let n = normalize(in.normal);
	let to_camera = normalize(-in.worldPos);
	return dot(n, to_camera) > 0.0;
}

@fragment
fn fs_water(in : VSOut) -> @location(0) vec4<f32> {
	if (!is_camera_facing_shell(in)) {
		discard;
	}
	let scene_d = textureLoad(scene_depth, frag_texel(in.clip), 0);
	let water_d = in.clip.z;
	let depth_gap = scene_d - water_d;
	if (depth_gap < -2.0e-5) {
		discard;
	}
	let size = textureDimensions(scene_color);
	let texel = frag_texel(in.clip);
	let uv = (vec2f(f32(texel.x), f32(texel.y)) + vec2f(0.5)) / vec2f(size);
	let background = textureSampleLevel(scene_color, scene_sampler, uv, 0.0).rgb;
	let column_meters = water_column_meters(in, uv, scene_d, depth_gap);
	var rgb = shade_water(in, column_meters, background);
	if (u.waterDebug == 1u) {
		rgb = vec3f(0.1, 0.85, 1.0);
	} else if (u.waterDebug == 2u) {
		rgb = water_latlong_grid(in.normal);
	} else if (u.waterDebug == 3u) {
		let t = water_thickness(column_meters);
		rgb = mix(vec3f(0.0, 0.05, 0.12), vec3f(0.0, 0.55, 1.0), t);
	} else if (u.waterDebug == 4u) {
		let s = shore_factor_from_thickness(water_thickness(column_meters));
		rgb = vec3f(s);
	} else if (u.waterDebug == 5u) {
		let wave = wave_state(in, normalize(in.normal));
		rgb = wave.normal * 0.5 + 0.5;
	} else if (u.waterDebug == 6u) {
		let thickness = water_thickness(column_meters);
		let wave = wave_state(in, normalize(in.normal));
		let foam = foam_mask(in, thickness, wave);
		rgb = vec3f(foam);
	}
	return vec4<f32>(rgb, 1.0);
}

fn frag_texel(frag : vec4<f32>) -> vec2<i32> {
	let size = textureDimensions(scene_depth);
	let max_xy = vec2f(vec2<u32>(max(size.x, 1u), max(size.y, 1u))) - vec2f(1.0);
	return vec2<i32>(clamp(floor(frag.xy), vec2f(0.0), max_xy));
}

@fragment
fn fs_depth_debug(in : VSOut) -> @location(0) vec4<f32> {
	if (!is_camera_facing_shell(in)) {
		discard;
	}
	// In fragment stage @builtin(position) is framebuffer position with depth in z.
	let scene_d = textureLoad(scene_depth, frag_texel(in.clip), 0);
	let water_d = in.clip.z;
	let delta = scene_d - water_d;
	let eps = 2.0e-5;
	if (delta > eps) {
		return vec4f(0.1, 0.85, 1.0, 0.88);
	}
	if (delta < -eps) {
		return vec4f(1.0, 0.08, 0.04, 0.88);
	}
	return vec4f(1.0, 0.9, 0.05, 0.88);
}
