import type { Vec3 } from '../math/vec.js';
import { dot3, len3, normalize3 } from '../math/vec.js';
import {
	chooseOrbitPatchResolution,
	cubeFaceUvToUnitDir,
	cubePatchVertexCount
} from './cubeSphere.js';
import type { CubeSpherePatch } from './types.js';
import { patchIntersectsFrontHemisphere } from './culling.js';
import {
	isScreenBoundsOutsideViewport,
	patchIntersectsViewport,
	patchScreenBounds,
	patchScreenAreaPx,
	patchScreenDiameterPx,
	type ViewportSize
} from './screenSpace.js';
import type { Quat } from '../scene/types.js';
import { IDENTITY_QUAT } from '../scene/transform.js';
import {
	composeScheduleViewProj,
	scheduleHemisphereCamDir
} from './orbitScheduleCoords.js';

export const RESOLUTION_LEVELS = [8, 16, 32, 64, 96] as const;

/** Cap for near-plane-straddling tiles so they cannot exhaust the vertex budget. */
const STRADDLE_MAX_RESOLUTION = 32;

/**
 * Cap the forced subdivision depth of near-plane-straddling tiles. They force
 * subdivision (diameterPx = ∞), which at full maxDepth produces a deep, expensive
 * limb band during low-altitude flight; bounding the depth keeps the band cheap.
 */
const STRADDLE_MAX_DEPTH = 4;

/** Screen margin for "near viewport" — patches partially off-screen still schedule. */
export const VIEWPORT_CULL_MARGIN_PX = 96;

function chooseMaxDepth(altitudeMeters: number, planetRadius: number): number {
	const altRatio = altitudeMeters / Math.max(planetRadius, 1);
	if (altRatio > 3) return 4;
	if (altRatio > 1) return 5;
	return 6;
}

export interface OrbitSchedulerInput {
	cameraPos: Vec3;
	planetRadius: number;
	viewProj: Float32Array;
	viewport: ViewportSize;
	targetVertexSpacingPx?: number;
	maxDepth?: number;
	maxPatchResolution?: number;
	planetRotation?: Quat;
}

interface QuadNode {
	face: CubeSpherePatch['face'];
	uvMin: [number, number];
	uvMax: [number, number];
	depth: number;
}

export interface ScheduledPatch extends CubeSpherePatch {
	priority: number;
}

function faceCenterDir(face: number): Vec3 {
	return cubeFaceUvToUnitDir(face, 0.5, 0.5);
}

function patchCenterDir(patch: CubeSpherePatch): Vec3 {
	const u = (patch.uvMin[0] + patch.uvMax[0]) * 0.5;
	const v = (patch.uvMin[1] + patch.uvMax[1]) * 0.5;
	return cubeFaceUvToUnitDir(patch.face, u, v);
}

/** @deprecated Prefer screen bounds at face root. Strongly back-facing only. */
export function isCubeFaceBackfacing(face: number, cameraPos: Vec3): boolean {
	const camDir = normalize3(cameraPos);
	return dot3(faceCenterDir(face), camDir) < -0.2;
}

export function isCubeFaceOnScreen(
	face: number,
	cameraPos: Vec3,
	planetRadius: number,
	viewProj: Float32Array,
	viewport: ViewportSize,
	marginPx = VIEWPORT_CULL_MARGIN_PX,
	planetRotation: Quat = IDENTITY_QUAT
): boolean {
	const schedViewProj = composeScheduleViewProj(viewProj, planetRotation);
	const hemiCamDir = scheduleHemisphereCamDir(cameraPos, planetRotation);
	const rootPatch = nodeToPatch(
		{ face: face as CubeSpherePatch['face'], uvMin: [0, 0], uvMax: [1, 1], depth: 0 },
		0,
		8
	);
	const bounds = patchScreenBounds(schedViewProj, viewport, planetRadius, rootPatch);
	return (
		patchIntersectsViewport(bounds, viewport, marginPx) ||
		patchIntersectsFrontHemisphere(rootPatch, hemiCamDir)
	);
}

function resolutionFromDiameter(diameterPx: number, targetPx: number, maxRes: number): number {
	const cells = Math.max(1, Math.ceil(diameterPx / targetPx));
	for (const res of RESOLUTION_LEVELS) {
		if (res >= cells && res <= maxRes) return res;
	}
	return Math.min(maxRes, RESOLUTION_LEVELS[RESOLUTION_LEVELS.length - 1]);
}

function subdivide(node: QuadNode): QuadNode[] {
	const [u0, v0] = node.uvMin;
	const [u1, v1] = node.uvMax;
	const um = (u0 + u1) * 0.5;
	const vm = (v0 + v1) * 0.5;
	const d = node.depth + 1;
	return [
		{ face: node.face, uvMin: [u0, v0], uvMax: [um, vm], depth: d },
		{ face: node.face, uvMin: [um, v0], uvMax: [u1, vm], depth: d },
		{ face: node.face, uvMin: [u0, vm], uvMax: [um, v1], depth: d },
		{ face: node.face, uvMin: [um, vm], uvMax: [u1, v1], depth: d }
	];
}

function nodeToPatch(node: QuadNode, id: number, resolution: number): ScheduledPatch {
	return {
		kind: 'cubeSphere',
		id,
		face: node.face,
		uvMin: node.uvMin,
		uvMax: node.uvMax,
		resolution,
		morph: 0,
		priority: 0
	};
}

