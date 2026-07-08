import { describe, expect, it } from 'vitest';

import { defaultPreviewGraph } from './graphBuilders.js';
import { inferPreviewBackend, rendererForPreviewFamily, resolvePreviewRenderer } from './previewBackend.js';
import { enumeratePreviewBuffers } from './previewBuffers.js';

describe('previewBackend routing', () => {
	it('maps preview families to existing renderers', () => {
		expect(rendererForPreviewFamily('image')).toBe('effect');
		expect(rendererForPreviewFamily('geometry')).toBe('mesh');
		expect(rendererForPreviewFamily('data')).toBe('cpu');
		expect(rendererForPreviewFamily('audio')).toBe('audio');
		expect(rendererForPreviewFamily('buffer')).toBe('buffer');
		expect(rendererForPreviewFamily('data', { preferGpu: true })).toBe('gpu');
	});

	it('applies a family override for ambiguous vec4 buffers', () => {
		const buffer = {
			family: 'data' as const,
			inferred: false
		};
		expect(resolvePreviewRenderer(buffer, { familyOverride: 'image' })).toBe('effect');
		expect(resolvePreviewRenderer(buffer, { familyOverride: null })).toBe('cpu');
	});

	it('preserves an explicit buffer renderer override', () => {
		const buffer = {
			family: 'data' as const,
			inferred: false
		};
		expect(resolvePreviewRenderer(buffer, { rendererOverride: 'buffer' })).toBe('buffer');
	});

	it('defaults to effect for pipeline image buffers', () => {
		const buffers = enumeratePreviewBuffers(defaultPreviewGraph());
		expect(inferPreviewBackend(defaultPreviewGraph())).toBe('cpu');
		expect(buffers[0]?.family).toBe('data');
	});
});
