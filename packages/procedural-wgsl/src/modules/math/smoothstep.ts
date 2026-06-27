/** WGSL module `math.smoothstep` — Hermite smoothstep (matches graph evalCPU). */
export const MATH_SMOOTHSTEP_SOURCE = `fn smoothstep(x: f32, edge0: f32, edge1: f32) -> f32 {
	let t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
	return t * t * (3.0 - 2.0 * t);
}`;

export const MATH_SMOOTHSTEP_MODULE = {
	id: 'math.smoothstep',
	source: MATH_SMOOTHSTEP_SOURCE
} as const;
