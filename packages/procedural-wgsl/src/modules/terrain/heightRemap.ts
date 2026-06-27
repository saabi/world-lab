import { PLANET_TYPES_WGSL } from './wgslSnippets.js';

/** WGSL module `terrain.heightRemap` — height + water + erosion remap → world radius. */
export const TERRAIN_HEIGHT_REMAP_SOURCE = `/*---
id: terrain.heightRemap
entry: heightRemap
category: Terrain
group: Domain
---*/
${PLANET_TYPES_WGSL}

fn heightRemap(vor: vec3f, detail: f32, params: PlanetParams) -> f32 {
  let v_amp = params.voronoi_amplitude * params.radius;
  let d_amp = params.detail_amplitude * params.radius;
  let total_amplitude = v_amp + d_amp;
  let wl = total_amplitude * (params.water_level - 0.5);

  var height = (vor.x - 0.5) * v_amp + (detail - 0.5) * d_amp;
  var th = height - wl;
  var thf: f32;
  if (th > 0.0) {
    thf = total_amplitude - wl;
  } else {
    thf = wl - params.radius;
  }
  th /= thf;
  th = pow(th, params.erosion);
  th *= thf;
  height = wl + th;
  return params.radius + height;
}`;

export const TERRAIN_HEIGHT_REMAP_MODULE = {
	id: 'terrain.heightRemap',
	source: TERRAIN_HEIGHT_REMAP_SOURCE
} as const;
