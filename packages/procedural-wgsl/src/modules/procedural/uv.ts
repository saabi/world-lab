/** WGSL module `procedural.uv` — host UV passthrough (matches graph evalCPU). */
export const PROCEDURAL_UV_SOURCE = `fn uv(u: f32, v: f32) -> vec2<f32> {
	return vec2<f32>(u, v);
}`;

export const PROCEDURAL_UV_MODULE = {
	id: 'procedural.uv',
	source: PROCEDURAL_UV_SOURCE
} as const;
