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

export function getPrimitive(id: string): NodePrimitive | undefined {
	return primitives.get(id);
}

export function listPrimitives(): NodePrimitive[] {
	return [...insertionOrder];
}
