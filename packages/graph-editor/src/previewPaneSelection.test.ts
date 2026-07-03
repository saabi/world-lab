import { describe, expect, it } from 'vitest';

import type { PreviewBuffer } from './previewBuffers.js';
import {
	LEGACY_PREVIEW_PANE_KEY,
	ensurePaneSelection,
	migrateLegacyPreviewChrome,
	prunePaneSelection,
	previewSelectionFromBuffer,
	resolvePaneBufferId,
	syncSelectionsForGraphChange
} from './previewPaneSelection.js';

const buffers: PreviewBuffer[] = [
	{
		id: 'a',
		label: 'A',
		source: { node: 'n_a', port: 'value' },
		dataType: 'f32',
		family: 'data',
		inferred: true
	},
	{
		id: 'b',
		label: 'B',
		source: { node: 'n_b', port: 'value' },
		dataType: 'f32',
		family: 'data',
		inferred: true
	},
	{
		id: 'c',
		label: 'C',
		source: { sinkNode: 'n_display' },
		dataType: 'texture',
		family: 'image',
		inferred: true
	}
];

describe('previewPaneSelection', () => {
	it('resolvePaneBufferId prefers a valid selection', () => {
		expect(resolvePaneBufferId({ bufferId: 'b' }, buffers, 'a')).toBe('b');
	});

	it('resolvePaneBufferId falls back to default then first buffer', () => {
		expect(resolvePaneBufferId(undefined, buffers, 'a')).toBe('a');
		expect(resolvePaneBufferId({ bufferId: 'missing' }, buffers, null)).toBe('a');
	});

	it('resolvePaneBufferId remaps by sourceKey when buffer id changes', () => {
		const remapped: PreviewBuffer[] = [
			...buffers.slice(0, 2),
			{ ...buffers[2]!, id: 'pipeline_image_n_display' }
		];
		expect(
			resolvePaneBufferId(
				{ bufferId: 'c', sourceKey: 'sink:n_display' },
				remapped,
				'a'
			)
		).toBe('pipeline_image_n_display');
	});

	it('previewSelectionFromBuffer stores a stable source key', () => {
		expect(previewSelectionFromBuffer(buffers[2]!)).toEqual({
			bufferId: 'c',
			sourceKey: 'sink:n_display'
		});
	});

	it('migrateLegacyPreviewChrome maps legacy chrome into the legacy pane key', () => {
		expect(
			migrateLegacyPreviewChrome({
				selectedPreviewBufferId: 'field',
				previewFamilyOverride: 'image',
				previewMode: 'gpu'
			})
		).toEqual({
			[LEGACY_PREVIEW_PANE_KEY]: {
				bufferId: 'field',
				familyOverride: 'image',
				rendererOverride: 'gpu'
			}
		});
	});

	it('ensurePaneSelection assigns legacy selection to a new pane id', () => {
		const next = ensurePaneSelection(
			migrateLegacyPreviewChrome({ selectedPreviewBufferId: 'b', previewFamilyOverride: 'data' }),
			'pane-1',
			buffers,
			'a'
		);
		expect(next[LEGACY_PREVIEW_PANE_KEY]).toBeUndefined();
		expect(next['pane-1']).toEqual({
			bufferId: 'b',
			sourceKey: 'n_b:value',
			familyOverride: 'data'
		});
	});

	it('syncSelectionsForGraphChange resets invalid buffers per pane independently', () => {
		const synced = syncSelectionsForGraphChange(
			{
				left: { bufferId: 'b', familyOverride: 'image' },
				right: { bufferId: 'missing', familyOverride: 'geometry' }
			},
			buffers.filter((buffer) => buffer.id !== 'a'),
			'b'
		);
		expect(synced.left).toEqual({
			bufferId: 'b',
			sourceKey: 'n_b:value',
			familyOverride: 'image'
		});
		expect(synced.right).toEqual({
			bufferId: 'b',
			sourceKey: 'n_b:value',
			familyOverride: 'geometry'
		});
	});

	it('syncSelectionsForGraphChange preserves selection by sourceKey across id churn', () => {
		const remapped: PreviewBuffer[] = [
			buffers[0]!,
			buffers[1]!,
			{ ...buffers[2]!, id: 'pipeline_image_n_display' }
		];
		const synced = syncSelectionsForGraphChange(
			{ pane: { bufferId: 'c', sourceKey: 'sink:n_display', familyOverride: 'image' } },
			remapped,
			'a'
		);
		expect(synced.pane).toEqual({
			bufferId: 'pipeline_image_n_display',
			sourceKey: 'sink:n_display',
			familyOverride: 'image'
		});
	});

	it('syncSelectionsForGraphChange returns the same object when nothing changed', () => {
		const byPane = { pane: { bufferId: 'b', sourceKey: 'n_b:value' } };
		expect(syncSelectionsForGraphChange(byPane, buffers, 'a')).toBe(byPane);
	});

	it('prunePaneSelection removes a closed pane entry', () => {
		const pruned = prunePaneSelection(
			{ left: { bufferId: 'a' }, right: { bufferId: 'b' } },
			'left'
		);
		expect(pruned).toEqual({ right: { bufferId: 'b' } });
	});
});
