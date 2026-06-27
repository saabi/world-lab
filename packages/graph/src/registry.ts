import type { NodePrimitive } from './primitive.js';

const primitives = new Map<string, NodePrimitive>();
const insertionOrder: NodePrimitive[] = [];

export function registerPrimitive(p: NodePrimitive): void {
	if (primitives.has(p.id)) {
		throw new Error(`Primitive already registered: ${p.id}`);
	}
	primitives.set(p.id, p);
	insertionOrder.push(p);
}

/** Replace an already-registered primitive in place (preserves palette order). */
export function replacePrimitive(p: NodePrimitive): void {
	if (!primitives.has(p.id)) {
		throw new Error(`Primitive not registered: ${p.id}`);
	}
	const index = insertionOrder.findIndex((candidate) => candidate.id === p.id);
	if (index >= 0) {
		insertionOrder[index] = p;
	}
	primitives.set(p.id, p);
}

export function getPrimitive(id: string): NodePrimitive | undefined {
	return primitives.get(id);
}

export function listPrimitives(): NodePrimitive[] {
	return [...insertionOrder];
}
