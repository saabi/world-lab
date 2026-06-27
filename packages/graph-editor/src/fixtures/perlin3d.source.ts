/** Default WGSL+YAML source for `noise.perlin3d` (matches compiler gate fixture). */
export const NOISE_PERLIN3D_SOURCE = `/*---
id: noise.perlin3d
entry: perlin3d
category: Noise
description: Classic Perlin noise over a 3D position.
pure: true
deterministic: true
color: "#5d8cff"
icon: perlin
keywords: [noise, fbm]

sections:
  - { id: frequency, label: Frequency, order: 10, collapsed: false }

inputs:
  position:
    semantic: body-direction
    space: body_dir
    unit: none

params:
  scale:
    unit: 1/m
    widget: slider
    min: 0.0001
    max: 1
    default: 0.002
    section: frequency
    scaleBehavior: freq

outputs:
  value:
    semantic: scalar-field
    range: [0, 1]
---*/
// @use noise.hash
fn perlin3d(position: vec3<f32>, scale: f32) -> f32 {
	return 0.0;
}
`;
