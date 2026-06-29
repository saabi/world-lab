/** WGSL module `math.min` — scalar min (matches graph evalCPU). */
export const MATH_MIN_SOURCE = `fn mathMin(a: f32, b: f32) -> f32 {
	return min(a, b);
}`;

export const MATH_MIN_MODULE = {
	id: 'math.min',
	source: MATH_MIN_SOURCE
} as const;
