import '@world-lab/graph';
import { describe, expect, it } from 'vitest';
import { effectiveConsumers, effectiveGraphDocument } from '@world-lab/graph';
import {
	assembleFullscreenFragmentModuleAsync,
	createStandardLibraryResolver
} from '@world-lab/runtime-webgpu';

import { cosinePaletteEffectGraph } from './graphBuilders.js';
import {
	enumeratePreviewBuffers,
	inferDefaultPreviewBuffer,
	resolvePreviewBufferPort
} from './previewBuffers.js';

describe('preview effective document normalization', () => {
	it('declares synthetic pipeline outputs and assembles fullscreen fragment without throwing', async () => {
		const raw = {
			...cosinePaletteEffectGraph(),
			outputs: [],
		};
		const effective = effectiveGraphDocument(raw);

		expect(
			effective.outputs.some(
				(output) => output.from.node === 'n_effect' && output.from.port === 'color'
			)
		).toBe(true);
		expect(effectiveConsumers(effective).length).toBeGreaterThan(0);

		const buffer = inferDefaultPreviewBuffer(effective);
		expect(buffer?.family).toBe('image');
		const output = buffer ? resolvePreviewBufferPort(effective, buffer) : null;
		expect(output).toEqual({ node: 'n_effect', port: 'color' });

		const resolver = createStandardLibraryResolver();
		await expect(
			assembleFullscreenFragmentModuleAsync(raw, output!, resolver)
		).rejects.toThrow(/not declared in graph\.outputs/);

		const assembly = await assembleFullscreenFragmentModuleAsync(effective, output!, resolver);
		expect(assembly.code).toContain('@fragment');
		expect(assembly.code).toContain('cosine_palette');
	});

	it('keeps buffer enumeration aligned with the effective doc outputs', () => {
		const raw = {
			...cosinePaletteEffectGraph(),
			outputs: [],
		};
		const effective = effectiveGraphDocument(raw);
		const buffers = enumeratePreviewBuffers(effective);
		expect(buffers.some((buffer) => buffer.family === 'image')).toBe(true);
		expect(resolvePreviewBufferPort(effective, buffers[0]!)).toEqual({
			node: 'n_effect',
			port: 'color'
		});
	});
});
