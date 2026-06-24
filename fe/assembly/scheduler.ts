// AssemblyScript port of cubeSphereScheduler.ts::scheduleAdaptiveOrbitPatches.
//
// The per-frame adaptive quadtree walk is the main-thread hot spot in flight.
// This mirrors the JS walk in f64 so the emitted patch set matches (guarded by
// scheduler.test.ts). The JS version stays as the parity oracle + WebGL/no-WASM
// fallback; the boundary is crossed once per frame (camera + params in, a packed
// patch-descriptor buffer out).
//
// Parity note: JS uses Math.hypot for vector length; AS lacks a 3-arg hypot, so
// length here is sqrt(x*x+y*y+z*z). The two agree to a few ULPs — never enough
// to flip a subdivision/LOD decision for a fixed camera (the comparisons are not
// at exact tie points), so the patch geometry + resolution match exactly and
// priority matches to within rounding. See the parity test.
//
// Linear-memory layout (byte offsets supplied by the JS wrapper):
//   vpPtr    : 16 f32  — view-projection, column-major
//   camPtr   : 3  f64  — camera world position
//   stackPtr : scratch DFS stack (5 f64 per node: u0,v0,u1,v1,depth)
//   outPtr   : 7 f64 per emitted patch: face,u0,v0,u1,v1,resolution,priority

const RES0: i32 = 8;
const RES1: i32 = 16;
const RES2: i32 = 32;
const RES3: i32 = 64;
const RES4: i32 = 96;
const STRADDLE_MAX_RESOLUTION: i32 = 32;
const STRADDLE_MAX_DEPTH: i32 = 4;
const VIEWPORT_CULL_MARGIN_PX: f64 = 96;
const NODE_STRIDE: usize = 40; // 5 f64
const OUT_STRIDE: usize = 56; // 7 f64

// View-projection (only the rows screen bounds need), set per call.
let m0: f64 = 0, m1: f64 = 0, m3: f64 = 0;
let m4: f64 = 0, m5: f64 = 0, m7: f64 = 0;
let m8: f64 = 0, m9: f64 = 0, m11: f64 = 0;
let m12: f64 = 0, m13: f64 = 0, m15: f64 = 0;
let gVw: f64 = 0, gVh: f64 = 0, gRadius: f64 = 0;
let gCamX: f64 = 0, gCamY: f64 = 0, gCamZ: f64 = 1; // normalized camera direction (altitude)
let gHemiCamX: f64 = 0, gHemiCamY: f64 = 0, gHemiCamZ: f64 = 1; // inv(rot)·cam for body-dir dots

// projectPoint outputs
let pScreenX: f64 = 0, pScreenY: f64 = 0;
let pBehind: bool = false;

// computeBounds outputs
let bMinX: f64 = 0, bMinY: f64 = 0, bMaxX: f64 = 0, bMaxY: f64 = 0;
let bVisible: bool = false, bBehind: bool = false;

// cubeDir outputs (unit direction)
let dX: f64 = 0, dY: f64 = 0, dZ: f64 = 1;

// Mirrors cubeFaceUvToPosition + normalize3.
function cubeDir(face: i32, u: f64, v: f64): void {
	const a = u * 2.0 - 1.0;
	const b = v * 2.0 - 1.0;
	let px: f64, py: f64, pz: f64;
	if (face == 0) { px = 1; py = b; pz = -a; }
	else if (face == 1) { px = -1; py = b; pz = a; }
	else if (face == 2) { px = a; py = 1; pz = -b; }
	else if (face == 3) { px = a; py = -1; pz = b; }
	else if (face == 4) { px = a; py = b; pz = 1; }
	else { px = -a; py = b; pz = -1; }
	const l = Math.sqrt(px * px + py * py + pz * pz);
	if (l < 1e-12) { dX = 0; dY = 0; dZ = 1; }
	else { const inv = 1.0 / l; dX = px * inv; dY = py * inv; dZ = pz * inv; }
}

