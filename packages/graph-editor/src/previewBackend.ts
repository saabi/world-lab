import type { GraphDocument } from '@world-lab/graph';

import {
	effectivePreviewFamily,
	enumeratePreviewBuffers,
	inferDefaultPreviewBuffer,
	type PreviewFamily
} from './previewBuffers.js';

/** Preview renderers mapped from buffer families (reuse existing panels). */
export type ScalarPreviewBackend = 'cpu' | 'gpu';
export type PreviewBackend =
	| ScalarPreviewBackend
	| 'effect'
	| 'mesh'
	| 'vegetation'
	| 'audio'
	| 'buffer';

export type PreviewRenderer = PreviewBackend;

/** Route a preview family to an existing preview panel. */
export function rendererForPreviewFamily(
	family: PreviewFamily,
	opts: { preferGpu?: boolean } = {}
): PreviewRenderer {
	switch (family) {
		case 'image':
			return opts.preferGpu ? 'gpu' : 'effect';
		case 'geometry':
			return 'mesh';
		case 'data':
			return opts.preferGpu ? 'gpu' : 'cpu';
		case 'audio':
			return 'audio';
		case 'buffer':
			return 'buffer';
		default: {
			const _exhaustive: never = family;
			return _exhaustive;
		}
	}
}

/** Resolve the renderer for a selected buffer and optional family override. */
export function resolvePreviewRenderer(
	buffer: { family: PreviewFamily; inferred: boolean } | null,
	opts: {
		familyOverride?: PreviewFamily | null;
		rendererOverride?: PreviewRenderer | null;
		preferGpu?: boolean;
	} = {}
): PreviewRenderer {
	if (opts.rendererOverride) return opts.rendererOverride;
	if (!buffer) return 'cpu';
	const family = effectivePreviewFamily(buffer, opts.familyOverride);
	return rendererForPreviewFamily(family, { preferGpu: opts.preferGpu });
}

/** Pick the default preview backend from the canvas graph's output buffers. */
export function inferPreviewBackend(doc: GraphDocument): ScalarPreviewBackend | 'effect' {
	const buffer = inferDefaultPreviewBuffer(doc);
	if (!buffer) return 'cpu';
	const renderer = rendererForPreviewFamily(buffer.family);
	if (renderer === 'effect') return 'effect';
	if (renderer === 'gpu') return 'gpu';
	return 'cpu';
}

/** Whether a legacy preview mode still matches any enumerated buffer. */
export function isPreviewModeCompatible(doc: GraphDocument, mode: PreviewBackend): boolean {
	if (mode === 'mesh' || mode === 'vegetation') return true;
	if (mode === 'audio') {
		return enumeratePreviewBuffers(doc).some((buffer) => buffer.family === 'audio');
	}
	const inferred = inferPreviewBackend(doc);
	if (mode === 'effect') return inferred === 'effect';
	if (mode === 'cpu' || mode === 'gpu') return inferred !== 'effect';
	return true;
}
