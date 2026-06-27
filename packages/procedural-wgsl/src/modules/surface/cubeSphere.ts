/** WGSL module `surface.cubeSphere` — cube-face → unit sphere (matches graph evalCPU). */
export const SURFACE_CUBE_SPHERE_SOURCE = `fn cubeFaceUvToPoint(face: i32, u: f32, v: f32) -> vec3<f32> {
	let s = u * 2.0 - 1.0;
	let t = v * 2.0 - 1.0;
	switch face {
		case 0: { return vec3<f32>(1.0, t, -s); }
		case 1: { return vec3<f32>(-1.0, t, s); }
		case 2: { return vec3<f32>(s, 1.0, -t); }
		case 3: { return vec3<f32>(s, -1.0, t); }
		case 4: { return vec3<f32>(s, t, 1.0); }
		case 5: { return vec3<f32>(-s, t, -1.0); }
		default: { return vec3<f32>(0.0, 0.0, 1.0); }
	}
}

fn normalize3(v: vec3<f32>) -> vec3<f32> {
	let len = length(v);
	if (len == 0.0) {
		return vec3<f32>(0.0, 0.0, 1.0);
	}
	return v / len;
}

fn cubeSphere(uv: vec2<f32>, face: i32) -> vec3<f32> {
	return normalize3(cubeFaceUvToPoint(face, uv.x, uv.y));
}`;

export const SURFACE_CUBE_SPHERE_MODULE = {
	id: 'surface.cubeSphere',
	source: SURFACE_CUBE_SPHERE_SOURCE
} as const;
