import type { Vec3 } from '../math/vec.js';
import { normalize3 } from '../math/vec.js';
import {
	groupPatchesByResolution,
	scheduleAdaptiveOrbitPatches,
	totalVertexCount,
	type OrbitSchedulerInput
} from './cubeSphereScheduler.js';
import type { CubeSpherePatch, PackedBucket } from './types.js';
import { applyVertexBudget, DEFAULT_MAX_VERTICES_PER_FRAME } from './vertexBudget.js';
import type { ViewportSize } from './screenSpace.js';
import { MAX_CUBE_PATCHES, encodeCubeSpherePatches } from '../params/gpuBuffers.js';
import { budgetAndPackFlat, initSchedulerFromUrl, scheduleCandidatesFlat } from './wasm/schedulerWasm.js';
import type { Quat } from '../scene/types.js';
import { IDENTITY_QUAT, quatNear } from '../scene/transform.js';

// Kick off the async WASM scheduler load in the browser. Until it resolves (or
// if it fails / WebGL fallback / Node tests), scheduleOrbitPatches uses the JS
// object path — see scheduleCandidatesFlat's null contract.
if (typeof window !== 'undefined') void initSchedulerFromUrl();

interface ScheduleCandidates {
	packedBuckets: PackedBucket[];
	patchCount: number;
	candidatePatches: number;
	budgetDropped: number;
	estimatedVertices: number;
}

/**
 * WASM path: walk → flat candidate buffer → budget + pack survivors straight into
 * GPU-upload byte blocks, all inside WASM (no CubeSpherePatch objects, no JS sort
 * or typed-array churn). Coarsens spacing first if the candidate count explodes
 * (the count is read without allocating candidate objects). Returns null when WASM
 * is unavailable so the caller falls back to the JS object path.
 */
function scheduleFlat(
	base: Omit<OrbitSchedulerInput, 'targetVertexSpacingPx'>,
	spacing: number,
	maxVertices: number
): { result: ScheduleCandidates; spacing: number } | null {
	let flat = scheduleCandidatesFlat({ ...base, targetVertexSpacingPx: spacing });
	if (!flat) return null;
	let spacingSteps = 0;
	while (
		flat.count > MAX_CUBE_PATCHES * 2 &&
		spacing < 256 &&
		spacingSteps < MAX_SPACING_RETRIES
	) {
		spacing *= 1.6;
		flat = scheduleCandidatesFlat({ ...base, targetVertexSpacingPx: spacing })!;
		spacingSteps++;
	}
	const candidateCount = flat.count;
	const budgeted = budgetAndPackFlat(flat.count, maxVertices, MAX_CUBE_PATCHES);
	if (!budgeted) return null;
	return {
		spacing,
		result: {
			packedBuckets: budgeted.packedBuckets,
			patchCount: budgeted.patchCount,
			candidatePatches: candidateCount,
			budgetDropped: budgeted.dropped,
			estimatedVertices: budgeted.estimatedVertices
		}
	};
}

/** Pack object survivor buckets into GPU-upload byte blocks (JS/WebGL fallback). */
function packObjectBuckets(buckets: Map<number, CubeSpherePatch[]>): PackedBucket[] {
	const packed: PackedBucket[] = [];
	for (const [resolution, list] of buckets) {
		if (list.length === 0) continue;
		packed.push({
			resolution,
			instanceCount: list.length,
			data: new Uint8Array(encodeCubeSpherePatches(list))
		});
	}
	return packed;
}

/** JS fallback path: object walk → applyVertexBudget → group → pack (oracle parity). */
function scheduleObjects(
	base: Omit<OrbitSchedulerInput, 'targetVertexSpacingPx'>,
	spacing: number,
	maxVertices: number
): { result: ScheduleCandidates; spacing: number } {
	let candidates = scheduleAdaptiveOrbitPatches({ ...base, targetVertexSpacingPx: spacing });
	let spacingSteps = 0;
	while (
		candidates.length > MAX_CUBE_PATCHES * 2 &&
		spacing < 256 &&
		spacingSteps < MAX_SPACING_RETRIES
	) {
		spacing *= 1.6;
		candidates = scheduleAdaptiveOrbitPatches({ ...base, targetVertexSpacingPx: spacing });
		spacingSteps++;
	}
	const candidateCount = candidates.length;
	const budgeted = applyVertexBudget(candidates, maxVertices, MAX_CUBE_PATCHES);
	const patches = budgeted.patches;
	return {
		spacing,
		result: {
			packedBuckets: packObjectBuckets(groupPatchesByResolution(patches)),
			patchCount: patches.length,
			candidatePatches: candidateCount,
			budgetDropped: budgeted.dropped,
			estimatedVertices: totalVertexCount(patches)
		}
	};
}

/** Reuse last successful spacing so we rarely repeat the coarse-to-fine search loop. */
let orbitSpacingHint = 6;

// Frame-coherent scheduling cache. The render loop calls scheduleOrbitPatches every
// frame; the quadtree walk is the main-thread hot spot (esp. in spaceflight, where
// the camera moves continuously). Reuse the last result while the camera POSITION
// hasn't moved enough to change tile selection — the shader still renders from the
// live camera, so only the (briefly stale) LOD/cull selection is reused.
//
// Deliberately POSITION-only: orientation is excluded from the key. Spaceflight
// rebuilds the view matrix every frame (prograde/retrograde "look" modes rotate
// while the position barely moves), so keying on view-projection made the hit rate
// ~0%. The scheduler's generous search margin already covers off-screen tiles, so
// a stale tile set tolerates rotation; the age cap bounds staleness during fast
// turns. Watch the hit rate via getOrbitScheduleStats() and tune.
const SCHEDULE_POS_FRACTION = 0.04; // re-schedule when the camera moves > 4% of altitude
const MAX_SCHEDULE_AGE_FRAMES = 4; // refresh cadence: a reused LOD selection is ≤ this stale
/** Cap full quadtree re-walks per call (applyVertexBudget enforces the real caps). */
const MAX_SPACING_RETRIES = 3;

