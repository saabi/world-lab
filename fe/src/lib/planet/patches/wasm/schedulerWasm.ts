// JS wrapper around scheduler.wasm — the AssemblyScript port of
// cubeSphereScheduler.ts::scheduleAdaptiveOrbitPatches.
//
// One boundary crossing per schedule: camera + view-projection in, a packed
// patch-descriptor buffer out. The JS scheduler stays as the parity oracle and
// the fallback when WASM is unavailable (WebGL backend, instantiation failure,
// or before the async load resolves).
import type { CubeSpherePatch, PackedBucket } from '../types.js';
import type { OrbitSchedulerInput, ScheduledPatch } from '../cubeSphereScheduler.js';
import { IDENTITY_QUAT } from '../../scene/transform.js';
import {
	composeScheduleViewProj,
	scheduleHemisphereCamDir
} from '../orbitScheduleCoords.js';

// Linear-memory layout (byte offsets). Mirrors the regions scheduler.ts reads.
const VP_OFF = 0; // 16 f32 (view-projection)
const CAM_OFF = 64; // 3 f64 (camera world pos)
const STACK_OFF = 4096; // DFS scratch (5 f64 per node, ample for depth<=6 DFS)
const OUT_OFF = 393216; // 7 f64 per emitted patch
const OUT_MAX = 32768; // > 6 * 4^6 walk ceiling; never clamps
const OUT_STRIDE = 56; // 7 f64

// Budget+pack scratch + output, appended after the candidate (OUT) region. Each
// index scratch is sized for OUT_MAX entries; the pack region holds the survivors
// as GPU records (survivors <= MAX_CUBE_PATCHES = 4096, so 4096 * 32 is ample).
const OUT_END = OUT_OFF + OUT_MAX * OUT_STRIDE;
const KEPT_OFF = OUT_END; // i32 * OUT_MAX
const ORDER_OFF = KEPT_OFF + OUT_MAX * 4; // i32 * OUT_MAX
const TMP_OFF = ORDER_OFF + OUT_MAX * 4; // i32 * OUT_MAX (merge scratch; reused for counts/cursors)
const RES_OFF = TMP_OFF + OUT_MAX * 4; // i32 * OUT_MAX
const KEY_OFF = RES_OFF + OUT_MAX * 4; // f64 * OUT_MAX
const LIVE_OFF = KEY_OFF + OUT_MAX * 8; // u8 * OUT_MAX
const PACK_OFF = LIVE_OFF + OUT_MAX; // 4096 * 32 bytes
const META_OFF = PACK_OFF + 4096 * 32; // header (i32 dropped, i32 survivors, f64 verts) + 3 i32 per bucket
const META_BYTES = 16 + 8 * 12; // header + up to 8 buckets (only 5 used)

const VP_F32 = VP_OFF / 4;
const CAM_F64 = CAM_OFF / 8;
const OUT_F64 = OUT_OFF / 8;

// Bytes the layout needs (through the meta region); grow memory to cover it.
const NEEDED_BYTES = META_OFF + META_BYTES;
const PAGE = 65536;
const NEEDED_PAGES = Math.ceil(NEEDED_BYTES / PAGE);

type ScheduleExport = (
	vpPtr: number,
	camPtr: number,
	planetRadius: number,
	vw: number,
	vh: number,
	targetSpacing: number,
	stackPtr: number,
	outPtr: number,
	outMax: number,
	maxDepthOverride: number,
	maxResOverride: number
) => number;

type BudgetExport = (
	outPtr: number,
	count: number,
	maxVertices: number,
	maxPatches: number,
	keptPtr: number,
	orderPtr: number,
	tmpPtr: number,
	keyPtr: number,
	resPtr: number,
	livePtr: number,
	packPtr: number,
	metaPtr: number
) => number;

let scheduleFn: ScheduleExport | null = null;
let budgetFn: BudgetExport | null = null;
let f32: Float32Array | null = null;
let f64: Float64Array | null = null;
let u8: Uint8Array | null = null;
let i32: Int32Array | null = null;

export function isSchedulerReady(): boolean {
	return scheduleFn !== null;
}

function bindInstance(instance: WebAssembly.Instance): void {
	const mem = instance.exports.memory as WebAssembly.Memory;
	const havePages = mem.buffer.byteLength / PAGE;
	if (havePages < NEEDED_PAGES) mem.grow(NEEDED_PAGES - havePages);
	// Views must be (re)built after grow — grow detaches the old ArrayBuffer.
	f32 = new Float32Array(mem.buffer);
	f64 = new Float64Array(mem.buffer);
	u8 = new Uint8Array(mem.buffer);
	i32 = new Int32Array(mem.buffer);
	scheduleFn = instance.exports.scheduleOrbit as ScheduleExport;
	budgetFn = instance.exports.budgetAndPack as BudgetExport;
}

/** Instantiate from raw bytes (tests, or an explicit fetch). Idempotent-ish. */
export async function instantiateScheduler(bytes: BufferSource): Promise<void> {
	const { instance } = await WebAssembly.instantiate(bytes, {});
	bindInstance(instance);
}

/** Browser auto-init: fetch the emitted .wasm and bind it. No-op on failure. */
export async function initSchedulerFromUrl(): Promise<void> {
	try {
		// new URL(..., import.meta.url) is statically detected by Vite, which emits
		// the .wasm as a build asset and rewrites this to its hashed URL.
		const url = new URL('./scheduler.wasm', import.meta.url);
		const res = await fetch(url);
		await instantiateScheduler(await res.arrayBuffer());
	} catch {
		// Leave scheduleFn null; callers fall back to the JS scheduler.
	}
}

