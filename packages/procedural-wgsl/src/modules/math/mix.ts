/** WGSL module `math.mix` — linear interpolation (matches graph evalCPU). */
export const MATH_MIX_SOURCE = `fn mix(a: f32, b: f32, t: f32) -> f32 {
	return a + (b - a) * t;
}`;

export const MATH_MIX_MODULE = {
	id: 'math.mix',
	source: MATH_MIX_SOURCE
} as const;
