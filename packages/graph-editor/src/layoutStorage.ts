import { parseLayoutDocument, type LayoutDocument } from '@world-lab/subdivide';

import type { PreviewFamily } from './previewBuffers.js';
import type { PreviewRenderer } from './previewBackend.js';
import type { NodeColorMode } from './nodeAccentColor.js';
import type { PreviewBuffersByPane, PreviewPaneSelection } from './previewPaneSelection.js';
import { LEGACY_PREVIEW_PANE_KEY, migrateLegacyPreviewChrome } from './previewPaneSelection.js';

export const GRAPH_EDITOR_LAYOUT_KEY = 'virtual-planet:graph-editor-layout:v2';

export interface StoredEditorChrome {
	version: 1;
	layout: LayoutDocument;
	/** @deprecated Legacy backend tab — migrated to `previewBuffersByPane`. */
	previewMode?: 'cpu' | 'gpu' | 'mesh' | 'vegetation' | 'effect';
	/** @deprecated Migrated to `previewBuffersByPane`. */
	selectedPreviewBufferId?: string;
	/** @deprecated Migrated to `previewBuffersByPane`. */
	previewFamilyOverride?: PreviewFamily | null;
	previewBuffersByPane?: PreviewBuffersByPane;
	nodeColorMode?: NodeColorMode;
	/** When true (default), loading a document applies its saved pane layout. */
	loadDocumentLayout?: boolean;
}

function storage(): Storage {
	if (typeof localStorage === 'undefined') {
		throw new Error('localStorage is not available');
	}
	return localStorage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const PREVIEW_FAMILIES: readonly PreviewFamily[] = ['geometry', 'image', 'data', 'audio'];
const PREVIEW_RENDERERS: readonly PreviewRenderer[] = [
	'cpu',
	'gpu',
	'mesh',
	'effect',
	'vegetation',
	'audio'
];

function parsePreviewFamily(value: unknown): PreviewFamily | null {
	if (typeof value !== 'string') return null;
	return PREVIEW_FAMILIES.includes(value as PreviewFamily) ? (value as PreviewFamily) : null;
}

function parsePreviewRenderer(value: unknown): PreviewRenderer | null {
	if (typeof value !== 'string') return null;
	return PREVIEW_RENDERERS.includes(value as PreviewRenderer) ? (value as PreviewRenderer) : null;
}

function parsePreviewPaneSelection(value: unknown): PreviewPaneSelection | null {
	if (!isRecord(value) || typeof value.bufferId !== 'string') return null;
	const selection: PreviewPaneSelection = { bufferId: value.bufferId };
	if (value.familyOverride === null) {
		selection.familyOverride = null;
	} else {
		const family = parsePreviewFamily(value.familyOverride);
		if (family) selection.familyOverride = family;
	}
	if (value.rendererOverride === null) {
		selection.rendererOverride = null;
	} else {
		const renderer = parsePreviewRenderer(value.rendererOverride);
		if (renderer) selection.rendererOverride = renderer;
	}
	if (typeof value.sourceKey === 'string' && value.sourceKey.length > 0) {
		selection.sourceKey = value.sourceKey;
	}
	return selection;
}

export function parsePreviewBuffersByPane(value: unknown): PreviewBuffersByPane | undefined {
	if (!isRecord(value)) return undefined;
	const next: PreviewBuffersByPane = {};
	for (const [paneId, rawSelection] of Object.entries(value)) {
		const selection = parsePreviewPaneSelection(rawSelection);
		if (selection) next[paneId] = selection;
	}
	return Object.keys(next).length > 0 ? next : undefined;
}

export function loadEditorChrome(
	key = GRAPH_EDITOR_LAYOUT_KEY,
	defaultZone = 'canvas'
): StoredEditorChrome | null {
	const raw = storage().getItem(key);
	if (raw === null) return null;

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}

	if (!isRecord(parsed) || parsed.version !== 1 || parsed.layout === undefined) {
		return null;
	}

	try {
		const layout = parseLayoutDocument(parsed.layout, defaultZone);
		const chrome: StoredEditorChrome = { version: 1, layout };
		if (
			parsed.previewMode === 'cpu' ||
			parsed.previewMode === 'gpu' ||
			parsed.previewMode === 'mesh' ||
			parsed.previewMode === 'vegetation' ||
			parsed.previewMode === 'effect'
		) {
			chrome.previewMode = parsed.previewMode;
		}
		const previewBuffersByPane = parsePreviewBuffersByPane(parsed.previewBuffersByPane);
		if (previewBuffersByPane) {
			chrome.previewBuffersByPane = previewBuffersByPane;
		} else if (typeof parsed.selectedPreviewBufferId === 'string') {
			chrome.previewBuffersByPane = migrateLegacyPreviewChrome({
				selectedPreviewBufferId: parsed.selectedPreviewBufferId,
				previewFamilyOverride:
					parsed.previewFamilyOverride === null
						? null
						: parsePreviewFamily(parsed.previewFamilyOverride) ?? undefined,
				previewMode: chrome.previewMode
			});
			chrome.selectedPreviewBufferId = parsed.selectedPreviewBufferId;
		} else if (chrome.previewMode) {
			chrome.previewBuffersByPane = migrateLegacyPreviewChrome({ previewMode: chrome.previewMode });
		}
		if (parsed.previewFamilyOverride === null) {
			chrome.previewFamilyOverride = null;
		} else {
			const family = parsePreviewFamily(parsed.previewFamilyOverride);
			if (family) chrome.previewFamilyOverride = family;
		}
		if (
			parsed.nodeColorMode === 'category' ||
			parsed.nodeColorMode === 'contract' ||
			parsed.nodeColorMode === 'off'
		) {
			chrome.nodeColorMode = parsed.nodeColorMode;
		}
		if (parsed.loadDocumentLayout === false) {
			chrome.loadDocumentLayout = false;
		} else if (parsed.loadDocumentLayout === true) {
			chrome.loadDocumentLayout = true;
		}
		return chrome;
	} catch {
		return null;
	}
}

export function saveEditorChrome(chrome: StoredEditorChrome, key = GRAPH_EDITOR_LAYOUT_KEY): void {
	const payload: StoredEditorChrome = {
		version: 1,
		layout: chrome.layout,
		nodeColorMode: chrome.nodeColorMode,
		loadDocumentLayout: chrome.loadDocumentLayout
	};
	if (chrome.previewBuffersByPane && Object.keys(chrome.previewBuffersByPane).length > 0) {
		const { [LEGACY_PREVIEW_PANE_KEY]: legacy, ...rest } = chrome.previewBuffersByPane;
		if (Object.keys(rest).length > 0) {
			payload.previewBuffersByPane = rest;
		} else if (legacy) {
			payload.previewBuffersByPane = { [LEGACY_PREVIEW_PANE_KEY]: legacy };
		}
	}
	storage().setItem(key, JSON.stringify(payload));
}

export function clearEditorChrome(key = GRAPH_EDITOR_LAYOUT_KEY): void {
	storage().removeItem(key);
}
