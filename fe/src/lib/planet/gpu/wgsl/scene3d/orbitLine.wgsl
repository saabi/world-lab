// Unlit orbit ellipse polylines for the scene-3d viewport. Vertex positions are in the
// orbit parent's local frame (O(semi-major axis)); centerEye rebases to the camera in
// the vertex shader so AU-scale paths stay precise in f32.

struct Uniforms {
	viewProj : mat4x4<f32>,
	color : vec4<f32>,
	centerEye : vec4<f32>, // xyz = orbit-center relative to camera; w unused
};

@group(0) @binding(0) var<uniform> u : Uniforms;

struct VSOut {
	@builtin(position) clip : vec4<f32>,
};

struct FSOut {
	@location(0) color : vec4<f32>,
	@location(1) surface_t : f32,
};

@vertex
fn vs(@location(0) localPos : vec3<f32>) -> VSOut {
	var out : VSOut;
	let eyeRel = u.centerEye.xyz + localPos;
	out.clip = u.viewProj * vec4<f32>(eyeRel, 1.0);
	return out;
}

@fragment
fn fs() -> FSOut {
	var out : FSOut;
	out.color = u.color;
	out.surface_t = -1.0; // not a solid surface — atmosphere pass ignores these pixels
	return out;
}
