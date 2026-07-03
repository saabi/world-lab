import type { ResourceBinding } from './implementation.js';
import type { BufferUsageFlag } from './types.js';

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
