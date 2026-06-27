/** WGSL module `math.clamp` — clamp scalar to [min, max] (matches graph evalCPU). */
export const MATH_CLAMP_SOURCE = `fn clamp(x: f32, min: f32, max: f32) -> f32 {
	return min(max, max(min, x));
}`;

export const MATH_CLAMP_MODULE = {
	id: 'math.clamp',
	source: MATH_CLAMP_SOURCE
} as const;
