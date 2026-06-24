import type { Vec3 } from '../math/vec.js';
import { cubeFaceUvToUnitDir } from './cubeSphere.js';
import type { CubeSpherePatch } from './types.js';
import type { Quat } from '../scene/types.js';
import { IDENTITY_QUAT, rotateVec3 } from '../scene/transform.js';

export function bodyDirToWorldDir(bodyDir: Vec3, planetRotation: Quat = IDENTITY_QUAT): Vec3 {
	return rotateVec3(planetRotation, bodyDir);
}

export function bodyDirToWorldPos(
	bodyDir: Vec3,
	planetRadius: number,
	planetRotation: Quat = IDENTITY_QUAT
): Vec3 {
	const d = bodyDirToWorldDir(bodyDir, planetRotation);
	return [d[0] * planetRadius, d[1] * planetRadius, d[2] * planetRadius];
}

export interface ViewportSize {
	width: number;
	height: number;
}

export interface ProjectedPoint {
	ndc: [number, number];
	screenPx: [number, number];
	behindCamera: boolean;
}

export interface ScreenBounds {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
	anyVisible: boolean;
	/** At least one sampled corner projected behind the camera (near-plane straddle). */
	anyBehind?: boolean;
}

/** Column-major mat4 × vec3 (w=1). */
function transformPoint4(m: Float32Array, p: Vec3): [number, number, number, number] {
	const [x, y, z] = p;
	return [
		m[0] * x + m[4] * y + m[8] * z + m[12],
		m[1] * x + m[5] * y + m[9] * z + m[13],
		m[2] * x + m[6] * y + m[10] * z + m[14],
		m[3] * x + m[7] * y + m[11] * z + m[15]
	];
}

export function projectWorldPoint(
	viewProj: Float32Array,
	viewport: ViewportSize,
	worldPos: Vec3
): ProjectedPoint {
	const [cx, cy, cz, cw] = transformPoint4(viewProj, worldPos);
	if (cw <= 1e-6) {
		return { ndc: [0, 0], screenPx: [0, 0], behindCamera: true };
	}
	const invW = 1 / cw;
	const ndcX = cx * invW;
	const ndcY = cy * invW;
	const screenX = (ndcX * 0.5 + 0.5) * viewport.width;
	const screenY = (1 - (ndcY * 0.5 + 0.5)) * viewport.height;
	return {
		ndc: [ndcX, ndcY],
		screenPx: [screenX, screenY],
		behindCamera: false
	};
}

export function patchWorldCorners(
	patch: CubeSpherePatch,
	planetRadius: number,
	planetRotation: Quat = IDENTITY_QUAT
): Vec3[] {
	return patchSampleUvs(patch).map(([u, v]) => {
		const bodyDir = cubeFaceUvToUnitDir(patch.face, u, v);
		return bodyDirToWorldPos(bodyDir, planetRadius, planetRotation);
	});
}

/** Corners, edge midpoints, and center — conservative screen bounds on the limb. */
export function patchSampleUvs(patch: CubeSpherePatch): [number, number][] {
	const [u0, v0] = patch.uvMin;
	const [u1, v1] = patch.uvMax;
	const um = (u0 + u1) * 0.5;
	const vm = (v0 + v1) * 0.5;
	return [
		[u0, v0],
		[u1, v0],
		[u1, v1],
		[u0, v1],
		[um, vm],
		[um, v0],
		[um, v1],
		[u0, vm],
		[u1, vm]
	];
}

export function patchCornerUvs(patch: CubeSpherePatch): [number, number][] {
	const [u0, v0] = patch.uvMin;
	const [u1, v1] = patch.uvMax;
	return [
		[u0, v0],
		[u1, v0],
		[u1, v1],
		[u0, v1]
	];
}

export function patchScreenBounds(
	viewProj: Float32Array,
	viewport: ViewportSize,
	planetRadius: number,
	patch: CubeSpherePatch,
	options?: { cornersOnly?: boolean; planetRotation?: Quat }
): ScreenBounds {
	const sampleUvs = options?.cornersOnly ? patchCornerUvs(patch) : patchSampleUvs(patch);
	const rot = options?.planetRotation ?? IDENTITY_QUAT;
	const corners = sampleUvs.map(([u, v]) => {
		const bodyDir = cubeFaceUvToUnitDir(patch.face, u, v);
		return bodyDirToWorldPos(bodyDir, planetRadius, rot);
	});
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	let anyVisible = false;
	let anyBehind = false;

	for (const world of corners) {
		const proj = projectWorldPoint(viewProj, viewport, world);
		if (proj.behindCamera) {
			anyBehind = true;
			continue;
		}
		anyVisible = true;
		minX = Math.min(minX, proj.screenPx[0]);
		minY = Math.min(minY, proj.screenPx[1]);
		maxX = Math.max(maxX, proj.screenPx[0]);
		maxY = Math.max(maxY, proj.screenPx[1]);
	}

	if (!anyVisible) {
		return { minX: 0, minY: 0, maxX: 0, maxY: 0, anyVisible: false, anyBehind };
	}

	return { minX, minY, maxX, maxY, anyVisible, anyBehind };
}

export function patchScreenDiameterPx(bounds: ScreenBounds): number {
	if (!bounds.anyVisible) return 0;
	const w = bounds.maxX - bounds.minX;
	const h = bounds.maxY - bounds.minY;
	return Math.max(w, h);
}

export function patchScreenAreaPx(bounds: ScreenBounds): number {
	if (!bounds.anyVisible) return 0;
	return Math.max(0, bounds.maxX - bounds.minX) * Math.max(0, bounds.maxY - bounds.minY);
}

export function isScreenBoundsOutsideViewport(
	bounds: ScreenBounds,
	viewport: ViewportSize,
	marginPx = 0
): boolean {
	if (!bounds.anyVisible) return true;
	return (
		bounds.maxX < -marginPx ||
		bounds.minX > viewport.width + marginPx ||
		bounds.maxY < -marginPx ||
		bounds.minY > viewport.height + marginPx
	);
}

/** True when any projected corner lies on or near the viewport (partial overlap counts). */
export function patchIntersectsViewport(
	bounds: ScreenBounds,
	viewport: ViewportSize,
	marginPx = 64
): boolean {
	return bounds.anyVisible && !isScreenBoundsOutsideViewport(bounds, viewport, marginPx);
}
