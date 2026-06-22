#include "../planet/material.wgsl"
#include "../planet/lighting.wgsl"

const DEBUG_OFF: u32 = 0u;
const DEBUG_NORMALS: u32 = 1u;
const DEBUG_ROUGHNESS: u32 = 2u;
const DEBUG_METALLIC: u32 = 3u;
const DEBUG_SPECULAR: u32 = 4u;
const DEBUG_IBL: u32 = 5u;
const DEBUG_BODY_DIR: u32 = 6u;
const DEBUG_LATLONG: u32 = 7u;

// Latitude/longitude grid drawn from the body-frame fragment direction. The base color
// is the direction encoded as RGB; bright iso-lines fall every `step` radians of lat and
// lon. This is the parity diagnostic from _docs/ideal-sphere-fragment-sampling.md: the
// grid is anchored to the body, so if the fragment coordinate is tessellation-dependent
// the lines visibly bow/shift between LOD levels; once fragment sampling uses the ideal
// sphere coordinate, the grid is stable. fwidth keeps line width constant on screen.
fn latlong_grid(dir: vec3f) -> vec3f {
  let d = normalize(dir);
  let base = d * 0.5 + 0.5;
  let lat = asin(clamp(d.y, -1.0, 1.0)); // [-pi/2, pi/2]
  let lon = atan2(d.z, d.x);             // [-pi, pi]
  let step = radians(15.0);
  let lat_u = lat / step;
  let lon_u = lon / step;
  let lat_d = abs(fract(lat_u + 0.5) - 0.5);
  let lon_d = abs(fract(lon_u + 0.5) - 0.5);
  let lat_aa = max(fwidth(lat_u) * 0.75, 1e-5);
  let lon_aa = max(fwidth(lon_u) * 0.75, 1e-5);
  let line = max(1.0 - smoothstep(0.0, lat_aa, lat_d), 1.0 - smoothstep(0.0, lon_aa, lon_d));
  return mix(base, vec3f(1.0), line);
}

fn apply_material_debug(
  mode: u32,
  n: vec3f,
  body_dir: vec3f,
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
    case DEBUG_BODY_DIR: {
      return normalize(body_dir) * 0.5 + 0.5;
    }
    case DEBUG_LATLONG: {
      return latlong_grid(body_dir);
    }
    default: {
      return lit.color;
    }
  }
}
