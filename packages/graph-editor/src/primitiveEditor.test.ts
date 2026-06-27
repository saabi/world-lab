import { describe, expect, it, beforeEach } from 'vitest';
import { getPrimitive } from '@virtual-planet/graph';
import { defaultPreviewGraph } from './defaultGraph.js';
import { NOISE_PERLIN3D_SOURCE } from './fixtures/perlin3d.source.js';
import { applyPrimitiveSource } from './primitiveEditor.js';
import { resetPrimitiveSources } from './primitiveSources.js';

describe('@virtual-planet/graph-editor applyPrimitiveSource', () => {
	beforeEach(() => {
		resetPrimitiveSources();
	});

	it('flags edges when an output port is renamed in YAML', () => {
		const renamedSource = NOISE_PERLIN3D_SOURCE.replace(
			'outputs:\n  value:',
			'outputs:\n  noise:'
		);
		const result = applyPrimitiveSource(defaultPreviewGraph(), 'noise.perlin3d', renamedSource);

		expect(result.validationIssues.some((issue) => issue.kind === 'unknown-port')).toBe(true);
		expect(result.validationIssues.some((issue) => issue.port === 'value')).toBe(true);
	});

	it('ripples new params onto graph instances', () => {
		const result = applyPrimitiveSource(
			defaultPreviewGraph(),
			'noise.perlin3d',
			NOISE_PERLIN3D_SOURCE
		);
		const perlinNode = result.graph.nodes.find((node) => node.primitive === 'noise.perlin3d');

		expect(perlinNode?.params?.scale).toBe(0.002);
		expect(getPrimitive('noise.perlin3d')?.params).toEqual(result.loaded.primitive.params);
	});

	it('preserves evalCPU from the previous registration', () => {
		const evalCPU = getPrimitive('noise.perlin3d')?.evalCPU;
		expect(evalCPU).toBeDefined();

		applyPrimitiveSource(defaultPreviewGraph(), 'noise.perlin3d', NOISE_PERLIN3D_SOURCE);
		expect(getPrimitive('noise.perlin3d')?.evalCPU).toBe(evalCPU);
	});

	it('does not mutate unrelated primitives', () => {
		const remapBefore = getPrimitive('math.remap');
		applyPrimitiveSource(defaultPreviewGraph(), 'noise.perlin3d', NOISE_PERLIN3D_SOURCE);
		expect(getPrimitive('math.remap')).toBe(remapBefore);
	});

	it('throws when saving an unregistered primitive id', () => {
		expect(() =>
			applyPrimitiveSource(defaultPreviewGraph(), 'missing.primitive', NOISE_PERLIN3D_SOURCE)
		).toThrow(/not registered/i);
	});

	it('throws when YAML id does not match moduleId', () => {
		const mismatched = NOISE_PERLIN3D_SOURCE.replace('id: noise.perlin3d', 'id: other.noise');
		expect(() =>
			applyPrimitiveSource(defaultPreviewGraph(), 'noise.perlin3d', mismatched)
		).toThrow(/id mismatch/i);
	});
});
