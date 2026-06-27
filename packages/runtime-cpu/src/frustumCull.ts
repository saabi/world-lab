import type { Frustum, Vec3 } from './camera.js';

export interface BoundingSphere {
	center: Vec3;
	radius: number;
}

/** Keep spheres not fully outside any plane (inward-pointing planes from frustumFromViewProjection). */
export function cullSpheres<T extends { bounds: BoundingSphere }>(
	frustum: Frustum,
	items: T[]
): T[] {
	return items.filter((item) => {
		const { center, radius } = item.bounds;
		for (const { normal, constant } of frustum.planes) {
			const distance =
				normal[0] * center[0] + normal[1] * center[1] + normal[2] * center[2] + constant;
			if (distance < -radius) {
				return false;
			}
		}
		return true;
	});
}
