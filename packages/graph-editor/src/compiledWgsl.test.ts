import '@world-lab/graph';
/// <reference types="@webgpu/types" />
import { describe, expect, it } from 'vitest';
import type { GraphDocument } from '@world-lab/graph';

import { cosinePaletteEffectGraph, defaultPreviewGraph } from './graphBuilders.js';
import { compiledGraphWgsl } from './compiledWgsl.js';

async function validateWgslCode(code: string): Promise<string | null> {
	if (!code.trim()) return 'empty shader';
	const nav = globalThis.navigator as Navigator & { gpu?: GPU };
	if (!nav?.gpu) return null;
	const adapter = await nav.gpu.requestAdapter();
	if (!adapter) return null;
	const device = await adapter.requestDevice();
	try {
		const module = device.createShaderModule({ code });
		const info = await module.getCompilationInfo();
		const errors = info.messages.filter((message) => message.type === 'error');
		if (errors.length === 0) return null;
		return errors.map((message) => message.message).join('; ');
	} finally {
		device.destroy();
	}
}

function incompleteGraph(): GraphDocument {
	const doc = defaultPreviewGraph();
	return {
		...doc,
		edges: doc.edges.slice(0, 1)
	};
}

describe('@world-lab/graph-editor compiledGraphWgsl', () => {
	it('returns cosine palette fragment shader with real geometry vertex grid and node functions', async () => {
		const results = await compiledGraphWgsl(cosinePaletteEffectGraph());
		expect(results).toHaveLength(1);
		const compiled = results[0]!;
		expect(compiled.diagnostic).toBeUndefined();
		expect(compiled.code).toContain('fn plane_grid_position(');
		expect(compiled.code).toContain('plane_grid_position(vid, 2u, 2u, 2.0, 2.0, 0.0, 0.0, 0.0)');
		expect(compiled.code).toContain('@vertex');
		expect(compiled.code).toContain('fn vs_main');
		expect(compiled.code).toContain('@fragment');
		expect(compiled.code).toContain('fn fs_main');
		expect(compiled.code).toContain('cosine_palette');
		expect(compiled.code).toContain('graph_eval_image');

		const wgslError = await validateWgslCode(compiled.code);
		expect(wgslError).toBeNull();
	});

	it('returns scalar preview shader with perlin and remap for the default field graph', async () => {
		const results = await compiledGraphWgsl(defaultPreviewGraph());
		expect(results).toHaveLength(1);
		const compiled = results[0]!;
		expect(compiled.diagnostic).toBeUndefined();
		expect(compiled.code).toContain('fn perlin');
		expect(compiled.code).toContain('fn remap');
		expect(compiled.code).toContain('@compute @workgroup_size');

		const wgslError = await validateWgslCode(compiled.code);
		expect(wgslError).toBeNull();
	});

	it('returns a diagnostic for an incomplete graph instead of throwing', async () => {
		const results = await compiledGraphWgsl(incompleteGraph());
		expect(results).toHaveLength(1);
		expect(results[0]!.code).toBe('');
		expect(results[0]!.diagnostic).toBeTruthy();
	});

	it('compiles a pipeline graph with empty doc.outputs and doc.consumers', async () => {
		const doc: GraphDocument = {
			...cosinePaletteEffectGraph(),
			outputs: [],
		};
		const results = await compiledGraphWgsl(doc);
		expect(results).toHaveLength(1);
		const compiled = results[0]!;
		expect(compiled.diagnostic).toBeUndefined();
		expect(compiled.code).toContain('fn plane_grid_position(');
		expect(compiled.code).toContain('@vertex');
		expect(compiled.code).toContain('@fragment');
		expect(compiled.code).toContain('cosine_palette');

		const wgslError = await validateWgslCode(compiled.code);
		expect(wgslError).toBeNull();
	});
});
