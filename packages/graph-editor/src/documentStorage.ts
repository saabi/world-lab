import {
	deserializeGraph,
	serializeGraph,
	type GraphDocument
} from '@virtual-planet/graph';

export const GRAPH_EDITOR_STORAGE_KEY = 'virtual-planet:graph-editor:v1';

function storage(): Storage {
	if (typeof localStorage === 'undefined') {
		throw new Error('localStorage is not available');
	}
	return localStorage;
}

export function loadGraphFromStorage(key = GRAPH_EDITOR_STORAGE_KEY): GraphDocument | null {
	const raw = storage().getItem(key);
	if (raw === null) return null;
	return parseGraphFile(raw);
}

export function saveGraphToStorage(doc: GraphDocument, key = GRAPH_EDITOR_STORAGE_KEY): void {
	storage().setItem(key, serializeGraph(doc));
}

export function clearGraphStorage(key = GRAPH_EDITOR_STORAGE_KEY): void {
	storage().removeItem(key);
}

export function parseGraphFile(json: string): GraphDocument {
	let parsed: unknown;
	try {
		parsed = JSON.parse(json);
	} catch {
		throw new Error('Invalid graph JSON');
	}
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error('Graph JSON must be an object');
	}
	return deserializeGraph(json);
}

export function formatGraphForDownload(doc: GraphDocument): string {
	return serializeGraph(doc);
}
