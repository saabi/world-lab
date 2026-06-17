import type { Vec3 } from '../math/vec.js';
import { normalize3 } from '../math/vec.js';
import {
	groupPatchesByResolution,
	scheduleAdaptiveOrbitPatches,
	totalVertexCount,
	type OrbitSchedulerInput
} from './cubeSphereScheduler.js';
import type { CubeSpherePatch } from './types.js';
import { applyVertexBudget, DEFAULT_MAX_VERTICES_PER_FRAME } from './vertexBudget.js';
import type { ViewportSize } from './screenSpace.js';
import { MAX_CUBE_PATCHES } from '../params/gpuBuffers.js';

/** Reuse last successful spacing so we rarely repeat the coarse-to-fine search loop. */
let orbitSpacingHint = 6;

function estimateInitialOrbitSpacing(
	cameraPos: Vec3,
	planetRadius: number,
	baseSpacing: number
): number {
	const altitude = Math.max(
		Math.hypot(cameraPos[0], cameraPos[1], cameraPos[2]) - planetRadius,
		0
	);
	const altRatio = altitude / Math.max(planetRadius, 1);
	if (altRatio > 2) return Math.max(baseSpacing, 15);
	if (altRatio > 0.5) return Math.max(baseSpacing, 12);
	if (altRatio > 0.15) return Math.max(baseSpacing, 24);
	if (altRatio > 0.05) return Math.max(baseSpacing, 30);
	return Math.max(baseSpacing, 39);
}

/** Vertices per instanced cube patch (two triangles per grid cell). */
export function cubePatchVertexCount(resolution: number): number {
	const res = Math.max(1, Math.floor(resolution));
	return res * res * 6;
}

export function chooseOrbitFacesPerSide(altitudeMeters: number, planetRadius: number): number {
	const altRatio = altitudeMeters / Math.max(planetRadius, 1);
	if (altRatio >= 3) return 8;
	if (altRatio >= 1) return 12;
	if (altRatio >= 0.3) return 16;
	if (altRatio >= 0.1) return 24;
	return 28;
}

export function chooseOrbitPatchResolution(altitudeMeters: number, planetRadius: number): number {
	const altRatio = altitudeMeters / Math.max(planetRadius, 1);
	if (altRatio >= 3) return 8;
	if (altRatio >= 1) return 16;
	if (altRatio >= 0.3) return 32;
	if (altRatio >= 0.1) return 64;
	return 96;
}

/** Cube face index: 0=+X, 1=-X, 2=+Y, 3=-Y, 4=+Z, 5=-Z */
export function cubeFaceUvToPosition(face: number, u: number, v: number): Vec3 {
	const a = u * 2 - 1;
	const b = v * 2 - 1;
	switch (face) {
		case 0:
			return [1, b, -a];
		case 1:
			return [-1, b, a];
		case 2:
			return [a, 1, -b];
		case 3:
			return [a, -1, b];
		case 4:
			return [a, b, 1];
		case 5:
			return [-a, b, -1];
		default:
			return [0, 0, 1];
	}
}

export function cubeFaceUvToUnitDir(face: number, u: number, v: number): Vec3 {
	return normalize3(cubeFaceUvToPosition(face, u, v));
}

export function buildOrbitPatchGrid(
	facesPerSide: number,
	patchResolution: number,
	startId = 0
): CubeSpherePatch[] {
	const patches: CubeSpherePatch[] = [];
	let id = startId;
	const step = 1 / facesPerSide;
	for (let face = 0; face < 6; face++) {
		for (let py = 0; py < facesPerSide; py++) {
			for (let px = 0; px < facesPerSide; px++) {
				patches.push({
					kind: 'cubeSphere',
					id: id++,
					face: face as CubeSpherePatch['face'],
					uvMin: [px * step, py * step],
					uvMax: [(px + 1) * step, (py + 1) * step],
					resolution: patchResolution,
					morph: 0
				});
			}
		}
	}
	return patches;
}

export interface OrbitScheduleOptions {
	viewport: ViewportSize;
	focalLengthPx?: number;
	targetVertexSpacingPx?: number;
	maxVertices?: number;
}

export interface OrbitScheduleResult {
	patches: CubeSpherePatch[];
	buckets: Map<number, CubeSpherePatch[]>;
	candidatePatches: number;
	budgetDropped: number;
	vertexBudget: number;
	estimatedVertices: number;
}

export function scheduleOrbitPatches(
	cameraPos: Vec3,
	planetRadius: number,
	viewProj: Float32Array,
	options: OrbitScheduleOptions
): OrbitScheduleResult {
	const maxVertices = options.maxVertices ?? DEFAULT_MAX_VERTICES_PER_FRAME;
	const baseSpacing = options.targetVertexSpacingPx ?? 6;
	const estimate = estimateInitialOrbitSpacing(cameraPos, planetRadius, baseSpacing);
	// Start from the altitude-appropriate estimate. The hint only eases the search
	// loop's coarsening from the previous frame; it must decay toward the estimate
	// so spacing recovers after a zoom-out instead of ratcheting up permanently.
	let spacing = Math.max(baseSpacing, estimate, orbitSpacingHint * 0.8);
	let candidates = scheduleAdaptiveOrbitPatches({
		cameraPos,
		planetRadius,
		viewProj,
		viewport: options.viewport,
		targetVertexSpacingPx: spacing
	});
	let spacingSteps = 0;
	while (candidates.length > MAX_CUBE_PATCHES && spacing < 256 && spacingSteps < 12) {
		spacing *= 1.6;
		candidates = scheduleAdaptiveOrbitPatches({
			cameraPos,
			planetRadius,
			viewProj,
			viewport: options.viewport,
			targetVertexSpacingPx: spacing
		});
		spacingSteps++;
	}
	orbitSpacingHint = spacing;
	const candidateCount = candidates.length;
	const budgeted = applyVertexBudget(candidates, maxVertices, MAX_CUBE_PATCHES);
	const patches = budgeted.patches;
	return {
		patches,
		buckets: groupPatchesByResolution(patches),
		candidatePatches: candidateCount,
		budgetDropped: budgeted.dropped,
		vertexBudget: maxVertices,
		estimatedVertices: totalVertexCount(patches)
	};
}

export type { OrbitSchedulerInput };
