import type { LayoutDocument, LayoutNode } from '@world-lab/subdivide';

import {
	previewBufferSourceKey,
	type PreviewBuffer,
	type PreviewFamily
} from './previewBuffers.js';
import type { PreviewRenderer } from './previewBackend.js';

export interface PreviewPaneSelection {
	bufferId: string;
	/** Stable across buffer id re-derivation (`node:port` or `sink:<displayNodeId>`). */
	sourceKey?: string;
	familyOverride?: PreviewFamily | null;
	rendererOverride?: PreviewRenderer | null;
}

export type PreviewBuffersByPane = Record<string, PreviewPaneSelection>;

/** Chrome migration bucket for legacy single-pane preview selection. */
export const LEGACY_PREVIEW_PANE_KEY = '__legacy__';

export function previewSelectionFromBuffer(buffer: PreviewBuffer): PreviewPaneSelection {
	return {
		bufferId: buffer.id,
		sourceKey: previewBufferSourceKey(buffer.source)
	};
}

export function findBufferBySourceKey(
	buffers: readonly PreviewBuffer[],
	sourceKey: string
): PreviewBuffer | undefined {
	return buffers.find((buffer) => previewBufferSourceKey(buffer.source) === sourceKey);
}

export function resolvePaneBufferId(
	selection: PreviewPaneSelection | undefined,
	buffers: readonly PreviewBuffer[],
	defaultBufferId: string | null
): string | null {
	const bufferIds = new Set(buffers.map((buffer) => buffer.id));
	if (bufferIds.size === 0) return null;

	if (selection?.bufferId && bufferIds.has(selection.bufferId)) {
		return selection.bufferId;
	}

	if (selection?.sourceKey) {
		const match = findBufferBySourceKey(buffers, selection.sourceKey);
		if (match) return match.id;
	}

	if (defaultBufferId && bufferIds.has(defaultBufferId)) return defaultBufferId;
	return buffers[0]?.id ?? null;
}

/** @deprecated Use the buffers overload — kept for call sites migrating incrementally. */
export function resolvePaneBufferIdSet(
	selection: PreviewPaneSelection | undefined,
	bufferIds: ReadonlySet<string>,
	defaultBufferId: string | null
): string | null {
	if (bufferIds.size === 0) return null;
	if (selection?.bufferId && bufferIds.has(selection.bufferId)) {
		return selection.bufferId;
	}
	if (defaultBufferId && bufferIds.has(defaultBufferId)) return defaultBufferId;
	return bufferIds.values().next().value ?? null;
}

function normalizePaneSelection(
	selection: PreviewPaneSelection,
	buffers: readonly PreviewBuffer[],
	defaultBufferId: string | null
): PreviewPaneSelection | null {
	const bufferId = resolvePaneBufferId(selection, buffers, defaultBufferId);
	if (!bufferId) return null;

	const buffer = buffers.find((candidate) => candidate.id === bufferId);
	const sourceKey =
		selection.sourceKey ??
		(buffer ? previewBufferSourceKey(buffer.source) : undefined);

	if (
		selection.bufferId === bufferId &&
		(!sourceKey || selection.sourceKey === sourceKey)
	) {
		return sourceKey && !selection.sourceKey ? { ...selection, sourceKey } : selection;
	}

	return {
		bufferId,
		...(sourceKey !== undefined ? { sourceKey } : {}),
		...(selection.familyOverride !== undefined
			? { familyOverride: selection.familyOverride }
			: {}),
		...(selection.rendererOverride !== undefined
			? { rendererOverride: selection.rendererOverride }
			: {})
	};
}

function previewSelectionsEqual(
	a: PreviewPaneSelection,
	b: PreviewPaneSelection
): boolean {
	return (
		a.bufferId === b.bufferId &&
		a.sourceKey === b.sourceKey &&
		a.familyOverride === b.familyOverride &&
		a.rendererOverride === b.rendererOverride
	);
}

export function migrateLegacyPreviewChrome(input: {
	selectedPreviewBufferId?: string;
	previewFamilyOverride?: PreviewFamily | null;
	previewMode?: 'cpu' | 'gpu' | 'mesh' | 'vegetation' | 'effect';
}): PreviewBuffersByPane {
	if (!input.selectedPreviewBufferId) return {};
	const selection: PreviewPaneSelection = { bufferId: input.selectedPreviewBufferId };
	if (input.previewFamilyOverride !== undefined) {
		selection.familyOverride = input.previewFamilyOverride;
	}
	if (input.previewMode === 'vegetation') {
		selection.rendererOverride = 'vegetation';
	} else if (input.previewMode === 'mesh') {
		selection.rendererOverride = 'mesh';
	} else if (input.previewMode === 'gpu') {
		selection.rendererOverride = 'gpu';
	} else if (input.previewMode === 'cpu') {
		selection.rendererOverride = 'cpu';
	} else if (input.previewMode === 'effect') {
		selection.rendererOverride = 'effect';
	}
	return { [LEGACY_PREVIEW_PANE_KEY]: selection };
}

