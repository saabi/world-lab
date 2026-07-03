import type { NodePrimitive } from './primitive.js';
import { dedupeCanonicalSemantics } from './semantics.js';

const primitives = new Map<string, NodePrimitive>();
const insertionOrder: NodePrimitive[] = [];

function normalizePrimitiveSemantics(primitive: NodePrimitive): NodePrimitive {
	const normalizePorts = (ports: NodePrimitive['inputs']): NodePrimitive['inputs'] => {
		if (!ports.some((port) => port.semantics !== undefined)) return ports;
		return ports.map((port) =>
			port.semantics === undefined
				? port
				: { ...port, semantics: dedupeCanonicalSemantics(port.semantics) }
		);
	};
	const inputs = normalizePorts(primitive.inputs);
	const outputs = normalizePorts(primitive.outputs);
	if (inputs === primitive.inputs && outputs === primitive.outputs) return primitive;
	return {
		...primitive,
		inputs,
		outputs
	};
}

export function registerPrimitive(p: NodePrimitive): void {
	if (primitives.has(p.id)) {
		throw new Error(`Primitive already registered: ${p.id}`);
	}
	const normalized = normalizePrimitiveSemantics(p);
	primitives.set(normalized.id, normalized);
	insertionOrder.push(normalized);
}

/** Replace an already-registered primitive in place (preserves palette order). */
export function replacePrimitive(p: NodePrimitive): void {
	if (!primitives.has(p.id)) {
		throw new Error(`Primitive not registered: ${p.id}`);
	}
	const normalized = normalizePrimitiveSemantics(p);
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
