/** WGSL module `transform.rotate` — Euler XYZ rotation (Rx→Ry→Rz), matching `plane_grid_euler_rotate`. */
export const TRANSFORM_ROTATE_SOURCE = `/*---
id: transform.rotate
entry: rotate
category: transform
role: positionTransform
help: Rotate a position by Euler XYZ angles in radians (Rx, then Ry, then Rz).
usage: Wire a position; set rotationX/Y/Z params. Identity angles pass position through unchanged.
inputs:
  position:
outputs:
  position:
params:
  rotationX: { default: 0 }
  rotationY: { default: 0 }
  rotationZ: { default: 0 }
---*/
fn euler_rotate(p: vec3<f32>, rotX: f32, rotY: f32, rotZ: f32) -> vec3<f32> {
	var x = p.x;
	var y = p.y;
	var z = p.z;

	let cosX = cos(rotX);
	let sinX = sin(rotX);
	let y1 = y * cosX - z * sinX;
	let z1 = y * sinX + z * cosX;
	y = y1;
	z = z1;

	let cosY = cos(rotY);
	let sinY = sin(rotY);
	let x1 = x * cosY + z * sinY;
	let z2 = -x * sinY + z * cosY;
	x = x1;
	z = z2;

	let cosZ = cos(rotZ);
	let sinZ = sin(rotZ);
	let x2 = x * cosZ - y * sinZ;
	let y2 = x * sinZ + y * cosZ;
	return vec3<f32>(x2, y2, z);
}

fn rotate(position: vec3<f32>, rotationX: f32, rotationY: f32, rotationZ: f32) -> vec3<f32> {
	return euler_rotate(position, rotationX, rotationY, rotationZ);
}`;

export const TRANSFORM_ROTATE_MODULE = {
	id: 'transform.rotate',
	source: TRANSFORM_ROTATE_SOURCE
} as const;
