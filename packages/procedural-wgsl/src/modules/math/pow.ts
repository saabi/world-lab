/** WGSL module `math.pow` — scalar power (matches graph evalCPU; avoids shadowing builtin `pow`). */
export const MATH_POW_SOURCE = `fn pow(x: f32, exponent: f32) -> f32 {
	if (x == 0.0) {
		return 0.0;
	}
	if (x < 0.0) {
		let iexp = i32(round(exponent));
		if (abs(exponent - f32(iexp)) > 1e-5) {
			return 0.0 / 0.0;
		}
		let mag = exp(f32(iexp) * log(-x));
		return select(mag, -mag, (iexp & 1) != 0);
	}
	return exp(exponent * log(x));
}`;

export const MATH_POW_MODULE = {
	id: 'math.pow',
	source: MATH_POW_SOURCE
} as const;
