import type { GraphDocument } from './types.js';

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
	return JSON.stringify(sortKeys(doc), null, '\t');
}

/** Parses a JSON string produced by serializeGraph back to a GraphDocument. */
export function deserializeGraph(json: string): GraphDocument {
	return JSON.parse(json) as GraphDocument;
}