/** f64 stride of one emitted candidate: [face, u0, v0, u1, v1, resolution, priority]. */
export const CANDIDATE_STRIDE = 7;

/** A flat candidate set: a view into WASM linear memory, valid until the next call. */
export interface FlatCandidates {
	/** Float64 view of the OUT region: count * CANDIDATE_STRIDE values. */
	view: Float64Array;
	count: number;
}

/**
 * Run the WASM quadtree walk, leaving candidates packed in linear memory. Returns
 * a view + count (no per-candidate object allocation), or null when WASM is not
 * ready so the caller can fall back to the JS scheduler.
 *
 * The returned view aliases WASM memory and is overwritten by the next call —
 * consume it before scheduling again.
 */
export function scheduleCandidatesFlat(input: OrbitSchedulerInput): FlatCandidates | null {
	const fn = scheduleFn;
	const fv = f32;
	const dv = f64;
	if (!fn || !fv || !dv) return null;

	const schedVp = composeScheduleViewProj(
		input.viewProj,
		input.planetRotation ?? IDENTITY_QUAT
	);
	for (let i = 0; i < 16; i++) fv[VP_F32 + i] = schedVp[i]!;
	dv[CAM_F64] = input.cameraPos[0];
	dv[CAM_F64 + 1] = input.cameraPos[1];
	dv[CAM_F64 + 2] = input.cameraPos[2];
	const hemi = scheduleHemisphereCamDir(input.cameraPos, input.planetRotation ?? IDENTITY_QUAT);
	dv[CAM_F64 + 3] = hemi[0];
	dv[CAM_F64 + 4] = hemi[1];
	dv[CAM_F64 + 5] = hemi[2];

	const target = input.targetVertexSpacingPx ?? 6;
	const count = fn(
		VP_OFF,
		CAM_OFF,
		input.planetRadius,
		input.viewport.width,
		input.viewport.height,
		target,
		STACK_OFF,
		OUT_OFF,
		OUT_MAX,
		input.maxDepth ?? 0,
		input.maxPatchResolution ?? 0
	);
	return { view: dv.subarray(OUT_F64, OUT_F64 + count * CANDIDATE_STRIDE), count };
}

/** Packed, budgeted result — buckets alias WASM memory until the next call. */
export interface WasmPackResult {
	/** GPU-ready byte blocks per resolution; `data` aliases the WASM pack region. */
	packedBuckets: PackedBucket[];
	dropped: number;
	patchCount: number;
	estimatedVertices: number;
}

/**
 * Budget + pack the candidate set the last scheduleCandidatesFlat call left in the
 * OUT region: count-cap, coarsen-then-drop to the vertex budget, then write GPU
 * records grouped per resolution — all inside WASM, no JS sort or allocation. The
 * returned bucket `data` views alias WASM memory and are overwritten by the next
 * budget/pack or walk — consume them the same frame. Returns null when WASM is not
 * ready (caller falls back to the TS packer).
 */
export function budgetAndPackFlat(
	count: number,
	maxVertices: number,
	maxPatches: number
): WasmPackResult | null {
	const fn = budgetFn;
	const bytes = u8;
	const ints = i32;
	const dv = f64;
	if (!fn || !bytes || !ints || !dv) return null;

	const bucketCount = fn(
		OUT_OFF,
		count,
		maxVertices,
		maxPatches,
		KEPT_OFF,
		ORDER_OFF,
		TMP_OFF,
		KEY_OFF,
		RES_OFF,
		LIVE_OFF,
		PACK_OFF,
		META_OFF
	);

	const dropped = ints[META_OFF / 4];
	const patchCount = ints[META_OFF / 4 + 1];
	const estimatedVertices = dv[META_OFF / 8 + 1];

	const packedBuckets: PackedBucket[] = new Array(bucketCount);
	for (let k = 0; k < bucketCount; k++) {
		const m = (META_OFF + 16 + k * 12) / 4;
		const resolution = ints[m];
		const instanceCount = ints[m + 1];
		const byteOffset = ints[m + 2];
		const start = PACK_OFF + byteOffset;
		packedBuckets[k] = {
			resolution,
			instanceCount,
			data: bytes.subarray(start, start + instanceCount * 32)
		};
	}

	return { packedBuckets, dropped, patchCount, estimatedVertices };
}

/**
 * Object-returning walk: the parity oracle for tests and the materialized form.
 * Production (scheduleOrbitPatches) uses scheduleCandidatesFlat to avoid building
 * the full candidate set as objects.
 */
export function scheduleAdaptiveOrbitPatchesWasm(input: OrbitSchedulerInput): ScheduledPatch[] | null {
	const flat = scheduleCandidatesFlat(input);
	if (!flat) return null;
	const { view, count } = flat;
	const patches: ScheduledPatch[] = new Array(count);
	for (let i = 0; i < count; i++) {
		const o = i * CANDIDATE_STRIDE;
		patches[i] = {
			kind: 'cubeSphere',
			id: i,
			face: (view[o] | 0) as CubeSpherePatch['face'],
			uvMin: [view[o + 1], view[o + 2]],
			uvMax: [view[o + 3], view[o + 4]],
			resolution: view[o + 5] | 0,
			morph: 0,
			priority: view[o + 6]
		};
	}
	return patches;
}
