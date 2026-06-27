/** WGSL module `surface.plane` — z=0 plane mapping (matches graph evalCPU). */
export const SURFACE_PLANE_SOURCE = `fn plane(uv: vec2<f32>) -> vec3<f32> {
	return vec3<f32>(2.0 * uv.x - 1.0, 2.0 * uv.y - 1.0, 0.0);
}

fn plane_normal(_uv: vec2<f32>) -> vec3<f32> {
	return vec3<f32>(0.0, 0.0, 1.0);
}`;

export const SURFACE_PLANE_MODULE = {
	id: 'surface.plane',
	source: SURFACE_PLANE_SOURCE
} as const;