// Mirrors projectWorldPoint (column-major mat4 x vec3, w=1).
function projectPoint(x: f64, y: f64, z: f64): void {
	const cx = m0 * x + m4 * y + m8 * z + m12;
	const cy = m1 * x + m5 * y + m9 * z + m13;
	const cw = m3 * x + m7 * y + m11 * z + m15;
	if (cw <= 1e-6) { pBehind = true; return; }
	const invW = 1.0 / cw;
	const ndcX = cx * invW;
	const ndcY = cy * invW;
	pScreenX = (ndcX * 0.5 + 0.5) * gVw;
	pScreenY = (1.0 - (ndcY * 0.5 + 0.5)) * gVh;
	pBehind = false;
}

// (su, sv) of sample i, matching patchSampleUvs ordering (corners then center
// then edge midpoints). cornersOnly uses indices 0..3.
// 0:(u0,v0) 1:(u1,v0) 2:(u1,v1) 3:(u0,v1) 4:(um,vm) 5:(um,v0) 6:(um,v1) 7:(u0,vm) 8:(u1,vm)
// @ts-ignore: decorator
@inline
function sampleU(i: i32, u0: f64, u1: f64, um: f64): f64 {
	if (i == 0 || i == 3 || i == 7) return u0;
	if (i == 1 || i == 2 || i == 8) return u1;
	return um;
}
// @ts-ignore: decorator
@inline
function sampleV(i: i32, v0: f64, v1: f64, vm: f64): f64 {
	if (i == 0 || i == 1 || i == 5) return v0;
	if (i == 2 || i == 3 || i == 6) return v1;
	return vm;
}

function computeBounds(face: i32, u0: f64, v0: f64, u1: f64, v1: f64, cornersOnly: bool): void {
	const um = (u0 + u1) * 0.5;
	const vm = (v0 + v1) * 0.5;
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	let anyVis: bool = false, anyBeh: bool = false;
	const n = cornersOnly ? 4 : 9;
	for (let i = 0; i < n; i++) {
		const su = sampleU(i, u0, u1, um);
		const sv = sampleV(i, v0, v1, vm);
		cubeDir(face, su, sv);
		projectPoint(dX * gRadius, dY * gRadius, dZ * gRadius);
		if (pBehind) { anyBeh = true; continue; }
		anyVis = true;
		if (pScreenX < minX) minX = pScreenX;
		if (pScreenY < minY) minY = pScreenY;
		if (pScreenX > maxX) maxX = pScreenX;
		if (pScreenY > maxY) maxY = pScreenY;
	}
	if (!anyVis) {
		bMinX = 0; bMinY = 0; bMaxX = 0; bMaxY = 0; bVisible = false; bBehind = anyBeh;
		return;
	}
	bMinX = minX; bMinY = minY; bMaxX = maxX; bMaxY = maxY; bVisible = true; bBehind = anyBeh;
}

// Mirrors patchIntersectsFrontHemisphere (9 samples, epsilon -0.02).
function frontHemisphere(face: i32, u0: f64, v0: f64, u1: f64, v1: f64): bool {
	const um = (u0 + u1) * 0.5;
	const vm = (v0 + v1) * 0.5;
	const eps: f64 = -0.02;
	for (let i = 0; i < 9; i++) {
		cubeDir(face, sampleU(i, u0, u1, um), sampleV(i, v0, v1, vm));
		if (dX * gHemiCamX + dY * gHemiCamY + dZ * gHemiCamZ > eps) return true;
	}
	return false;
}

// @ts-ignore: decorator
@inline
function diameterOf(visible: bool, minX: f64, minY: f64, maxX: f64, maxY: f64): f64 {
	if (!visible) return 0;
	const w = maxX - minX;
	const h = maxY - minY;
	return w > h ? w : h;
}

