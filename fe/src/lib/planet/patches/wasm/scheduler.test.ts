import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createOrbitCamera, type OrbitLookMode } from '../../camera/orbitCamera.js';
import { quatFromAxisAngle } from '../../scene/transform.js';
import {
	scheduleAdaptiveOrbitPatches,
	type OrbitSchedulerInput,
	type ScheduledPatch
} from '../cubeSphereScheduler.js';
import {
	instantiateScheduler,
	isSchedulerReady,
	scheduleAdaptiveOrbitPatchesWasm
} from './schedulerWasm.js';

// Headless parity: the WASM quadtree walk must reproduce the JS scheduler's
// patch set (face + uv geometry + resolution exactly; priority to within
// rounding). The JS scheduler stays the oracle + runtime fallback.

const wasmPath = fileURLToPath(new URL('./scheduler.wasm', import.meta.url));
const viewport = { width: 1280, height: 720 };

beforeAll(async () => {
	const bytes = fs.readFileSync(wasmPath);
	await instantiateScheduler(bytes);
});

function makeCam(
	distance: number,
	planetRadius: number,
	lookMode: OrbitLookMode = 'planet-center',
	azimuth = 0.6,
	elevation = 0.35
) {
	return createOrbitCamera({
		distance,
		azimuth,
		elevation,
		fovDeg: 60,
		aspect: viewport.width / viewport.height,
		near: 0.1,
		far: distance * 1000,
		planetRadius,
		lookMode
	});
}

function key(p: ScheduledPatch): string {
	return `${p.face}|${p.uvMin[0]}|${p.uvMin[1]}|${p.uvMax[0]}|${p.uvMax[1]}`;
}

function assertParity(input: OrbitSchedulerInput): void {
	const js = scheduleAdaptiveOrbitPatches(input);
	const wasm = scheduleAdaptiveOrbitPatchesWasm(input);
	expect(isSchedulerReady()).toBe(true);
	expect(wasm).not.toBeNull();
	const w = wasm!;

	// Same candidate count.
	expect(w.length).toBe(js.length);

	// Same geometry set + identical resolution per tile; priority within rounding.
	const jsByKey = new Map(js.map((p) => [key(p), p]));
	for (const wp of w) {
		const k = key(wp);
		const jp = jsByKey.get(k);
		expect(jp, `wasm tile ${k} missing from JS set`).toBeDefined();
		expect(wp.resolution).toBe(jp!.resolution);
		const denom = Math.max(Math.abs(jp!.priority), 1e-6);
		expect(Math.abs(wp.priority - jp!.priority) / denom).toBeLessThan(1e-6);
	}
}

describe('scheduler.wasm parity with JS scheduleAdaptiveOrbitPatches', () => {
	const radius = 100;
	const cases: Array<{ name: string; distance: number; lookMode?: OrbitLookMode }> = [
		{ name: 'high orbit', distance: 520 },
		{ name: 'mid orbit', distance: 240 },
		{ name: 'low orbit', distance: 140 },
		{ name: 'near surface', distance: 105 },
		{ name: 'very low (near-plane straddle)', distance: 100.6, lookMode: 'horizon' },
		{ name: 'horizon look', distance: 180, lookMode: 'horizon' }
	];

	for (const c of cases) {
		it(`matches at ${c.name} (d=${c.distance})`, () => {
			const cam = makeCam(c.distance, radius, c.lookMode);
			assertParity({
				cameraPos: cam.position,
				planetRadius: radius,
				viewProj: cam.viewProjectionMatrix,
				viewport,
				targetVertexSpacingPx: 6
			});
		});
	}

	it('matches across azimuth/elevation sweep', () => {
		for (let i = 0; i < 8; i++) {
			const cam = makeCam(200, radius, 'planet-center', i * 0.7, -0.6 + i * 0.18);
			assertParity({
				cameraPos: cam.position,
				planetRadius: radius,
				viewProj: cam.viewProjectionMatrix,
				viewport,
				targetVertexSpacingPx: 8
			});
		}
	});

	it('matches with maxPatchResolution + maxDepth caps applied', () => {
		const caps: Array<{ maxPatchResolution?: number; maxDepth?: number }> = [
			{ maxPatchResolution: 16 },
			{ maxDepth: 4 },
			{ maxPatchResolution: 16, maxDepth: 4 },
			{ maxPatchResolution: 32, maxDepth: 5 }
		];
		for (const cap of caps) {
			for (const distance of [105, 140, 240]) {
				const cam = makeCam(distance, radius);
				assertParity({
					cameraPos: cam.position,
					planetRadius: radius,
					viewProj: cam.viewProjectionMatrix,
					viewport,
					targetVertexSpacingPx: 6,
					...cap
				});
			}
		}
	});

	it('caps actually bind (resolution + depth bounded vs auto)', () => {
		const cam = makeCam(105, radius);
		const base = {
			cameraPos: cam.position,
			planetRadius: radius,
			viewProj: cam.viewProjectionMatrix,
			viewport,
			targetVertexSpacingPx: 6
		};
		const auto = scheduleAdaptiveOrbitPatchesWasm(base)!;
		const capped = scheduleAdaptiveOrbitPatchesWasm({ ...base, maxPatchResolution: 16 })!;
		expect(auto.some((p) => p.resolution > 16)).toBe(true);
		expect(capped.every((p) => p.resolution <= 16)).toBe(true);
	});

	it('matches at star scale (radius 1e6)', () => {
		const bigRadius = 1_000_000;
		const cam = makeCam(2_400_000, bigRadius);
		assertParity({
			cameraPos: cam.position,
			planetRadius: bigRadius,
			viewProj: cam.viewProjectionMatrix,
			viewport,
			targetVertexSpacingPx: 6
		});
	});

	it('matches with non-identity planet rotation (body-fixed scheduling)', () => {
		const rot = quatFromAxisAngle([0, 1, 0], 0.9);
		for (const distance of [105, 140, 240]) {
			const cam = makeCam(distance, radius);
			assertParity({
				cameraPos: cam.position,
				planetRadius: radius,
				viewProj: cam.viewProjectionMatrix,
				viewport,
				targetVertexSpacingPx: 6,
				planetRotation: rot
			});
		}
	});

	it('benchmarks wasm vs js full schedule throughput', { timeout: 30000 }, () => {
		const cam = makeCam(140, radius);
		const input: OrbitSchedulerInput = {
			cameraPos: cam.position,
			planetRadius: radius,
			viewProj: cam.viewProjectionMatrix,
			viewport,
			targetVertexSpacingPx: 6
		};
		const ITERS = 200;
		for (let k = 0; k < 30; k++) {
			scheduleAdaptiveOrbitPatchesWasm(input);
			scheduleAdaptiveOrbitPatches(input);
		}
		const t0 = performance.now();
		for (let k = 0; k < ITERS; k++) scheduleAdaptiveOrbitPatchesWasm(input);
		const wasmMs = performance.now() - t0;
		const t1 = performance.now();
		for (let k = 0; k < ITERS; k++) scheduleAdaptiveOrbitPatches(input);
		const jsMs = performance.now() - t1;
		fs.writeFileSync(
			'/tmp/wasm-scheduler-bench.txt',
			`iters=${ITERS} wasm=${wasmMs.toFixed(1)}ms js=${jsMs.toFixed(1)}ms speedup=${(jsMs / wasmMs).toFixed(2)}x\n`
		);
		expect(wasmMs).toBeGreaterThan(0);
	});
});
