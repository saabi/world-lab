import type { GraphDocument } from './types.js';
import { resolvePortType, typeRefToDataType } from './dataType.js';
import { dedupeCanonicalSemantics } from './semantics.js';

/** Recursively sorts object keys; arrays preserve element order. */
function sortKeys(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(sortKeys);
	}
	if (value !== null && typeof value === 'object') {
		const obj = value as Record<string, unknown>;
		const sorted: Record<string, unknown> = {};
		for (const key of Object.keys(obj).sort()) {
			sorted[key] = sortKeys(obj[key]);
		}
		return sorted;
	}
	return value;
}

/** Produces deterministic JSON with recursively sorted keys and tab indentation. */
export function serializeGraph(doc: GraphDocument): string {
	return JSON.stringify(sortKeys(normalizeGraphSemantics(doc)), null, '\t');
}

/** Enforce semantic-tag ordering on every serialized port in a graph document. */
export function normalizeGraphSemantics(doc: GraphDocument): GraphDocument {
	const normalizePorts = (ports: GraphDocument['nodes'][number]['inputs']) =>
		ports.map((port) => {
			const type = resolvePortType(port);
			const alias = port.dataType ?? typeRefToDataType(type);
			return {
				...port,
				type,
				...(alias !== undefined ? { dataType: alias } : {}),
				...(port.semantics !== undefined
					? { semantics: dedupeCanonicalSemantics(port.semantics) }
					: {})
			};
		});
	return {
		...doc,
		nodes: doc.nodes.map((node) => ({
			...node,
			inputs: normalizePorts(node.inputs),
			outputs: normalizePorts(node.outputs)
		}))
	};
}

/** Parses a JSON string produced by serializeGraph back to a GraphDocument. */
export function deserializeGraph(json: string): GraphDocument {
	return normalizeGraphSemantics(JSON.parse(json) as GraphDocument);
}
