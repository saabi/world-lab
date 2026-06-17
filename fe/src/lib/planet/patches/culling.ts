import type { Vec3 } from '../math/vec.js';
import { dot3, len3, normalize3 } from '../math/vec.js';
import { cubeFaceUvToUnitDir } from './cubeSphere.js';
import { patchSampleUvs, patchWorldCorners } from './screenSpace.js';
import type { CubeSpherePatch } from './types.js';

export interface FrustumPlanes {
	planes: Vec3[];
	dists: number[];
}

export interface CullParams {
	backfaceDot: number;
	horizonDot: number;
	useHorizonCull: boolean;
}

export function extractFrustumPlanes(viewProj: Float32Array): FrustumPlanes {
	const planes: Vec3[] = [];
	const dists: number[] = [];
	const m = viewProj;
	const combos = [
		[m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]],
		[m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]],
		[m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]],
		[m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]],
		[m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]],
		[m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]]
	];
	for (const p of combos) {
		const l = Math.hypot(p[0], p[1], p[2]);
		planes.push([p[0] / l, p[1] / l, p[2] / l]);
		dists.push(p[3] / l);
	}
	return { planes, dists };
}

export function buildCullParams(cameraPos: Vec3, planetRadius: number): CullParams {
	const camLen = len3(cameraPos);
	const altRatio = Math.max(camLen - planetRadius, 0) / Math.max(planetRadius, 1);
	return {
		backfaceDot: altRatio < 0.3 ? -0.2 : altRatio < 1 ? -0.05 : 0.02,
		horizonDot: altRatio < 1 ? -0.05 : 0.08,
		useHorizonCull: camLen > planetRadius * 1.5 && altRatio >= 1
	};
}

export function patchCenterDir(patch: CubeSpherePatch): Vec3 {
	const u = (patch.uvMin[0] + patch.uvMax[0]) * 0.5;
	const v = (patch.uvMin[1] + patch.uvMax[1]) * 0.5;
	return cubeFaceUvToUnitDir(patch.face, u, v);
}

/** Any sample on the patch faces the camera hemisphere (limb-safe tile coverage). */
export function patchIntersectsFrontHemisphere(
	patch: CubeSpherePatch,
	cameraPos: Vec3,
	epsilon = -0.02
): boolean {
	const camDir = normalize3(cameraPos);
	for (const [u, v] of patchSampleUvs(patch)) {
		const dir = cubeFaceUvToUnitDir(patch.face, u, v);
		if (dot3(dir, camDir) > epsilon) return true;
	}
	return false;
}

export function isPatchBackfacing(
	patch: CubeSpherePatch,
	cameraPos: Vec3,
	params: CullParams
): boolean {
	const camDir = normalize3(cameraPos);
	return dot3(patchCenterDir(patch), camDir) < params.backfaceDot;
}

export function isPatchAboveHorizon(
	patch: CubeSpherePatch,
	cameraPos: Vec3,
	params: CullParams
): boolean {
	if (!params.useHorizonCull) return true;
	const camDir = normalize3(cameraPos);
	return dot3(patchCenterDir(patch), camDir) >= params.horizonDot;
}

/** True when the patch lies entirely outside one frustum plane (corner-based). */
export function isPatchFullyOutsideFrustum(
	patch: CubeSpherePatch,
	planetRadius: number,
	frustum: FrustumPlanes
): boolean {
	const corners = patchWorldCorners(patch, planetRadius);
	for (let i = 0; i < 6; i++) {
		let allOutside = true;
		for (const corner of corners) {
			const d = dot3(frustum.planes[i], corner) + frustum.dists[i];
			if (d >= 0) {
				allOutside = false;
				break;
			}
		}
		if (allOutside) return true;
	}
	return false;
}

export function isPatchInFrustum(
	patch: CubeSpherePatch,
	planetRadius: number,
	frustum: FrustumPlanes
): boolean {
	return !isPatchFullyOutsideFrustum(patch, planetRadius, frustum);
}

export function isPatchVisible(
	patch: CubeSpherePatch,
	cameraPos: Vec3,
	planetRadius: number,
	frustum: FrustumPlanes,
	params: CullParams
): boolean {
	if (isPatchBackfacing(patch, cameraPos, params)) return false;
	if (!isPatchInFrustum(patch, planetRadius, frustum)) return false;
	if (!isPatchAboveHorizon(patch, cameraPos, params)) return false;
	return true;
}

/** Legacy grid path — filter pre-built patches. */
export function cullCubeSpherePatches(
	patches: CubeSpherePatch[],
	cameraPos: Vec3,
	planetRadius: number,
	viewProj: Float32Array
): CubeSpherePatch[] {
	const frustum = extractFrustumPlanes(viewProj);
	const params = buildCullParams(cameraPos, planetRadius);
	return patches.filter((patch) => isPatchVisible(patch, cameraPos, planetRadius, frustum, params));
}
