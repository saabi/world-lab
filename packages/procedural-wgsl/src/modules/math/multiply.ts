/** WGSL module `math.multiply` — scalar product (matches graph evalCPU). */
export const MATH_MULTIPLY_SOURCE = `fn multiply(a: f32, b: f32) -> f32 {
	return a * b;
}`;

export const MATH_MULTIPLY_MODULE = {
	id: 'math.multiply',
	source: MATH_MULTIPLY_SOURCE
} as const;
