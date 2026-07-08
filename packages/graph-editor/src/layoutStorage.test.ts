import { describe, expect, it, beforeEach, vi } from 'vitest';
import { defaultGraphEditorLayout } from './defaultLayout.js';
import {
	clearEditorChrome,
	GRAPH_EDITOR_LAYOUT_KEY,
	loadEditorChrome,
	saveEditorChrome
} from './layoutStorage.js';

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

describe('@world-lab/graph-editor layoutStorage', () => {
	beforeEach(() => {
		vi.stubGlobal('localStorage', createStorageMock());
	});

	it('round-trips layout and per-pane preview selection through localStorage', () => {
		const layout = defaultGraphEditorLayout();
		const paletteCol = layout.root.children[0];
		if (paletteCol?.type === 'group') {
			paletteCol.size = 0.22;
		}
		saveEditorChrome({
			version: 1,
			layout,
			previewBuffersByPane: {
				'pane-left': { bufferId: 'field', familyOverride: 'image' },
				'pane-right': { bufferId: 'mesh', rendererOverride: 'mesh' }
			}
		});
		const loaded = loadEditorChrome();
		expect(loaded).not.toBeNull();
		expect(loaded!.previewBuffersByPane).toEqual({
			'pane-left': { bufferId: 'field', familyOverride: 'image' },
			'pane-right': { bufferId: 'mesh', rendererOverride: 'mesh' }
		});
		const loadedPaletteCol = loaded!.layout.root.children[0];
		expect(loadedPaletteCol?.type === 'group' && loadedPaletteCol.size).toBe(0.22);
	});

	it('round-trips buffer preview family and renderer selections', () => {
		saveEditorChrome({
			version: 1,
			layout: defaultGraphEditorLayout(),
			previewBuffersByPane: {
				'pane-buffer': {
					bufferId: 'n_compute_buffer',
					familyOverride: 'buffer',
					rendererOverride: 'buffer'
				}
			}
		});

		expect(loadEditorChrome()?.previewBuffersByPane).toEqual({
			'pane-buffer': {
				bufferId: 'n_compute_buffer',
				familyOverride: 'buffer',
				rendererOverride: 'buffer'
			}
		});
	});

	it('migrates legacy selectedPreviewBufferId into previewBuffersByPane', () => {
		localStorage.setItem(
			GRAPH_EDITOR_LAYOUT_KEY,
			JSON.stringify({
				version: 1,
				layout: defaultGraphEditorLayout(),
				selectedPreviewBufferId: 'field',
				previewFamilyOverride: 'image',
				previewMode: 'gpu'
			})
		);
		const loaded = loadEditorChrome();
		expect(loaded?.previewBuffersByPane).toEqual({
			__legacy__: {
				bufferId: 'field',
				familyOverride: 'image',
				rendererOverride: 'gpu'
			}
		});
	});

	it('round-trips nodeColorMode chrome', () => {
		saveEditorChrome({
			version: 1,
			layout: defaultGraphEditorLayout(),
			nodeColorMode: 'contract'
		});
		expect(loadEditorChrome()?.nodeColorMode).toBe('contract');
	});

	it('round-trips loadDocumentLayout chrome', () => {
		saveEditorChrome({
			version: 1,
			layout: defaultGraphEditorLayout(),
			loadDocumentLayout: false
		});
		expect(loadEditorChrome()?.loadDocumentLayout).toBe(false);
	});

	it('still loads legacy previewMode chrome from raw storage', () => {
		localStorage.setItem(
			GRAPH_EDITOR_LAYOUT_KEY,
			JSON.stringify({ version: 1, layout: defaultGraphEditorLayout(), previewMode: 'gpu' })
		);
		expect(loadEditorChrome()?.previewMode).toBe('gpu');
	});

	it('returns null when storage is empty', () => {
		expect(loadEditorChrome()).toBeNull();
	});

	it('returns null for corrupt JSON without throwing', () => {
		localStorage.setItem(GRAPH_EDITOR_LAYOUT_KEY, '{not json');
		expect(loadEditorChrome()).toBeNull();
	});

	it('loads a layout that references an unknown zone', () => {
		const layout = defaultGraphEditorLayout();
		const paletteCol = layout.root.children[0];
		const palettePane =
			paletteCol?.type === 'group' ? paletteCol.children[0] : undefined;
		if (palettePane?.type === 'pane') {
			palettePane.zone = 'unknown_zone';
		}
		saveEditorChrome({ version: 1, layout });
		expect(loadEditorChrome()).not.toBeNull();
	});

	it('clearEditorChrome removes the saved chrome', () => {
		saveEditorChrome({ version: 1, layout: defaultGraphEditorLayout(), previewMode: 'cpu' });
		clearEditorChrome();
		expect(loadEditorChrome()).toBeNull();
	});
});
