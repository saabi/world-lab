import type { CubeSpherePatch, PackedBucket } from './types.js';
import { CUBE_SPHERE_PATCH_BYTE_SIZE } from '../params/planetParams.js';
import { MAX_CUBE_PATCHES, writeCubePatchRecord } from '../params/gpuBuffers.js';

// Flat-buffer vertex budget + grouping/packing. The WASM scheduler emits
// candidates straight into linear memory (7 f64 per patch:
// [face, u0, v0, u1, v1, resolution, priority]); this selects the survivors once
// and exposes them two ways:
//   - budgetAndGroupFlat   → CubeSpherePatch objects + Map<res, []>  (object path)
//   - packBudgetedBuckets  → GPU-upload byte blocks per resolution    (flat path)
//
// Both are faithful mirrors of vertexBudget.ts::applyVertexBudget +
// cubeSphereScheduler.ts::groupPatchesByResolution (the parity oracle + JS/WebGL
// fallback); parity is guarded by flatBudget.test.ts (objects) and
// flatPack.test.ts (bytes).

const FIELDS = 7; // f64 per candidate in the flat buffer

export interface FlatBudgetResult {
	patches: CubeSpherePatch[];
	buckets: Map<number, CubeSpherePatch[]>;
	dropped: number;
	estimatedVertices: number;
}

export interface PackBudgetResult {
	packedBuckets: PackedBucket[];
	dropped: number;
	patchCount: number;
	estimatedVertices: number;
}

/** Mirrors vertexBudget.ts::coarsenResolution. */
function coarsenResolution(resolution: number): number {
	if (resolution <= 8) return 8;
	if (resolution <= 16) return 8;
	if (resolution <= 32) return 16;
	if (resolution <= 64) return 32;
	return 64;
}

/** Vertices per instanced cube patch (mirrors cubePatchVertexCount for integer res). */
function vtx(resolution: number): number {
	return resolution * resolution * 6;
}

interface SurvivorSelection {
	/** Candidate index into `view` per survivor, in kept order. */
	index: Int32Array;
	/** Final (possibly coarsened) resolution per survivor. */
	resolution: Int32Array;
	count: number;
	dropped: number;
	estimatedVertices: number;
}

/**
 * Select budgeted survivors from a flat candidate buffer. Mirrors
 * applyVertexBudget: count-cap by priority, then coarsen-then-drop lowest-priority
 * until within the vertex budget. Returns compacted survivor indices + final
 * resolutions in kept order (no object/byte materialization).
 */
function selectSurvivorsFlat(
	view: Float64Array,
	count: number,
	maxVertices: number,
	maxPatches: number
): SurvivorSelection {
	const prio = (i: number): number => view[i * FIELDS + 6];

	// Candidate indices, initially in emit order (matches the object oracle, whose
	// `kept` starts as the candidate array order — important for stable-sort ties).
	let kept: number[] = new Array(count);
	for (let i = 0; i < count; i++) kept[i] = i;

	let dropped = 0;

	// Patch-count cap first: keep the highest-priority candidates.
	if (kept.length > maxPatches) {
		kept.sort((a, b) => prio(b) - prio(a));
		dropped += kept.length - maxPatches;
		kept = kept.slice(0, maxPatches);
	}

	const K = kept.length;
	// Resolution is mutable (coarsening); priority is read-only per kept slot.
	const keptRes = new Int32Array(K);
	for (let j = 0; j < K; j++) keptRes[j] = view[kept[j] * FIELDS + 5] | 0;
	const live = new Uint8Array(K).fill(1);

	let total = 0;
	for (let j = 0; j < K; j++) total += vtx(keptRes[j]);

	if (total > maxVertices) {
		// Process lowest-priority first; coarsen, then drop. Stable on ties.
		const order = new Array<number>(K);
		for (let j = 0; j < K; j++) order[j] = j;
		order.sort((a, b) => prio(kept[a]) - prio(kept[b]));

		for (const j of order) {
			if (total <= maxVertices) break;
			if (!live[j]) continue;
			const before = vtx(keptRes[j]);
			const coarser = coarsenResolution(keptRes[j]);
			if (coarser < keptRes[j]) {
				keptRes[j] = coarser;
				total += vtx(keptRes[j]) - before;
				continue;
			}
			live[j] = 0;
			total -= before;
			dropped++;
		}
	}

	// Compact survivors in kept order.
	let n = 0;
	for (let j = 0; j < K; j++) if (live[j]) n++;
	const index = new Int32Array(n);
	const resolution = new Int32Array(n);
	let estimatedVertices = 0;
	let w = 0;
	for (let j = 0; j < K; j++) {
		if (!live[j]) continue;
		index[w] = kept[j];
		resolution[w] = keptRes[j];
		estimatedVertices += vtx(keptRes[j]);
		w++;
	}
	return { index, resolution, count: n, dropped, estimatedVertices };
}

