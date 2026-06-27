/** WGSL module `math.add` — scalar sum (matches graph evalCPU). */
export const MATH_ADD_SOURCE = `fn add(a: f32, b: f32) -> f32 {
	return a + b;
}`;

export const MATH_ADD_MODULE = {
	id: 'math.add',
	source: MATH_ADD_SOURCE
} as const;
