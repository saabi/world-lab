import type {
	ResourceBinding,
	ResourceInstance
} from './implementation.js';
import { getPrimitive } from './registry.js';
import type { BufferUsageFlag, GraphDocument } from './types.js';

export function inferBufferUsage(
	bindings: readonly ResourceBinding[]
): BufferUsageFlag[] {
	return bindings.length > 0 ? ['storage'] : [];
}

export function resolveBufferUsage(
	declared: readonly BufferUsageFlag[],
	bindings: readonly ResourceBinding[]
): BufferUsageFlag[] {
	return [...new Set([...declared, ...inferBufferUsage(bindings)])];
}

export function collectResourceInstances(doc: GraphDocument): ResourceInstance[] {
	const instances: ResourceInstance[] = [];
	for (const node of doc.nodes) {
		const implementation = getPrimitive(node.primitive)?.implementation;
		if (implementation?.kind === 'resource') {
			instances.push({ id: node.id, ...implementation.template });
		}
	}
	return instances;
}
