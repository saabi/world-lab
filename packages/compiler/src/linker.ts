export interface ShaderLinker {
	/** `entry` is the id of the root module in `modules`; returns one assembled WGSL string. */
	link(input: { entry: string; modules: Record<string, string> }): string;
}

const FN_DEF = /fn\s+(\w+)\s*\(/g;
const CALL = /(\w+)\s*\(/g;

function indexFunctions(modules: Record<string, string>): Map<string, string> {
	const fnToModule = new Map<string, string>();

	for (const [moduleId, source] of Object.entries(modules)) {
		for (const match of source.matchAll(FN_DEF)) {
			fnToModule.set(match[1], moduleId);
		}
	}

	return fnToModule;
}

function getCalledModules(source: string, fnToModule: Map<string, string>): string[] {
	const called = new Set<string>();

	for (const match of source.matchAll(CALL)) {
		const moduleId = fnToModule.get(match[1]);
		if (moduleId) {
			called.add(moduleId);
		}
	}

	return [...called];
}

function collectReachable(
	entry: string,
	modules: Record<string, string>,
	fnToModule: Map<string, string>,
): Set<string> {
	const reachable = new Set<string>();
	const visiting = new Set<string>();

	function visit(moduleId: string): void {
		if (reachable.has(moduleId)) {
			return;
		}
		if (visiting.has(moduleId)) {
			return;
		}

		visiting.add(moduleId);
		reachable.add(moduleId);

		for (const dep of getCalledModules(modules[moduleId], fnToModule)) {
			if (dep in modules) {
				visit(dep);
			}
		}

		visiting.delete(moduleId);
	}

	visit(entry);
	return reachable;
}

function emitOrder(
	entry: string,
	modules: Record<string, string>,
	reachable: Set<string>,
	fnToModule: Map<string, string>,
): string[] {
	const emitted = new Set<string>();
	const visiting = new Set<string>();
	const order: string[] = [];

	function visit(moduleId: string): void {
		if (emitted.has(moduleId) || !reachable.has(moduleId)) {
			return;
		}
		if (visiting.has(moduleId)) {
			return;
		}

		visiting.add(moduleId);

		for (const dep of getCalledModules(modules[moduleId], fnToModule)) {
			visit(dep);
		}

		visiting.delete(moduleId);

		if (!emitted.has(moduleId)) {
			emitted.add(moduleId);
			order.push(moduleId);
		}
	}

	visit(entry);
	return order;
}

/** Default text-based linker: reachability from the entry, dead modules dropped, callees first, deduped. */
export const textLinker: ShaderLinker = {
	link({ entry, modules }) {
		if (!(entry in modules)) {
			throw new Error(`Unknown entry module: ${entry}`);
		}

		const fnToModule = indexFunctions(modules);
		const reachable = collectReachable(entry, modules, fnToModule);
		const order = emitOrder(entry, modules, reachable, fnToModule);

		return order.map((moduleId) => modules[moduleId]).join('\n\n');
	},
};
