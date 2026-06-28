import type { DataType } from './types.js';

/** Whether an output data type may connect to an input port type. */
export function compatibleDataTypes(from: DataType, to: DataType): boolean {
	if (from === to) return true;
	// Plane UV (vec2f) promoted to vec3f inputs (z = 0) — matches runtime-cpu evalGraph.
	if (from === 'vec2f' && to === 'vec3f') return true;

	// list<T> compatibility rules
	if (to.startsWith('list<') && to.endsWith('>')) {
		const innerType = to.slice(5, -1) as DataType;
		// A list<T> accepts connection from T (or compatible)
		if (compatibleDataTypes(from, innerType)) return true;
		// A list<T> accepts connection from a storageBuffer
		if (from === 'storageBuffer') return true;
	}

	return false;
}
