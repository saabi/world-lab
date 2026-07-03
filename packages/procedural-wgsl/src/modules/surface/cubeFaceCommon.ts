/** Shared cube-face UV mapping (byte-identical to `surface.cubeSphere`'s inner mapping). */
export const CUBE_FACE_UV_TO_POINT_WGSL = `fn cubeFaceUvToPoint(face: i32, u: f32, v: f32) -> vec3<f32> {
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
}`;
