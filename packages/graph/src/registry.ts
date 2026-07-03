import type { NodePrimitive, NodePrimitiveInput, PortSpec, PortSpecInput } from './primitive.js';
import { dataTypeToTypeRef, typeRefToDataType } from './dataType.js';
import { dedupeCanonicalSemantics } from './semantics.js';

const primitives = new Map<string, NodePrimitive>();
const insertionOrder: NodePrimitive[] = [];

function normalizePortSpec(port: PortSpecInput | PortSpec): PortSpec {
	if (port.type === undefined && port.dataType === undefined) {
		throw new Error(`Port ${port.name} has neither type nor dataType`);
	}
	const type = port.type ?? dataTypeToTypeRef(port.dataType!);
	const inferredAlias = typeRefToDataType(type);
	if (port.dataType !== undefined && inferredAlias !== port.dataType) {
		throw new Error(`Port type/dataType mismatch on ${port.name}`);
	}
	return {
		...port,
		type,
		...(port.dataType !== undefined
			? { dataType: port.dataType }
			: inferredAlias !== undefined
				? { dataType: inferredAlias }
				: {}),
		...(port.semantics !== undefined
			? { semantics: dedupeCanonicalSemantics(port.semantics) }
			: {})
	};
}

export function normalizePrimitiveInput(input: NodePrimitiveInput | NodePrimitive): NodePrimitive {
	return {
		...input,
		inputs: input.inputs.map(normalizePortSpec),
		outputs: input.outputs.map(normalizePortSpec)
	};
}

export function registerPrimitive(p: NodePrimitiveInput | NodePrimitive): void {
	if (primitives.has(p.id)) {
		throw new Error(`Primitive already registered: ${p.id}`);
	}
	const normalized = normalizePrimitiveInput(p);
	primitives.set(normalized.id, normalized);
	insertionOrder.push(normalized);
}

/** Replace an already-registered primitive in place (preserves palette order). */
export function replacePrimitive(p: NodePrimitiveInput | NodePrimitive): void {
	if (!primitives.has(p.id)) {
		throw new Error(`Primitive not registered: ${p.id}`);
	}
	const normalized = normalizePrimitiveInput(p);
	const index = insertionOrder.findIndex((candidate) => candidate.id === p.id);
	if (index >= 0) {
		insertionOrder[index] = normalized;
	}
	primitives.set(normalized.id, normalized);
}

export function getPrimitive(id: string): NodePrimitive | undefined {
	return primitives.get(id);
}

export function listPrimitives(): NodePrimitive[] {
	return [...insertionOrder];
}
