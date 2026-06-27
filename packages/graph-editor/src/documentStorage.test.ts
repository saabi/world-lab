import { describe, expect, it, beforeEach, vi } from 'vitest';
import { serializeGraph } from '@virtual-planet/graph';
import { defaultPreviewGraph } from './defaultGraph.js';
import {
	clearGraphStorage,
	formatGraphForDownload,
	GRAPH_EDITOR_STORAGE_KEY,
	loadGraphFromStorage,
	parseGraphFile,
	saveGraphToStorage
} from './documentStorage.js';

function createStorageMock() {
	const store = new Map<string, string>();
	return {
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => store.set(key, value),
		removeItem: (key: string) => store.delete(key),
		clear: () => store.clear(),
		get length() {
			return store.size;
		},
		key: (index: number) => [...store.keys()][index] ?? null
	} satisfies Storage;
}

describe('@virtual-planet/graph-editor documentStorage', () => {
	beforeEach(() => {
		vi.stubGlobal('localStorage', createStorageMock());
	});

	it('round-trips default preview graph through parseGraphFile', () => {
		const doc = defaultPreviewGraph();
		const parsed = parseGraphFile(serializeGraph(doc));
		expect(parsed).toEqual(doc);
	});

	it('formatGraphForDownload matches serializeGraph', () => {
		const doc = defaultPreviewGraph();
		expect(formatGraphForDownload(doc)).toBe(serializeGraph(doc));
	});

	it('persists and restores through localStorage', () => {
		const doc = defaultPreviewGraph();
		saveGraphToStorage(doc);
		expect(loadGraphFromStorage()).toEqual(doc);
	});

	it('returns null when storage is empty', () => {
		expect(loadGraphFromStorage()).toBeNull();
	});

	it('clearGraphStorage removes the saved document', () => {
		saveGraphToStorage(defaultPreviewGraph());
		clearGraphStorage();
		expect(loadGraphFromStorage()).toBeNull();
	});

	it('rejects invalid JSON', () => {
		expect(() => parseGraphFile('not json')).toThrow(/invalid graph json/i);
	});

	it('rejects non-object JSON', () => {
		expect(() => parseGraphFile('[]')).toThrow(/must be an object/i);
	});

	it('uses custom storage keys', () => {
		const doc = defaultPreviewGraph();
		saveGraphToStorage(doc, 'custom-key');
		expect(loadGraphFromStorage('custom-key')).toEqual(doc);
		expect(loadGraphFromStorage(GRAPH_EDITOR_STORAGE_KEY)).toBeNull();
	});
});
