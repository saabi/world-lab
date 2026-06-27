/** WGSL module `noise.worley` — 3D Worley/cellular noise (matches graph evalCPU). */
export const NOISE_WORLEY_SOURCE = `fn worley_hash3(ix: i32, iy: i32, iz: i32) -> f32 {
	var n: u32 = u32(ix * 374761393 + iy * 668265263 + iz * 1274126177);
	n = (n ^ (n >> 13u)) * 1274126177u;
	n = n ^ (n >> 16u);
	return f32(n & 65535u) / 65535.0;
}

fn worley(position: vec3<f32>) -> f32 {
	let x = position.x;
	let y = position.y;
	let z = position.z;
	let xi = i32(floor(x));
	let yi = i32(floor(y));
	let zi = i32(floor(z));
	let xf = x - floor(x);
	let yf = y - floor(y);
	let zf = z - floor(z);

	var minDist = 1.0;
	for (var k = -1; k <= 1; k = k + 1) {
		for (var j = -1; j <= 1; j = j + 1) {
			for (var i = -1; i <= 1; i = i + 1) {
				let fp_x = worley_hash3(xi + i, yi + j, zi + k);
				let fp_y = worley_hash3(yi + j, zi + k, xi + i);
				let fp_z = worley_hash3(zi + k, xi + i, yi + j);
				let dx = f32(i) + fp_x - xf;
				let dy = f32(j) + fp_y - yf;
				let dz = f32(k) + fp_z - zf;
				let dist = sqrt(dx * dx + dy * dy + dz * dz);
				minDist = min(minDist, dist);
			}
		}
	}
	return minDist;
}`;

export const NOISE_WORLEY_MODULE = {
	id: 'noise.worley',
	source: NOISE_WORLEY_SOURCE
} as const;
