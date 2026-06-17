#include "../planet/material.wgsl"
#include "../planet/lighting.wgsl"

const DEBUG_OFF: u32 = 0u;
const DEBUG_NORMALS: u32 = 1u;
const DEBUG_ROUGHNESS: u32 = 2u;
const DEBUG_METALLIC: u32 = 3u;
const DEBUG_SPECULAR: u32 = 4u;
const DEBUG_IBL: u32 = 5u;

fn apply_material_debug(
  mode: u32,
  n: vec3f,
  material: SurfaceMaterial,
  lit: LightingResult,
) -> vec3f {
  switch (mode) {
    case DEBUG_NORMALS: {
      return normalize(n) * 0.5 + 0.5;
    }
    case DEBUG_ROUGHNESS: {
      return vec3f(material.roughness);
    }
    case DEBUG_METALLIC: {
      return vec3f(material.metallic);
    }
    case DEBUG_SPECULAR: {
      return lit.direct_spec;
    }
    case DEBUG_IBL: {
      return lit.ibl_spec;
    }
    default: {
      return lit.color;
    }
  }
}
