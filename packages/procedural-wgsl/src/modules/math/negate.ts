/** WGSL module `math.negate` — scalar negation (matches graph evalCPU). */
export const MATH_NEGATE_SOURCE = `fn negate(a: f32) -> f32 {
	return -a;
}`;

export const MATH_NEGATE_MODULE = {
	id: 'math.negate',
	source: MATH_NEGATE_SOURCE
} as const;
