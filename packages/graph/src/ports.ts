import type { DataType } from './types.js';
import { canonicalDataType } from './dataType.js';

/** Whether an output data type may connect to an input port type. */
export function compatibleDataTypes(from: DataType | string, to: DataType | string): boolean {
	const fromCanonical = canonicalDataType(from);
	const toCanonical = canonicalDataType(to);
	if (fromCanonical === toCanonical) return true;
	if (fromCanonical === 'vec2f' && toCanonical === 'vec3f') return true;

	// tuple<T> compatibility rules
	if (toCanonical.startsWith('tuple<') && toCanonical.endsWith('>')) {
		const innerType = toCanonical.slice(6, -1) as DataType;
		if (compatibleDataTypes(fromCanonical, innerType)) return true;
		if (fromCanonical === 'storageBuffer') return true;
	}

	return false;
}