export function scheduleAdaptiveOrbitPatches(input: OrbitSchedulerInput): ScheduledPatch[] {
	const {
		cameraPos,
		planetRadius,
		viewProj,
		viewport,
		targetVertexSpacingPx = 6,
		maxDepth: maxDepthInput,
		planetRotation = IDENTITY_QUAT
	} = input;
	const altitude = Math.max(len3(cameraPos) - planetRadius, 0);
	const maxDepth = maxDepthInput ?? chooseMaxDepth(altitude, planetRadius);
	const maxRes = input.maxPatchResolution ?? chooseOrbitPatchResolution(altitude, planetRadius);
	const schedViewProj = composeScheduleViewProj(viewProj, planetRotation);
	const hemiCamDir = scheduleHemisphereCamDir(cameraPos, planetRotation);
	const searchMarginPx = Math.max(viewport.width, viewport.height);

	const leaves: ScheduledPatch[] = [];
	let nextId = 0;

	for (let face = 0; face < 6; face++) {
		const rootNode: QuadNode = {
			face: face as CubeSpherePatch['face'],
			uvMin: [0, 0],
			uvMax: [1, 1],
			depth: 0
		};
		const rootPatch = nodeToPatch(rootNode, nextId, 8);
		const rootBounds = patchScreenBounds(schedViewProj, viewport, planetRadius, rootPatch, {
			cornersOnly: true
		});
		const rootOnScreen = patchIntersectsViewport(rootBounds, viewport, VIEWPORT_CULL_MARGIN_PX);
		const rootOnHemisphere = patchIntersectsFrontHemisphere(rootPatch, hemiCamDir);
		if (!rootOnScreen && !rootOnHemisphere) continue;

		const stack: QuadNode[] = [rootNode];

		while (stack.length > 0) {
			const node = stack.pop()!;
			const patch = nodeToPatch(node, nextId, 8);

			const bounds = patchScreenBounds(schedViewProj, viewport, planetRadius, patch, {
				cornersOnly: true
			});
			// A patch with corners on both sides of the near plane has untrustworthy
			// 2D bounds (the behind-camera corners are dropped, so its footprint is
			// underestimated). It sits right at the camera, so treat it as maximally
			// large: force subdivision and, at the leaf, max resolution + priority.
			const straddlesNearPlane = bounds.anyBehind === true && bounds.anyVisible;
			const onOrNearScreen =
				straddlesNearPlane || patchIntersectsViewport(bounds, viewport, VIEWPORT_CULL_MARGIN_PX);
			const diameterPx = straddlesNearPlane
				? Number.POSITIVE_INFINITY
				: patchScreenDiameterPx(bounds);
			const inSearchRegion =
				onOrNearScreen ||
				patchIntersectsViewport(bounds, viewport, searchMarginPx) ||
				(!bounds.anyVisible && patchIntersectsFrontHemisphere(patch, hemiCamDir));

			if (!onOrNearScreen && !inSearchRegion) continue;

			// Straddling tiles force subdivision (diameterPx = ∞); cap their depth so
			// the limb band can't subdivide all the way to maxDepth.
			const depthLimit = straddlesNearPlane
				? Math.min(maxDepth, STRADDLE_MAX_DEPTH)
				: maxDepth;
			const shouldSubdivide =
				node.depth < depthLimit &&
				(onOrNearScreen
					? diameterPx > targetVertexSpacingPx * 2
					: inSearchRegion);

			if (shouldSubdivide) {
				for (const child of subdivide(node)) stack.push(child);
				continue;
			}

			const onHemisphere = patchIntersectsFrontHemisphere(patch, hemiCamDir);
			// Limb-only fallback: corners project behind camera but tile is still front-facing.
			const limbTile = !bounds.anyVisible && onHemisphere;
			const emitBounds =
				limbTile || !bounds.anyVisible
					? patchScreenBounds(schedViewProj, viewport, planetRadius, patch)
					: bounds;
			const overlapsViewport =
				emitBounds.anyVisible &&
				!isScreenBoundsOutsideViewport(emitBounds, viewport, 0);
			if (!onOrNearScreen && !limbTile && !overlapsViewport) continue;

			const emitDiameterPx = straddlesNearPlane
				? Number.POSITIVE_INFINITY
				: patchScreenDiameterPx(emitBounds);
			const rawRes = resolutionFromDiameter(
				Math.max(emitDiameterPx, onOrNearScreen ? targetVertexSpacingPx : targetVertexSpacingPx * 2),
				targetVertexSpacingPx,
				maxRes
			);
			// Straddling near-plane tiles are subdivided to the finest depth already and
			// sit at the camera's feet (mostly below the horizon view). Cap their
			// resolution so a band of them can't exhaust the vertex budget and starve
			// the visible terrain — that produced an empty view below ~20 m altitude.
			const res = straddlesNearPlane ? Math.min(rawRes, STRADDLE_MAX_RESOLUTION) : rawRes;
			const finalPatch = nodeToPatch(node, nextId++, res);
			const facing = Math.max(0, dot3(patchCenterDir(finalPatch), hemiCamDir));
			const area = patchScreenAreaPx(emitBounds);
			finalPatch.priority = area * facing;
			leaves.push(finalPatch);
		}
	}

	return leaves;
}

export function groupPatchesByResolution(
	patches: CubeSpherePatch[]
): Map<number, CubeSpherePatch[]> {
	const buckets = new Map<number, CubeSpherePatch[]>();
	for (const patch of patches) {
		const list = buckets.get(patch.resolution) ?? [];
		list.push(patch);
		buckets.set(patch.resolution, list);
	}
	return buckets;
}

export function totalVertexCount(patches: CubeSpherePatch[]): number {
	let total = 0;
	for (const p of patches) total += cubePatchVertexCount(p.resolution);
	return total;
}
