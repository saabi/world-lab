import type {
	BufferResourceTarget,
	PassGraph,
	TextureResourceTarget
} from './types.js';

export interface PassOrderResult {
	order: string[];
	feedbackTargets: string[];
	lifetimes: Record<string, { firstWrite: number; lastRead: number }>;
}

export type FrameGraphIssue =
	| { kind: 'intra-frame-cycle'; cycle: string[] }
	| { kind: 'dangling-target'; pass: string; target: string }
	| { kind: 'read-write-same-pass'; pass: string; target: string }
	| { kind: 'invalid-history-read'; pass: string; target: string };

function targetIds(graph: PassGraph): Set<string> {
	return new Set(graph.targets.map((target) => target.id));
}

function passByConsumerId(graph: PassGraph): Map<string, PassGraph['passes'][number]> {
	return new Map(graph.passes.map((pass) => [pass.consumerId, pass]));
}

function writerOfTarget(
	graph: PassGraph,
	targetId: string,
): PassGraph['passes'][number] | undefined {
	return graph.passes.find((pass) => pass.writeTarget === targetId);
}

function sameFrameReads(reads: PassGraph['passes'][number]['reads']) {
	return reads.filter((read) => read.version !== 'previous');
}

function buildAdjacency(graph: PassGraph): {
	indegree: Map<string, number>;
	adjacency: Map<string, Set<string>>;
	passIds: string[];
} {
	const passIds = graph.passes.map((pass) => pass.consumerId);
	const indegree = new Map<string, number>();
	const adjacency = new Map<string, Set<string>>();

	for (const passId of passIds) {
		indegree.set(passId, 0);
		adjacency.set(passId, new Set());
	}

	for (const pass of graph.passes) {
		for (const read of sameFrameReads(pass.reads)) {
			const writer = writerOfTarget(graph, read.target);
			if (!writer || writer.consumerId === pass.consumerId) {
				continue;
			}
			const edges = adjacency.get(writer.consumerId);
			if (!edges?.has(pass.consumerId)) {
				edges?.add(pass.consumerId);
				indegree.set(pass.consumerId, (indegree.get(pass.consumerId) ?? 0) + 1);
			}
		}
	}

	return { indegree, adjacency, passIds };
}

export function validatePassGraph(graph: PassGraph): FrameGraphIssue[] {
	const issues: FrameGraphIssue[] = [];
	const knownTargets = targetIds(graph);
	const targetsById = new Map(graph.targets.map((target) => [target.id, target]));

	for (const pass of graph.passes) {
		if (!knownTargets.has(pass.writeTarget)) {
			issues.push({
				kind: 'dangling-target',
				pass: pass.consumerId,
				target: pass.writeTarget,
			});
		}

		for (const read of pass.reads) {
			if (!knownTargets.has(read.target)) {
				issues.push({
					kind: 'dangling-target',
					pass: pass.consumerId,
					target: read.target,
				});
				continue;
			}

			if (
				read.version === 'previous' &&
				targetsById.get(read.target)?.lifetime.kind !== 'history'
			) {
				issues.push({
					kind: 'invalid-history-read',
					pass: pass.consumerId,
					target: read.target,
				});
			}

			if (read.target === pass.writeTarget && read.version !== 'previous') {
				issues.push({
					kind: 'read-write-same-pass',
					pass: pass.consumerId,
					target: read.target,
				});
			}
		}
	}

	const { indegree, adjacency, passIds } = buildAdjacency(graph);
	const queue = passIds.filter((passId) => (indegree.get(passId) ?? 0) === 0);
	const sorted: string[] = [];

	while (queue.length > 0) {
		const next = queue.shift()!;
		sorted.push(next);
		for (const dependent of adjacency.get(next) ?? []) {
			const nextIndegree = (indegree.get(dependent) ?? 0) - 1;
			indegree.set(dependent, nextIndegree);
			if (nextIndegree === 0) {
				queue.push(dependent);
			}
		}
	}

	if (sorted.length !== passIds.length) {
		const cycle = passIds.filter((passId) => (indegree.get(passId) ?? 0) > 0);
		issues.push({ kind: 'intra-frame-cycle', cycle });
	}

	return issues;
}

function expandPassOrder(baseOrder: readonly string[], graph: PassGraph): string[] {
	const passes = passByConsumerId(graph);
	const expanded: string[] = [];

	for (const consumerId of baseOrder) {
		const pass = passes.get(consumerId);
		if (!pass) {
			continue;
		}
		const iterations = pass.iterations ?? 1;
		for (let index = 0; index < iterations; index += 1) {
			expanded.push(consumerId);
		}
	}

	return expanded;
}

