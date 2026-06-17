#include "../planet/types.wgsl"
#include "../common/frame.wgsl"

struct FrustumPlane {
  normal: vec3f,
  dist: f32,
}

struct CullUniforms {
  planes: array<FrustumPlane, 6>,
  camera_pos: vec4f,
  planet_radius: f32,
  backface_dot: f32,
  horizon_dot: f32,
  use_horizon_cull: u32,
  patch_count: u32,
  _pad0: u32,
  _pad1: u32,
}

@group(0) @binding(0) var<uniform> cull_u: CullUniforms;
@group(0) @binding(1) var<storage, read> patches_in: array<CubeSpherePatchGpu>;
@group(0) @binding(2) var<storage, read_write> patches_out: array<CubeSpherePatchGpu>;
@group(0) @binding(3) var<storage, read_write> visible_count: atomic<u32>;

fn patch_center_dir(patch_desc: CubeSpherePatchGpu) -> vec3f {
  let u = (patch_desc.uv_min_x + patch_desc.uv_max_x) * 0.5;
  let v = (patch_desc.uv_min_y + patch_desc.uv_max_y) * 0.5;
  return cube_face_uv_to_unit_dir(patch_desc.face, u, v);
}

fn patch_corner_dir(patch_desc: CubeSpherePatchGpu, corner: u32) -> vec3f {
  var u = patch_desc.uv_min_x;
  var v = patch_desc.uv_min_y;
  switch corner {
    case 1u: { u = patch_desc.uv_max_x; v = patch_desc.uv_min_y; }
    case 2u: { u = patch_desc.uv_max_x; v = patch_desc.uv_max_y; }
    case 3u: { u = patch_desc.uv_min_x; v = patch_desc.uv_max_y; }
    default: {}
  }
  return cube_face_uv_to_unit_dir(patch_desc.face, u, v);
}

fn patch_fully_outside_frustum(patch_desc: CubeSpherePatchGpu) -> bool {
  let radius = cull_u.planet_radius;
  for (var pi: u32 = 0u; pi < 6u; pi = pi + 1u) {
    let plane = cull_u.planes[pi];
    var all_outside = true;
    for (var c: u32 = 0u; c < 4u; c = c + 1u) {
      let dir = patch_corner_dir(patch_desc, c);
      let world = dir * radius;
      let d = dot(plane.normal, world) + plane.dist;
      if (d >= 0.0) {
        all_outside = false;
      }
    }
    if (all_outside) {
      return true;
    }
  }
  return false;
}

fn patch_visible(patch_desc: CubeSpherePatchGpu) -> bool {
  let center_dir = patch_center_dir(patch_desc);
  let cam_dir = normalize(cull_u.camera_pos.xyz);
  if (dot(center_dir, cam_dir) < cull_u.backface_dot) {
    return false;
  }
  if (patch_fully_outside_frustum(patch_desc)) {
    return false;
  }
  if (cull_u.use_horizon_cull != 0u && dot(center_dir, cam_dir) < cull_u.horizon_dot) {
    return false;
  }
  return true;
}

@compute @workgroup_size(64)
fn cs_main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= cull_u.patch_count) {
    return;
  }
  let patch_desc = patches_in[i];
  if (!patch_visible(patch_desc)) {
    return;
  }
  let out_idx = atomicAdd(&visible_count, 1u);
  patches_out[out_idx] = patch_desc;
}
