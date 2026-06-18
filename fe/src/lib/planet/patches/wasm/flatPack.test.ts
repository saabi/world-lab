import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createOrbitCamera, type OrbitLookMode } from '../../camera/orbitCamera.js';
import { type OrbitSchedulerInput } from '../cubeSphereScheduler.js';
import { budgetAndGroupFlat, packBudgetedBuckets } from '../flatBudget.js';
import { encodeCubeSpherePatches, MAX_CUBE_PATCHES } from '../../params/gpuBuffers.js';
import { CUBE_SPHERE_PATCH_BYTE_SIZE } from '../../params/planetParams.js';
import { instantiateScheduler, scheduleCandidatesFlat } from './schedulerWasm.js';

// Byte parity: packBudgetedBuckets (flat path → GPU bytes) must reproduce
// encodeCubeSpherePatches(budgetAndGroupFlat buckets) byte-for-byte. Both consume
// the same survivor selection (selectSurvivorsFlat), so this guards the byte
// writer + per-resolution blocking, not the budget logic (flatBudget.test.ts).

const wasmPath = fileURLToPath(new URL('./scheduler.wasm', import.meta.url));
const viewport = { width: 1280, height: 720 };

beforeAll(async () => {
	await instantiateScheduler(fs.readFileSync(wasmPath));
});

function makeInput(distance: number, lookMode: OrbitLookMode = 'planet-center'): OrbitSchedulerInput {
	const cam = createOrbitCamera({
		distance,
		azimuth: 0.6,
		elevation: 0.35,
		fovDeg: 60,
		aspect: viewport.width / viewport.height,
		near: 0.1,
		far: distance * 1000,
		planetRadius: 100,
		lookMode
	});
	return {
		cameraPos: cam.position,
		planetRadius: 100,
		viewProj: cam.viewProjectionMatrix,
		viewport,
		targetVertexSpacingPx: 6
	};
}

function assertPackParity(input: OrbitSchedulerInput, maxVertices: number): void {
	const flat = scheduleCandidatesFlat(input)!;

	// Object oracle bytes: budget → group → encode each bucket.
	const objRes = budgetAndGroupFlat(flat.view, flat.count, maxVertices, MAX_CUBE_PATCHES);

	// Flat packer (re-runs selection on the same buffer; deterministic).
	const packed = packBudgetedBuckets(flat.view, flat.count, maxVertices, MAX_CUBE_PATCHES);

	expect(packed.patchCount).toBe(objRes.patches.length);
	expect(packed.dropped).toBe(objRes.dropped);
	expect(packed.estimatedVertices).toBe(objRes.estimatedVertices);

	// Same set of resolution buckets with matching instance counts.
	const packedByRes = new Map(packed.packedBuckets.map((b) => [b.resolution, b]));
	expect([...packedByRes.keys()].sort((a, b) => a - b)).toEqual(
		[...objRes.buckets.keys()].sort((a, b) => a - b)
	);

	for (const [res, list] of objRes.buckets) {
		const bucket = packedByRes.get(res);
		expect(bucket, `packed bucket res=${res} missing`).toBeDefined();
		expect(bucket!.instanceCount).toBe(list.length);
		expect(bucket!.data.byteLength).toBe(list.length * CUBE_SPHERE_PATCH_BYTE_SIZE);

		// Byte-for-byte: packer output == encodeCubeSpherePatches(object survivors).
		const expected = new Uint8Array(encodeCubeSpherePatches(list));
		expect(bucket!.data).toEqual(expected);
	}
}

describe('packBudgetedBuckets byte parity with encodeCubeSpherePatches', () => {
	const cases: Array<{ name: string; distance: number; lookMode?: OrbitLookMode }> = [
		{ name: 'high orbit (no budget pressure)', distance: 520 },
		{ name: 'mid orbit', distance: 240 },
		{ name: 'low orbit', distance: 140 },
		{ name: 'near surface (vertex budget bites)', distance: 105 },
		{ name: 'horizon look', distance: 180, lookMode: 'horizon' }
	];

	for (const c of cases) {
		it(`matches at default budget — ${c.name}`, () => {
			assertPackParity(makeInput(c.distance, c.lookMode), 8_000_000);
		});
		it(`matches under tight vertex budget (coarsen + drop) — ${c.name}`, () => {
			assertPackParity(makeInput(c.distance, c.lookMode), 400_000);
		});
	}
});
