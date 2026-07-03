/** WGSL module `surface.cubeSphere` — cube-face → unit sphere (matches graph evalCPU). */
import { CUBE_FACE_UV_TO_POINT_WGSL } from './cubeFaceCommon.js';

export const SURFACE_CUBE_SPHERE_SOURCE = `${CUBE_FACE_UV_TO_POINT_WGSL}

fn normalize3(v: vec3<f32>) -> vec3<f32> {
	let len = length(v);
	if (len == 0.0) {
		return vec3<f32>(0.0, 0.0, 1.0);
	}
	return v / len;
}

fn cubeSphere(uv: vec2<f32>, face: i32) -> vec3<f32> {
	return normalize3(cubeFaceUvToPoint(face, uv.x, uv.y));
}

fn cubeSphere_normal(uv: vec2<f32>, face: i32) -> vec3<f32> {
	return cubeSphere(uv, face);
}`;

export const SURFACE_CUBE_SPHERE_MODULE = {
	id: 'surface.cubeSphere',
	source: SURFACE_CUBE_SPHERE_SOURCE
} as const;