// @ts-ignore: decorator
@inline
function areaOf(visible: bool, minX: f64, minY: f64, maxX: f64, maxY: f64): f64 {
	if (!visible) return 0;
	const w = maxX - minX > 0 ? maxX - minX : 0;
	const h = maxY - minY > 0 ? maxY - minY : 0;
	return w * h;
}

// @ts-ignore: decorator
@inline
function isOutside(visible: bool, minX: f64, minY: f64, maxX: f64, maxY: f64, margin: f64): bool {
	if (!visible) return true;
	return maxX < -margin || minX > gVw + margin || maxY < -margin || minY > gVh + margin;
}

// @ts-ignore: decorator
@inline
function intersectsViewport(visible: bool, minX: f64, minY: f64, maxX: f64, maxY: f64, margin: f64): bool {
	return visible && !isOutside(visible, minX, minY, maxX, maxY, margin);
}

function resolutionFromDiameter(diameterPx: f64, targetPx: f64, maxRes: i32): i32 {
	let cells = Math.ceil(diameterPx / targetPx);
	if (cells < 1.0) cells = 1.0;
	if (<f64>RES0 >= cells && RES0 <= maxRes) return RES0;
	if (<f64>RES1 >= cells && RES1 <= maxRes) return RES1;
	if (<f64>RES2 >= cells && RES2 <= maxRes) return RES2;
	if (<f64>RES3 >= cells && RES3 <= maxRes) return RES3;
	if (<f64>RES4 >= cells && RES4 <= maxRes) return RES4;
	return maxRes < RES4 ? maxRes : RES4;
}

function chooseMaxDepth(altitude: f64, radius: f64): i32 {
	const altRatio = altitude / (radius > 1 ? radius : 1);
	if (altRatio > 3) return 4;
	if (altRatio > 1) return 5;
	return 6;
}

function chooseOrbitRes(altitude: f64, radius: f64): i32 {
	const altRatio = altitude / (radius > 1 ? radius : 1);
	if (altRatio >= 3) return 8;
	if (altRatio >= 1) return 16;
	if (altRatio >= 0.3) return 32;
	if (altRatio >= 0.1) return 64;
	return 96;
}

// @ts-ignore: decorator
@inline
function storeNode(stackPtr: usize, sp: i32, u0: f64, v0: f64, u1: f64, v1: f64, depth: f64): void {
	const base = stackPtr + (<usize>sp) * NODE_STRIDE;
	store<f64>(base, u0);
	store<f64>(base + 8, v0);
	store<f64>(base + 16, u1);
	store<f64>(base + 24, v1);
	store<f64>(base + 32, depth);
}

