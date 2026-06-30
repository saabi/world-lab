import { describe, expect, it, beforeEach, vi } from 'vitest';

import {
	loadPaletteState,
	NODE_PALETTE_STORAGE_KEY,
	savePaletteState
} from './nodePaletteStorage.js';

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

describe('@virtual-planet/graph-editor nodePaletteStorage', () => {
	beforeEach(() => {
		vi.stubGlobal('localStorage', createStorageMock());
	});

	it('round-trips palette mode and collapsed groups', () => {
		savePaletteState({ mode: 'contract', collapsedGroups: ['math', 'noise/perlin'] });
		expect(loadPaletteState()).toEqual({
			mode: 'contract',
			collapsedGroups: ['math', 'noise/perlin']
		});
	});

	it('defaults to section mode when storage is empty', () => {
		expect(loadPaletteState()).toEqual({ mode: 'section', collapsedGroups: [] });
	});

	it('ignores corrupt storage payloads', () => {
		localStorage.setItem(NODE_PALETTE_STORAGE_KEY, '{bad');
		expect(loadPaletteState()).toEqual({ mode: 'section', collapsedGroups: [] });
	});
});
