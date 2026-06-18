import { describe, expect, it } from 'vitest';
import { createOrbitCamera } from '../camera/orbitCamera.js';
import {
	chooseOrbitPatchResolution,
	cubeFaceUvToPosition,
	cubeFaceUvToUnitDir,
	cubePatchVertexCount,
	getOrbitScheduleStats,
	resetOrbitScheduleCache,
	scheduleOrbitPatches
} from './cubeSphere.js';
import { isCubeFaceOnScreen, scheduleAdaptiveOrbitPatches } from './cubeSphereScheduler.js';
import { DEFAULT_MAX_VERTICES_PER_FRAME } from './vertexBudget.js';
describe('cubeSphere mapping', () => {
	it('maps face center UV to axis direction', () => {
		const pos = cubeFaceUvToPosition(0, 0.5, 0.5);
		expect(pos[0]).toBeCloseTo(1, 5);
		expect(pos[1]).toBeCloseTo(0, 5);
		expect(pos[2]).toBeCloseTo(0, 5);
	});

	it('normalizes to unit direction', () => {
		const dir = cubeFaceUvToUnitDir(4, 0.25, 0.75);
		const len = Math.hypot(dir[0], dir[1], dir[2]);
		expect(len).toBeCloseTo(1, 5);
	});

	it('covers all six faces without NaN', () => {
		for (let face = 0; face < 6; face++) {
			const dir = cubeFaceUvToUnitDir(face, 0.1, 0.9);
			expect(Number.isFinite(dir[0])).toBe(true);
			expect(Number.isFinite(dir[1])).toBe(true);
			expect(Number.isFinite(dir[2])).toBe(true);
		}
	});

	it('raises tessellation when the camera moves closer', () => {
		expect(chooseOrbitPatchResolution(300, 100)).toBe(8);
		expect(chooseOrbitPatchResolution(150, 100)).toBe(16);
		expect(chooseOrbitPatchResolution(40, 100)).toBe(32);
		expect(chooseOrbitPatchResolution(10, 100)).toBe(64);
		expect(chooseOrbitPatchResolution(5, 100)).toBe(96);
		expect(cubePatchVertexCount(96)).toBe(96 * 96 * 6);
	});

	it('schedules adaptive patches within vertex budget at close zoom', () => {
		const cam = createOrbitCamera({
			distance: 105,
			azimuth: 0.6,
			elevation: 0.35,
			fovDeg: 60,
			aspect: 16 / 9,
			near: 0.1,
			far: 10_000,
			planetRadius: 100
		});
		const result = scheduleOrbitPatches(cam.position, 100, cam.viewProjectionMatrix, {
			viewport: { width: 1920, height: 1080 },
			focalLengthPx: cam.focalLengthPx,
			maxVertices: DEFAULT_MAX_VERTICES_PER_FRAME
		});
		expect(result.patches.length).toBeGreaterThan(0);
		expect(result.patches.length).toBeLessThanOrEqual(4096);
		expect(result.estimatedVertices).toBeLessThanOrEqual(DEFAULT_MAX_VERTICES_PER_FRAME);
		expect(result.buckets.size).toBeGreaterThan(0);
	});

	it('reuses the schedule for sub-threshold camera motion and refreshes past it', () => {
		resetOrbitScheduleCache();
		const viewport = { width: 1280, height: 720 };
		const make = (distance: number) =>
			createOrbitCamera({
				distance,
				azimuth: 0.6,
				elevation: 0.35,
				fovDeg: 60,
				aspect: viewport.width / viewport.height,
				near: 0.1,
				far: 10_000,
				planetRadius: 100,
				lookMode: 'planet-center'
			});

		const first = make(320);
		const r1 = scheduleOrbitPatches(first.position, 100, first.viewProjectionMatrix, { viewport });

		// Sub-threshold nudge (≈0.1 m « 1% of ~220 m altitude) → same cached result.
		const nudged = make(320.1);
		const r2 = scheduleOrbitPatches(nudged.position, 100, nudged.viewProjectionMatrix, { viewport });
		expect(r2).toBe(r1);

		// Large move → fresh schedule.
		const moved = make(600);
		const r3 = scheduleOrbitPatches(moved.position, 100, moved.viewProjectionMatrix, { viewport });
		expect(r3).not.toBe(r1);

		const stats = getOrbitScheduleStats();
		expect(stats.hits).toBe(1); // the sub-threshold nudge
		expect(stats.misses).toBe(2); // first call + the large move
	});

	it('keeps grazing faces that still intersect the viewport', () => {
		const cam = createOrbitCamera({
			distance: 320,
			azimuth: 0.6,
			elevation: 0.35,
			fovDeg: 60,
			aspect: 16 / 9,
			near: 0.1,
			far: 10_000,
			planetRadius: 100
		});
		let facesOnScreen = 0;
		for (let face = 0; face < 6; face++) {
			if (
				isCubeFaceOnScreen(face, cam.position, 100, cam.viewProjectionMatrix, {
					width: 1920,
					height: 1080
				})
			) {
				facesOnScreen++;
			}
		}
		expect(facesOnScreen).toBeGreaterThanOrEqual(3);
		expect(facesOnScreen).toBeLessThanOrEqual(6);

		const patches = scheduleAdaptiveOrbitPatches({
			cameraPos: cam.position,
			planetRadius: 100,
			viewProj: cam.viewProjectionMatrix,
			viewport: { width: 1920, height: 1080 }
		});
		const facesUsed = new Set(patches.map((p) => p.face));
		expect(facesUsed.size).toBeGreaterThanOrEqual(3);
		expect(facesUsed.size).toBeLessThanOrEqual(facesOnScreen);
	});
});