export function scheduleOrbit(
	vpPtr: usize,
	camPtr: usize,
	planetRadius: f64,
	vw: f64,
	vh: f64,
	targetSpacing: f64,
	stackPtr: usize,
	outPtr: usize,
	outMax: i32,
	maxDepthOverride: i32,
	maxResOverride: i32
): i32 {
	m0 = <f64>load<f32>(vpPtr); m1 = <f64>load<f32>(vpPtr + 4); m3 = <f64>load<f32>(vpPtr + 12);
	m4 = <f64>load<f32>(vpPtr + 16); m5 = <f64>load<f32>(vpPtr + 20); m7 = <f64>load<f32>(vpPtr + 28);
	m8 = <f64>load<f32>(vpPtr + 32); m9 = <f64>load<f32>(vpPtr + 36); m11 = <f64>load<f32>(vpPtr + 44);
	m12 = <f64>load<f32>(vpPtr + 48); m13 = <f64>load<f32>(vpPtr + 52); m15 = <f64>load<f32>(vpPtr + 60);
	gVw = vw; gVh = vh; gRadius = planetRadius;

	const camX = load<f64>(camPtr);
	const camY = load<f64>(camPtr + 8);
	const camZ = load<f64>(camPtr + 16);
	gHemiCamX = load<f64>(camPtr + 24);
	gHemiCamY = load<f64>(camPtr + 32);
	gHemiCamZ = load<f64>(camPtr + 40);
	const camLen = Math.sqrt(camX * camX + camY * camY + camZ * camZ);
	if (camLen < 1e-12) { gCamX = 0; gCamY = 0; gCamZ = 1; }
	else { gCamX = camX / camLen; gCamY = camY / camLen; gCamZ = camZ / camLen; }

	let altitude = camLen - planetRadius;
	if (altitude < 0) altitude = 0;
	// Override (>0) caps the auto altitude-based choice; 0 = auto (mirrors the JS
	// `input.maxDepth ?? chooseMaxDepth` / `?? chooseOrbitPatchResolution`).
	const maxDepth = maxDepthOverride > 0 ? maxDepthOverride : chooseMaxDepth(altitude, planetRadius);
	const maxRes = maxResOverride > 0 ? maxResOverride : chooseOrbitRes(altitude, planetRadius);
	const searchMargin = vw > vh ? vw : vh;
	const target = targetSpacing;

	let count: i32 = 0;

	for (let face = 0; face < 6; face++) {
		computeBounds(face, 0, 0, 1, 1, true);
		const rootOnScreen = intersectsViewport(bVisible, bMinX, bMinY, bMaxX, bMaxY, VIEWPORT_CULL_MARGIN_PX);
		const rootOnHemi = frontHemisphere(face, 0, 0, 1, 1);
		if (!rootOnScreen && !rootOnHemi) continue;

		let sp: i32 = 0;
		storeNode(stackPtr, sp, 0, 0, 1, 1, 0); sp++;

		while (sp > 0) {
			sp--;
			const base = stackPtr + (<usize>sp) * NODE_STRIDE;
			const u0 = load<f64>(base);
			const v0 = load<f64>(base + 8);
			const u1 = load<f64>(base + 16);
			const v1 = load<f64>(base + 24);
			const depth = <i32>load<f64>(base + 32);

			computeBounds(face, u0, v0, u1, v1, true);
			const cVis = bVisible, cBeh = bBehind;
			const cMinX = bMinX, cMinY = bMinY, cMaxX = bMaxX, cMaxY = bMaxY;

			const straddle = cBeh && cVis;
			const onOrNear = straddle || intersectsViewport(cVis, cMinX, cMinY, cMaxX, cMaxY, VIEWPORT_CULL_MARGIN_PX);
			const diameterPx = straddle ? Infinity : diameterOf(cVis, cMinX, cMinY, cMaxX, cMaxY);

			let inSearch = onOrNear || intersectsViewport(cVis, cMinX, cMinY, cMaxX, cMaxY, searchMargin);
			if (!inSearch && !cVis && frontHemisphere(face, u0, v0, u1, v1)) inSearch = true;
			if (!onOrNear && !inSearch) continue;

			const depthLimit = straddle ? (maxDepth < STRADDLE_MAX_DEPTH ? maxDepth : STRADDLE_MAX_DEPTH) : maxDepth;
			let shouldSub: bool = false;
			if (depth < depthLimit) {
				shouldSub = onOrNear ? diameterPx > target * 2.0 : inSearch;
			}
			if (shouldSub) {
				const um = (u0 + u1) * 0.5;
				const vm = (v0 + v1) * 0.5;
				const d = <f64>(depth + 1);
				storeNode(stackPtr, sp, u0, v0, um, vm, d); sp++;
				storeNode(stackPtr, sp, um, v0, u1, vm, d); sp++;
				storeNode(stackPtr, sp, u0, vm, um, v1, d); sp++;
				storeNode(stackPtr, sp, um, vm, u1, v1, d); sp++;
				continue;
			}

			const onHemi = frontHemisphere(face, u0, v0, u1, v1);
			const limbTile = !cVis && onHemi;

			let eVis: bool, eMinX: f64, eMinY: f64, eMaxX: f64, eMaxY: f64;
			if (limbTile || !cVis) {
				computeBounds(face, u0, v0, u1, v1, false);
				eVis = bVisible; eMinX = bMinX; eMinY = bMinY; eMaxX = bMaxX; eMaxY = bMaxY;
			} else {
				eVis = cVis; eMinX = cMinX; eMinY = cMinY; eMaxX = cMaxX; eMaxY = cMaxY;
			}

			const overlaps = eVis && !isOutside(eVis, eMinX, eMinY, eMaxX, eMaxY, 0);
			if (!onOrNear && !limbTile && !overlaps) continue;

			const emitDiameter = straddle ? Infinity : diameterOf(eVis, eMinX, eMinY, eMaxX, eMaxY);
			const minDiam = onOrNear ? target : target * 2.0;
			const dArg = emitDiameter > minDiam ? emitDiameter : minDiam;
			const rawRes = resolutionFromDiameter(dArg, target, maxRes);
			const res = straddle ? (rawRes < STRADDLE_MAX_RESOLUTION ? rawRes : STRADDLE_MAX_RESOLUTION) : rawRes;

			cubeDir(face, (u0 + u1) * 0.5, (v0 + v1) * 0.5);
			let facing = dX * gHemiCamX + dY * gHemiCamY + dZ * gHemiCamZ;
			if (facing < 0) facing = 0;
			const priority = areaOf(eVis, eMinX, eMinY, eMaxX, eMaxY) * facing;

			if (count < outMax) {
				const ob = outPtr + (<usize>count) * OUT_STRIDE;
				store<f64>(ob, <f64>face);
				store<f64>(ob + 8, u0);
				store<f64>(ob + 16, v0);
				store<f64>(ob + 24, u1);
				store<f64>(ob + 32, v1);
				store<f64>(ob + 40, <f64>res);
				store<f64>(ob + 48, priority);
				count++;
			}
		}
	}

	return count;
}

