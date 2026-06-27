/** WGSL module `math.remap` — linear range remap (matches graph evalCPU). */
export const MATH_REMAP_SOURCE = `fn remap(x: f32, inMin: f32, inMax: f32, outMin: f32, outMax: f32) -> f32 {
	let t = (x - inMin) / (inMax - inMin);
	return outMin + t * (outMax - outMin);
}`;

export const MATH_REMAP_MODULE = {
	id: 'math.remap',
	source: MATH_REMAP_SOURCE
} as const;
