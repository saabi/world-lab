import { cubePatchVertexCount } from './cubeSphere.js';
import type { CubeSpherePatch } from './types.js';
import type { ScheduledPatch } from './cubeSphereScheduler.js';

export const DEFAULT_MAX_VERTICES_PER_FRAME = 8_000_000;

export interface VertexBudgetResult {
	patches: CubeSpherePatch[];
	dropped: number;
}

function patchPriority(patch: ScheduledPatch): number {
	return patch.priority ?? 0;
}

function coarsenResolution(resolution: number): number {
	if (resolution <= 8) return 8;
	if (resolution <= 16) return 8;
	if (resolution <= 32) return 16;
	if (resolution <= 64) return 32;
	return 64;
}

/**
 * Drop or coarsen lowest-priority patches until they fit both the patch-count cap
 * and the per-frame vertex budget.
 */
export function applyVertexBudget(
	patches: ScheduledPatch[],
	maxVertices: number = DEFAULT_MAX_VERTICES_PER_FRAME,
	maxPatches: number = Infinity
): VertexBudgetResult {
	let kept: ScheduledPatch[] = patches.map((p) => ({ ...p }));
	let dropped = 0;

	// Patch-count cap first: keep the highest-priority patches. (Forced near-plane
	// subdivision can produce more candidates than the GPU patch buffer holds, and
	// spacing alone can't reduce them.)
	if (kept.length > maxPatches) {
		kept.sort((a, b) => patchPriority(b) - patchPriority(a));
		dropped += kept.length - maxPatches;
		kept = kept.slice(0, maxPatches);
	}

	const working: (ScheduledPatch | null)[] = kept;
	let total = working.reduce((sum, p) => sum + cubePatchVertexCount(p!.resolution), 0);

	if (total > maxVertices) {
		const order = working
			.map((p, i) => ({ i, priority: patchPriority(p!) }))
			.sort((a, b) => a.priority - b.priority);

		for (const { i } of order) {
			if (total <= maxVertices) break;
			const p = working[i];
			if (!p) continue;
			const before = cubePatchVertexCount(p.resolution);
			const coarser = coarsenResolution(p.resolution);
			if (coarser < p.resolution) {
				p.resolution = coarser;
				total += cubePatchVertexCount(p.resolution) - before;
				continue;
			}
			working[i] = null;
			total -= before;
			dropped++;
		}
	}

	return {
		patches: working.filter((p): p is ScheduledPatch => p !== null),
		dropped
	};
}
