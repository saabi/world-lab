import { CUBE_FACE_UV_TO_POINT_WGSL } from './cubeFaceCommon.js';

/** WGSL module `surface.cubeFace` — raw cube-face position (matches graph evalCPU). */
export const SURFACE_CUBE_FACE_SOURCE = `${CUBE_FACE_UV_TO_POINT_WGSL}

fn cubeFace(uv: vec2<f32>, face: i32) -> vec3<f32> {
	return cubeFaceUvToPoint(face, uv.x, uv.y);
}`;

export const SURFACE_CUBE_FACE_MODULE = {
	id: 'surface.cubeFace',
	source: SURFACE_CUBE_FACE_SOURCE
} as const;
