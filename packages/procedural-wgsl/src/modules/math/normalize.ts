/** WGSL module `math.normalize` — unit-length vec3 (matches graph evalCPU). */
export const MATH_NORMALIZE_SOURCE = `fn normalizeVec3(v: vec3<f32>) -> vec3<f32> {
	let len = length(v);
	if (len < 1e-8) {
		return vec3<f32>(0.0, 0.0, 0.0);
	}
	return v / len;
}`;

export const MATH_NORMALIZE_MODULE = {
	id: 'math.normalize',
	source: MATH_NORMALIZE_SOURCE
} as const;
