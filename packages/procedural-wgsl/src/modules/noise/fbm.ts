/** WGSL module `noise.fbm` — fractal Perlin sum (matches graph evalCPU). */
export const NOISE_FBM_SOURCE = `fn fbm(position: vec3<f32>, octaves: f32, persistence: f32, lacunarity: f32) -> f32 {
	var value = 0.0;
	var amplitude = 1.0;
	var frequency = 1.0;
	var maxValue = 0.0;
	let octaveCount = i32(octaves);
	for (var i = 0; i < octaveCount; i = i + 1) {
		value = value + amplitude * perlin3d(position * frequency);
		maxValue = maxValue + amplitude;
		amplitude = amplitude * persistence;
		frequency = frequency * lacunarity;
	}
	return value / maxValue;
}`;

export const NOISE_FBM_MODULE = {
	id: 'noise.fbm',
	source: NOISE_FBM_SOURCE,
	dependencies: ['noise.perlin3d']
} as const;