interface ScheduleCache {
	cameraPos: Vec3;
	planetRadius: number;
	planetRotation: Quat;
	vw: number;
	vh: number;
	detail: number;
	maxVertices: number;
	maxPatchResolution: number;
	maxDepth: number;
	ageFrames: number;
	result: OrbitScheduleResult;
}
let scheduleCache: ScheduleCache | null = null;
let scheduleHits = 0;
let scheduleMisses = 0;

/** Cache hit/miss stats — surface in the HUD or log to measure flight hit rate. */
export function getOrbitScheduleStats(): { hits: number; misses: number; hitRate: number } {
	const total = scheduleHits + scheduleMisses;
	return { hits: scheduleHits, misses: scheduleMisses, hitRate: total > 0 ? scheduleHits / total : 0 };
}

/** Reset the frame-coherent schedule cache and its stats (tests). */
export function resetOrbitScheduleCache(): void {
	scheduleCache = null;
	scheduleHits = 0;
	scheduleMisses = 0;
}

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
	/** Density multiplier: >1 finer (smaller spacing), <1 coarser. */
	detail?: number;
	/** Cap on patch resolution; 0/undefined = altitude-based auto. */
	maxPatchResolution?: number;
	/** Cap on subdivision depth; 0/undefined = altitude-based auto. */
	maxDepth?: number;
	/** Body world rotation — patch culling matches rotated vertex placement. */
	planetRotation?: Quat;
}

export interface OrbitScheduleResult {
	/**
	 * GPU-ready packed buckets (32-byte upload layout). `data` aliases a reused
	 * per-schedule pool on the WASM path — consume the same frame, before the next
	 * schedule. See _docs/specs/flat-patch-upload.md.
	 */
	packedBuckets: PackedBucket[];
	patchCount: number;
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
	const planetRotation = options.planetRotation ?? IDENTITY_QUAT;
	// Honor user detail down to a small sanity clamp (the UI exposes values well
	// below the old 0.25 floor for low-density mobile meshes).
	const detail = Math.max(options.detail ?? 1, 0.01);
	// LOD caps: 0 = altitude-based auto. Normalized to numbers for the cache key;
	// passed to the scheduler only when set (0 must not masquerade as a real cap).
	const maxPatchResolution = options.maxPatchResolution ?? 0;
	const maxDepth = options.maxDepth ?? 0;
	const vw = options.viewport.width;
	const vh = options.viewport.height;
	const altitude = Math.max(Math.hypot(cameraPos[0], cameraPos[1], cameraPos[2]) - planetRadius, 1);

	// Frame-coherent reuse: same layout inputs + camera within thresholds → cached.
	const cache = scheduleCache;
	if (
		cache &&
		cache.planetRadius === planetRadius &&
		quatNear(cache.planetRotation, planetRotation) &&
		cache.vw === vw &&
		cache.vh === vh &&
		cache.detail === detail &&
		cache.maxVertices === maxVertices &&
		cache.maxPatchResolution === maxPatchResolution &&
		cache.maxDepth === maxDepth &&
		cache.ageFrames < MAX_SCHEDULE_AGE_FRAMES &&
		Math.hypot(
			cameraPos[0] - cache.cameraPos[0],
			cameraPos[1] - cache.cameraPos[1],
			cameraPos[2] - cache.cameraPos[2]
		) <= SCHEDULE_POS_FRACTION * altitude
	) {
		cache.ageFrames++;
		scheduleHits++;
		return cache.result;
	}
	scheduleMisses++;

	const estimate = estimateInitialOrbitSpacing(cameraPos, planetRadius, baseSpacing);
	// Start from the altitude-appropriate estimate (eased by the previous frame's
	// hint), then apply the user detail multiplier. The hint stores the un-scaled
	// spacing so detail does not compound frame to frame.
	const spacing = Math.max(baseSpacing, estimate, orbitSpacingHint * 0.8) / detail;
	const base = {
		cameraPos,
		planetRadius,
		viewProj,
		viewport: options.viewport,
		planetRotation,
		...(maxPatchResolution ? { maxPatchResolution } : {}),
		...(maxDepth ? { maxDepth } : {})
	};
	// Coarsen only to protect CPU from a candidate explosion; the budget enforces
	// the real patch-count and vertex caps, so allow finer detail through. The flat
	// path (WASM) budgets/groups in place, building objects only for survivors; the
	// object path is the WebGL / no-WASM fallback.
	const scheduled =
		scheduleFlat(base, spacing, maxVertices) ?? scheduleObjects(base, spacing, maxVertices);
	orbitSpacingHint = scheduled.spacing * detail;
	const result: OrbitScheduleResult = {
		...scheduled.result,
		vertexBudget: maxVertices
	};
	scheduleCache = {
		cameraPos: [cameraPos[0], cameraPos[1], cameraPos[2]],
		planetRadius,
		planetRotation: [...planetRotation] as Quat,
		vw,
		vh,
		detail,
		maxVertices,
		maxPatchResolution,
		maxDepth,
		ageFrames: 0,
		result
	};
	return result;
}

export type { OrbitSchedulerInput };
