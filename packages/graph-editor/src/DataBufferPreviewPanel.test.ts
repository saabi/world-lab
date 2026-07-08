import '@world-lab/graph';
import { render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import DataBufferPreviewPanel from './DataBufferPreviewPanel.svelte';
import { computeBufferDoublingGraph } from './graphBuilders.js';
import type { PreviewFrameLoop, PreviewFrameSnapshot } from './previewFrameLoop.js';

describe('DataBufferPreviewPanel', () => {
	it('renders buffer summaries from frame-loop snapshots', async () => {
		const snapshot: PreviewFrameSnapshot = {
			iTime: 0,
			iFrame: 1,
			width: 4,
			height: 4,
			targets: {},
			computeBuffers: {
				n_compute_buffer: new Float32Array([2, 4, 6, 8, 10, 12, 14, 16, 18])
			},
			error: null
		};
		const frameLoop: PreviewFrameLoop = {
			subscribe: vi.fn((listener) => {
				listener(snapshot);
				return () => {};
			}),
			setPointer: vi.fn(),
			getSnapshot: vi.fn(() => snapshot),
			destroy: vi.fn()
		};

		render(DataBufferPreviewPanel, {
			props: {
				graph: computeBufferDoublingGraph(),
				output: null,
				targetId: 'n_compute_buffer',
				frameLoop
			}
		});

		expect(await screen.findByText('9 values')).toBeTruthy();
		expect(screen.getByText('last 18')).toBeTruthy();
		expect(screen.getByText('16')).toBeTruthy();
	});
});
