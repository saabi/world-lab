import '@world-lab/graph';
import { render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import EffectPreviewPanel from './EffectPreviewPanel.svelte';
import { bufferFeedbackGraph } from './graphBuilders.js';
import type { PreviewFrameLoop } from './previewFrameLoop.js';

describe('EffectPreviewPanel', () => {
	it('mounts a canvas for sink-backed frame targets without a port output', () => {
		const frameLoop: PreviewFrameLoop = {
			subscribe: vi.fn(() => () => {}),
			setPointer: vi.fn(),
			getSnapshot: vi.fn(() => null),
			destroy: vi.fn()
		};
		const { container } = render(EffectPreviewPanel, {
			props: {
				graph: bufferFeedbackGraph(),
				output: null,
				targetId: 'n_buffer_feedback',
				frameLoop
			}
		});

		expect(container.querySelector('canvas')).not.toBeNull();
		expect(container.textContent).not.toContain(
			'Wire a vec4 image output with a fragment consumer.'
		);
	});
});