// ── Budget + pack ────────────────────────────────────────────────────────────
// Port of flatBudget.ts::selectSurvivorsFlat + packBudgetedBuckets. Consumes the
// candidate buffer scheduleOrbit wrote (7 f64 each) and emits final GPU-upload
// records (32 bytes: face:u32, uvMin:vec2f, uvMax:vec2f, resolution:u32, morph:f32,
// pad:u32) grouped per resolution. Runs entirely in linear memory — no GC, no JS
// sort. Parity is bit-exact with the TS packer (budgetAndPack.test.ts): the JS
// oracle sorts with a stable Array.sort, mirrored here by a total-order comparator
// (priority, then original index), so ties resolve identically.

const PATCH_STRIDE: usize = 32; // GPU record bytes (CUBE_SPHERE_PATCH_BYTE_SIZE)

// @ts-ignore: decorator
@inline
function vtxOf(r: i32): f64 { return <f64>r * <f64>r * 6.0; }

// Mirrors vertexBudget.ts::coarsenResolution.
// @ts-ignore: decorator
@inline
function coarsenRes(r: i32): i32 {
	if (r <= 8) return 8;
	if (r <= 16) return 8;
	if (r <= 32) return 16;
	if (r <= 64) return 32;
	return 64;
}

// Resolution → dense bucket index (8,16,32,64,96 are the only values post-coarsen).
// @ts-ignore: decorator
@inline
function resIdx(r: i32): i32 {
	if (r == 8) return 0;
	if (r == 16) return 1;
	if (r == 32) return 2;
	if (r == 64) return 3;
	return 4; // 96
}

// @ts-ignore: decorator
@inline
function resByIdx(b: i32): i32 {
	if (b == 0) return 8;
	if (b == 1) return 16;
	if (b == 2) return 32;
	if (b == 3) return 64;
	return 96;
}

