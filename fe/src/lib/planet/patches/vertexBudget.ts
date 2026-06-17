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
 * Drop or coarsen lowest-priority patches until total vertex count fits the budget.
 */
export function applyVertexBudget(
	patches: ScheduledPatch[],
	maxVertices: number = DEFAULT_MAX_VERTICES_PER_FRAME
): VertexBudgetResult {
	const working: (ScheduledPatch | null)[] = patches.map((p) => ({ ...p }));
	let total = working.reduce((sum, p) => sum + cubePatchVertexCount(p!.resolution), 0);
	let dropped = 0;

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