function collectFeedbackTargets(graph: PassGraph): string[] {
	return graph.targets
		.filter((target) => target.lifetime.kind === 'history')
		.map((target) => target.id);
}

function computeLifetimes(
	graph: PassGraph,
	order: readonly string[],
): PassOrderResult['lifetimes'] {
	const lifetimes: PassOrderResult['lifetimes'] = {};
	const passes = passByConsumerId(graph);

	for (const target of graph.targets) {
		lifetimes[target.id] = { firstWrite: Number.POSITIVE_INFINITY, lastRead: -1 };
	}

	for (let index = 0; index < order.length; index += 1) {
		const pass = passes.get(order[index]!);
		if (!pass) {
			continue;
		}

		const writeLifetime = lifetimes[pass.writeTarget];
		if (writeLifetime) {
			writeLifetime.firstWrite = Math.min(writeLifetime.firstWrite, index);
			writeLifetime.lastRead = Math.max(writeLifetime.lastRead, index);
		}

		for (const read of sameFrameReads(pass.reads)) {
			const readLifetime = lifetimes[read.target];
			if (readLifetime) {
				readLifetime.lastRead = Math.max(readLifetime.lastRead, index);
			}
		}
	}

	if (graph.display && lifetimes[graph.display]) {
		const displayLifetime = lifetimes[graph.display];
		displayLifetime.lastRead = Math.max(displayLifetime.lastRead, Math.max(0, order.length - 1));
	}

	for (const target of graph.targets) {
		const lifetime = lifetimes[target.id];
		if (lifetime.firstWrite === Number.POSITIVE_INFINITY) {
			delete lifetimes[target.id];
			continue;
		}
		if (lifetime.lastRead < lifetime.firstWrite) {
			lifetime.lastRead = lifetime.firstWrite;
		}
	}

	return lifetimes;
}

function topologicalOrder(graph: PassGraph): string[] {
	const { indegree, adjacency, passIds } = buildAdjacency(graph);
	const queue = passIds.filter((passId) => (indegree.get(passId) ?? 0) === 0);
	const order: string[] = [];

	while (queue.length > 0) {
		const next = queue.shift()!;
		order.push(next);
		for (const dependent of adjacency.get(next) ?? []) {
			const nextIndegree = (indegree.get(dependent) ?? 0) - 1;
			indegree.set(dependent, nextIndegree);
			if (nextIndegree === 0) {
				queue.push(dependent);
			}
		}
	}

	return order;
}

function formatIssue(issue: FrameGraphIssue): string {
	switch (issue.kind) {
		case 'intra-frame-cycle':
			return `Intra-frame cycle: ${issue.cycle.join(' -> ')}`;
		case 'dangling-target':
			return `Dangling target "${issue.target}" referenced by pass "${issue.pass}"`;
		case 'read-write-same-pass':
			return `Pass "${issue.pass}" reads its current write target "${issue.target}"`;
		case 'invalid-history-read':
			return `Pass "${issue.pass}" reads previous version of non-history target "${issue.target}"`;
	}
}

export function buildPassOrder(graph: PassGraph): PassOrderResult {
	const issues = validatePassGraph(graph);
	if (issues.length > 0) {
		throw new Error(formatIssue(issues[0]!));
	}

	const baseOrder = topologicalOrder(graph);
	const order = expandPassOrder(baseOrder, graph);

	return {
		order,
		feedbackTargets: collectFeedbackTargets(graph),
		lifetimes: computeLifetimes(graph, order),
	};
}

export function resolveTargetSizes(
	graph: PassGraph,
	viewport: { width: number; height: number },
): Record<string, { width: number; height: number }> {
	const sizes: Record<string, { width: number; height: number }> = {};

	for (const target of graph.targets) {
		if (!isTextureResourceTarget(target)) continue;
		if (target.size.kind === 'fixed') {
			sizes[target.id] = {
				width: target.size.width,
				height: target.size.height,
			};
			continue;
		}

		sizes[target.id] = {
			width: Math.round(viewport.width * target.size.scale),
			height: Math.round(viewport.height * target.size.scale),
		};
	}

	return sizes;
}

export function resolveBufferSizes(
	graph: PassGraph,
): Record<string, { elementCount: number }> {
	const sizes: Record<string, { elementCount: number }> = {};
	for (const target of graph.targets) {
		if (!isBufferResourceTarget(target)) continue;
		sizes[target.id] = { elementCount: target.size.count };
	}
	return sizes;
}

function isBufferResourceTarget(
	target: PassGraph['targets'][number]
): target is BufferResourceTarget {
	return target.shape.kind === 'buffer';
}

function isTextureResourceTarget(
	target: PassGraph['targets'][number]
): target is TextureResourceTarget {
	return target.shape.kind === 'texture';
}