/**
 * Object form: budgeted survivors as CubeSpherePatch objects grouped by final
 * resolution. The oracle/fallback shape; production uses packBudgetedBuckets.
 */
export function budgetAndGroupFlat(
	view: Float64Array,
	count: number,
	maxVertices: number,
	maxPatches: number
): FlatBudgetResult {
	const sel = selectSurvivorsFlat(view, count, maxVertices, maxPatches);
	const patches: CubeSpherePatch[] = [];
	const buckets = new Map<number, CubeSpherePatch[]>();
	for (let s = 0; s < sel.count; s++) {
		const i = sel.index[s];
		const b = i * FIELDS;
		const r = sel.resolution[s];
		const patch: CubeSpherePatch = {
			kind: 'cubeSphere',
			id: i,
			face: (view[b] | 0) as CubeSpherePatch['face'],
			uvMin: [view[b + 1], view[b + 2]],
			uvMax: [view[b + 3], view[b + 4]],
			resolution: r,
			morph: 0
		};
		patches.push(patch);
		const list = buckets.get(r) ?? [];
		list.push(patch);
		buckets.set(r, list);
	}
	return {
		patches,
		buckets,
		dropped: sel.dropped,
		estimatedVertices: sel.estimatedVertices
	};
}

// Reused per-resolution byte pool. Survivors total <= MAX_CUBE_PATCHES, so each
// resolution's block fits MAX_CUBE_PATCHES records. Returned PackedBucket.data
// aliases these — valid only until the next packBudgetedBuckets call.
const packPool = new Map<number, ArrayBuffer>();
function poolFor(resolution: number): ArrayBuffer {
	let buf = packPool.get(resolution);
	if (!buf) {
		buf = new ArrayBuffer(MAX_CUBE_PATCHES * CUBE_SPHERE_PATCH_BYTE_SIZE);
		packPool.set(resolution, buf);
	}
	return buf;
}

/**
 * Flat form: budgeted survivors written straight into GPU-upload byte blocks per
 * resolution (no CubeSpherePatch objects). Within-bucket order matches
 * budgetAndGroupFlat (kept order), so the bytes equal
 * encodeCubeSpherePatches(buckets.get(res)).
 */
export function packBudgetedBuckets(
	view: Float64Array,
	count: number,
	maxVertices: number,
	maxPatches: number
): PackBudgetResult {
	const sel = selectSurvivorsFlat(view, count, maxVertices, maxPatches);

	// Count survivors per resolution to size each block.
	const perRes = new Map<number, number>();
	for (let s = 0; s < sel.count; s++) {
		perRes.set(sel.resolution[s], (perRes.get(sel.resolution[s]) ?? 0) + 1);
	}

	const packedBuckets: PackedBucket[] = [];
	const writers = new Map<number, { view: DataView; offset: number }>();
	for (const [res, n] of perRes) {
		const buf = poolFor(res);
		writers.set(res, { view: new DataView(buf), offset: 0 });
		packedBuckets.push({
			resolution: res,
			instanceCount: n,
			data: new Uint8Array(buf, 0, n * CUBE_SPHERE_PATCH_BYTE_SIZE)
		});
	}

	for (let s = 0; s < sel.count; s++) {
		const i = sel.index[s];
		const b = i * FIELDS;
		const r = sel.resolution[s];
		const wr = writers.get(r)!;
		writeCubePatchRecord(
			wr.view,
			wr.offset,
			view[b] | 0,
			view[b + 1],
			view[b + 2],
			view[b + 3],
			view[b + 4],
			r,
			0
		);
		wr.offset += CUBE_SPHERE_PATCH_BYTE_SIZE;
	}

	return {
		packedBuckets,
		dropped: sel.dropped,
		patchCount: sel.count,
		estimatedVertices: sel.estimatedVertices
	};
}