// Stable ascending sort of the i32 index array at `arr` (length n) by
// (key[arr[i]], arr[i]). The value tiebreak makes it a total order, so the result
// matches JS's stable Array.sort regardless of algorithm. Bottom-up merge sort
// (O(n log n), no recursion); `tmp` is i32 scratch of length n.
function sortByKey(arr: usize, n: i32, key: usize, tmp: usize): void {
	for (let width: i32 = 1; width < n; width *= 2) {
		let i: i32 = 0;
		while (i < n) {
			const lo = i;
			let mid = i + width; if (mid > n) mid = n;
			let hi = i + 2 * width; if (hi > n) hi = n;
			let a = lo, b = mid, k = lo;
			while (a < mid && b < hi) {
				const av = load<i32>(arr + (<usize>a) * 4);
				const bv = load<i32>(arr + (<usize>b) * 4);
				const ka = load<f64>(key + (<usize>av) * 8);
				const kb = load<f64>(key + (<usize>bv) * 8);
				const aWins = ka < kb || (ka == kb && av <= bv);
				if (aWins) { store<i32>(tmp + (<usize>k) * 4, av); a++; }
				else { store<i32>(tmp + (<usize>k) * 4, bv); b++; }
				k++;
			}
			while (a < mid) { store<i32>(tmp + (<usize>k) * 4, load<i32>(arr + (<usize>a) * 4)); a++; k++; }
			while (b < hi) { store<i32>(tmp + (<usize>k) * 4, load<i32>(arr + (<usize>b) * 4)); b++; k++; }
			for (let x = lo; x < hi; x++) store<i32>(arr + (<usize>x) * 4, load<i32>(tmp + (<usize>x) * 4));
			i += 2 * width;
		}
	}
}

