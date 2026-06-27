/** WGSL module `surface.cubeFaceDir` — cube_face_uv_to_unit_dir from frame.wgsl. */
export const SURFACE_CUBE_FACE_DIR_SOURCE = `/*---
id: surface.cubeFaceDir
entry: cubeFaceDir
category: Surface
group: Domain
---*/
fn cube_face_uv_to_unit_dir(face: u32, u: f32, v: f32) -> vec3f {
  let a = u * 2.0 - 1.0;
  let b = v * 2.0 - 1.0;
  var pos = vec3f(0.0, 0.0, 1.0);
  switch (face) {
    case 0u: { pos = vec3f(1.0, b, -a); }
    case 1u: { pos = vec3f(-1.0, b, a); }
    case 2u: { pos = vec3f(a, 1.0, -b); }
    case 3u: { pos = vec3f(a, -1.0, b); }
    case 4u: { pos = vec3f(a, b, 1.0); }
    default: { pos = vec3f(-a, b, -1.0); }
  }
  return normalize(pos);
}

fn cubeFaceDir(face: u32, u: f32, v: f32) -> vec3f {
  return cube_face_uv_to_unit_dir(face, u, v);
}`;

export const SURFACE_CUBE_FACE_DIR_MODULE = {
	id: 'surface.cubeFaceDir',
	source: SURFACE_CUBE_FACE_DIR_SOURCE
} as const;
