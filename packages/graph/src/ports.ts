import { resolveCoercion } from './coercion.js';
import {
	canonicalDataType,
	resolvePortDataType,
	resolvePortType,
	type PortTypeLike
} from './dataType.js';
import type { DataType } from './types.js';

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

/** Whether an output port type may connect to an input port type. */
export function compatiblePortTypes(from: PortTypeLike, to: PortTypeLike): boolean {
	const fromAlias = resolvePortDataType(from);
	const toAlias = resolvePortDataType(to);
	if (fromAlias && toAlias && compatibleDataTypes(fromAlias, toAlias)) return true;
	return resolveCoercion(resolvePortType(from), resolvePortType(to)) !== null;
}
