/** WGSL module `math.max` — scalar max (matches graph evalCPU). */
export const MATH_MAX_SOURCE = `fn mathMax(a: f32, b: f32) -> f32 {
	return max(a, b);
}`;

export const MATH_MAX_MODULE = {
	id: 'math.max',
	source: MATH_MAX_SOURCE
} as const;