// Budget the candidates and pack survivors into GPU records.
// Scratch (all caller-owned, each sized for `count` entries):
//   keptPtr/orderPtr/tmpPtr/resPtr : i32 ;  keyPtr : f64 ;  livePtr : u8
//   packPtr  : survivors * 32 bytes (GPU records, grouped per resolution)
//   metaPtr  : i32 dropped, i32 survivors, (pad), f64 estimatedVertices,
//              then 3 i32 per bucket [resolution, instanceCount, byteOffset]
// Returns the bucket count.
export function budgetAndPack(
	outPtr: usize,
	count: i32,
	maxVertices: f64,
	maxPatches: i32,
	keptPtr: usize,
	orderPtr: usize,
	tmpPtr: usize,
	keyPtr: usize,
	resPtr: usize,
	livePtr: usize,
	packPtr: usize,
	metaPtr: usize
): i32 {
	for (let i = 0; i < count; i++) store<i32>(keptPtr + (<usize>i) * 4, i);

	let dropped = 0;
	let K = count;

	// Patch-count cap: keep the highest-priority candidates. JS sorts `kept`
	// descending by priority (stable → ascending index on ties); replicate via
	// ascending sort on -priority with the index tiebreak.
	if (count > maxPatches) {
		for (let i = 0; i < count; i++) {
			const p = load<f64>(outPtr + (<usize>i) * OUT_STRIDE + 48);
			store<f64>(keyPtr + (<usize>i) * 8, -p);
		}
		sortByKey(keptPtr, count, keyPtr, tmpPtr);
		dropped += count - maxPatches;
		K = maxPatches;
	}

	let total: f64 = 0;
	for (let j = 0; j < K; j++) {
		const idx = load<i32>(keptPtr + (<usize>j) * 4);
		const r = <i32>load<f64>(outPtr + (<usize>idx) * OUT_STRIDE + 40);
		store<i32>(resPtr + (<usize>j) * 4, r);
		store<u8>(livePtr + (<usize>j), 1);
		total += vtxOf(r);
	}

	// Coarsen-then-drop lowest-priority survivors until within the vertex budget.
	if (total > maxVertices) {
		for (let j = 0; j < K; j++) {
			store<i32>(orderPtr + (<usize>j) * 4, j);
			const idx = load<i32>(keptPtr + (<usize>j) * 4);
			store<f64>(keyPtr + (<usize>j) * 8, load<f64>(outPtr + (<usize>idx) * OUT_STRIDE + 48));
		}
		sortByKey(orderPtr, K, keyPtr, tmpPtr); // ascending by (priority, kept-slot)
		for (let oi = 0; oi < K; oi++) {
			if (total <= maxVertices) break;
			const j = load<i32>(orderPtr + (<usize>oi) * 4);
			if (load<u8>(livePtr + (<usize>j)) == 0) continue;
			const r = load<i32>(resPtr + (<usize>j) * 4);
			const before = vtxOf(r);
			const coarser = coarsenRes(r);
			if (coarser < r) {
				store<i32>(resPtr + (<usize>j) * 4, coarser);
				total += vtxOf(coarser) - before;
				continue;
			}
			store<u8>(livePtr + (<usize>j), 0);
			total -= before;
			dropped++;
		}
	}

	// Pass 1: count survivors per resolution bucket (counts/cursors live in tmp).
	const countsPtr = tmpPtr;
	const cursorPtr = tmpPtr + 32;
	for (let b = 0; b < 5; b++) store<i32>(countsPtr + (<usize>b) * 4, 0);
	let survivors = 0;
	for (let j = 0; j < K; j++) {
		if (load<u8>(livePtr + (<usize>j)) == 0) continue;
		const b = resIdx(load<i32>(resPtr + (<usize>j) * 4));
		store<i32>(countsPtr + (<usize>b) * 4, load<i32>(countsPtr + (<usize>b) * 4) + 1);
		survivors++;
	}

	// Assign each non-empty bucket a contiguous byte block (ascending resolution).
	let byteOff = 0;
	let bucketCount = 0;
	for (let b = 0; b < 5; b++) {
		store<i32>(cursorPtr + (<usize>b) * 4, byteOff);
		const n = load<i32>(countsPtr + (<usize>b) * 4);
		if (n > 0) {
			const m = metaPtr + 16 + (<usize>bucketCount) * 12;
			store<i32>(m, resByIdx(b));
			store<i32>(m + 4, n);
			store<i32>(m + 8, byteOff);
			bucketCount++;
			byteOff += n * <i32>PATCH_STRIDE;
		}
	}

	// Pass 2: write GPU records in kept order (within-bucket order matches the TS
	// packer, so the bytes are identical).
	for (let j = 0; j < K; j++) {
		if (load<u8>(livePtr + (<usize>j)) == 0) continue;
		const idx = load<i32>(keptPtr + (<usize>j) * 4);
		const r = load<i32>(resPtr + (<usize>j) * 4);
		const b = resIdx(r);
		const at = load<i32>(cursorPtr + (<usize>b) * 4);
		store<i32>(cursorPtr + (<usize>b) * 4, at + <i32>PATCH_STRIDE);

		const cb = outPtr + (<usize>idx) * OUT_STRIDE;
		const dst = packPtr + (<usize>at);
		store<u32>(dst, <u32>(<i32>load<f64>(cb)));        // face
		store<f32>(dst + 4, <f32>load<f64>(cb + 8));        // uvMin.x
		store<f32>(dst + 8, <f32>load<f64>(cb + 16));       // uvMin.y
		store<f32>(dst + 12, <f32>load<f64>(cb + 24));      // uvMax.x
		store<f32>(dst + 16, <f32>load<f64>(cb + 32));      // uvMax.y
		store<u32>(dst + 20, <u32>r);                       // resolution
		store<f32>(dst + 24, 0);                            // morph
		store<u32>(dst + 28, 0);                            // pad
	}

	store<i32>(metaPtr, dropped);
	store<i32>(metaPtr + 4, survivors);
	store<f64>(metaPtr + 8, total);
	return bucketCount;
}