export function ensurePaneSelection(
	byPane: PreviewBuffersByPane,
	paneId: string,
	buffers: readonly PreviewBuffer[],
	defaultBufferId: string | null
): PreviewBuffersByPane {
	if (buffers.length === 0) return byPane;

	const bufferIds = new Set(buffers.map((buffer) => buffer.id));
	const existing = byPane[paneId];
	if (existing?.bufferId && bufferIds.has(existing.bufferId)) {
		return byPane;
	}

	const legacy = byPane[LEGACY_PREVIEW_PANE_KEY];
	const next = { ...byPane };
	delete next[LEGACY_PREVIEW_PANE_KEY];

	const normalized = normalizePaneSelection(legacy ?? existing ?? { bufferId: '' }, buffers, defaultBufferId);
	if (!normalized) return next;

	next[paneId] = normalized;
	return next;
}

export function syncSelectionsForGraphChange(
	byPane: PreviewBuffersByPane,
	buffers: readonly PreviewBuffer[],
	defaultBufferId: string | null
): PreviewBuffersByPane {
	if (buffers.length === 0) return {};

	const bufferIds = new Set(buffers.map((buffer) => buffer.id));
	const next: PreviewBuffersByPane = {};
	let changed = false;

	for (const [paneId, selection] of Object.entries(byPane)) {
		if (paneId === LEGACY_PREVIEW_PANE_KEY) {
			if (selection.bufferId && bufferIds.has(selection.bufferId)) {
				next[paneId] = selection;
			} else if (selection.sourceKey && findBufferBySourceKey(buffers, selection.sourceKey)) {
				const normalized = normalizePaneSelection(selection, buffers, defaultBufferId);
				if (normalized) next[paneId] = normalized;
			}
			continue;
		}

		const normalized = normalizePaneSelection(selection, buffers, defaultBufferId);
		if (!normalized) continue;

		next[paneId] = normalized;
		if (!(paneId in byPane) || !previewSelectionsEqual(byPane[paneId]!, normalized)) {
			changed = true;
		}
	}

	if (!changed && Object.keys(next).length === Object.keys(byPane).length) {
		let same = true;
		for (const [paneId, selection] of Object.entries(byPane)) {
			if (paneId === LEGACY_PREVIEW_PANE_KEY) continue;
			if (!next[paneId] || !previewSelectionsEqual(selection, next[paneId]!)) {
				same = false;
				break;
			}
		}
		if (same) return byPane;
	}

	return next;
}

export function previewBufferIdSignature(buffers: readonly PreviewBuffer[]): string {
	return buffers
		.map((buffer) => `${buffer.id}\0${previewBufferSourceKey(buffer.source)}`)
		.sort()
		.join('\n');
}

export function collectPaneIdsByZone(layout: LayoutDocument, zone: string): string[] {
	const ids: string[] = [];
	function walk(node: LayoutNode): void {
		if (node.type === 'pane') {
			if (node.zone === zone) ids.push(node.id);
			return;
		}
		for (const child of node.children) walk(child);
	}
	walk(layout.root);
	return ids;
}

export function syncPreviewPanesWithLayout(
	byPane: PreviewBuffersByPane,
	layout: LayoutDocument,
	buffers: readonly PreviewBuffer[],
	defaultBufferId: string | null,
	zone = 'preview'
): PreviewBuffersByPane {
	const activePaneIds = new Set(collectPaneIdsByZone(layout, zone));
	let next = byPane;
	for (const paneId of activePaneIds) {
		next = ensurePaneSelection(next, paneId, buffers, defaultBufferId);
	}
	const pruned: PreviewBuffersByPane = {};
	for (const [paneId, selection] of Object.entries(next)) {
		if (paneId === LEGACY_PREVIEW_PANE_KEY || activePaneIds.has(paneId)) {
			pruned[paneId] = selection;
		}
	}
	return pruned;
}

export function prunePaneSelection(
	byPane: PreviewBuffersByPane,
	paneId: string
): PreviewBuffersByPane {
	if (!(paneId in byPane)) return byPane;
	const next = { ...byPane };
	delete next[paneId];
	return next;
}
