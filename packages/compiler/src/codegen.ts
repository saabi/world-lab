import { callableWgslSource, getPrimitive } from '@world-lab/graph';

import type { GraphSlice } from './slice.js';

/** A resolved WGSL function module (exports functions, not a complete shader). */
export interface WgslModule {
	id: string;
	source: string;
	dependencies?: string[]; // other module ids this one needs
}

/** Maps a stable module id to its source. Implementations: in-memory, procedural-wgsl, file loader. */
export interface WgslModuleResolver {
	resolve(moduleId: string): Promise<WgslModule>;
}

export interface GeneratedWgsl {
	code: string; // concatenated module sources, dependency-ordered, deduped
	moduleIds: string[]; // included modules in emit order
}

export async function generateWgsl(
	slice: GraphSlice,
	resolver: WgslModuleResolver,
): Promise<GeneratedWgsl> {
	const roots: string[] = [];

	for (const node of slice.nodes) {
		const prim = getPrimitive(node.primitive);
		if (!prim) {
			throw new Error(`Unknown primitive: ${node.primitive}`);
		}
		const wgsl = callableWgslSource(prim);
		if (wgsl) roots.push(wgsl.moduleId);
	}

	const emitted = new Set<string>();
	const moduleIds: string[] = [];
	const sources: string[] = [];
	const visiting = new Set<string>();

	async function visit(moduleId: string): Promise<void> {
		if (emitted.has(moduleId)) {
			return;
		}
		if (visiting.has(moduleId)) {
			return;
		}

		visiting.add(moduleId);
		const mod = await resolver.resolve(moduleId);
		if (!mod) {
			throw new Error(`Unknown module: ${moduleId}`);
		}

		for (const dep of mod.dependencies ?? []) {
			await visit(dep);
		}

		visiting.delete(moduleId);

		if (!emitted.has(moduleId)) {
			emitted.add(moduleId);
			moduleIds.push(moduleId);
			sources.push(mod.source);
		}
	}

	for (const root of roots) {
		await visit(root);
	}

	return {
		code: sources.join('\n\n'),
		moduleIds,
	};
}
