import '@world-lab/graph';
import { describe, expect, it } from 'vitest';
import { getPrimitive, type GraphDocument, type Node, type Port, type PortSpec } from '@world-lab/graph';
import { executePlaneScalarPreview } from './planeScalarPreview.js';

const hasWebGPU =
	typeof globalThis.navigator !== 'undefined' &&
	'gpu' in globalThis.navigator &&
	globalThis.navigator.gpu !== undefined;

function instantiatePorts(specs: readonly PortSpec[], direction: 'in' | 'out'): Port[] {
	return specs.map((spec) => ({
		id: spec.name,
		name: spec.name,
		direction,
		dataType: spec.dataType,
		space: spec.space ?? 'none'
	}));
}

function snapshotNode(id: string, primitiveId: string, params?: Record<string, unknown>): Node {
	const primitive = getPrimitive(primitiveId);
	if (!primitive) {
		throw new Error(`Unknown primitive: ${primitiveId}`);
	}
	return {
		id,
		primitive: primitiveId,
		inputs: instantiatePorts(primitive.inputs, 'in'),
		outputs: instantiatePorts(primitive.outputs, 'out'),
		...(params !== undefined ? { params } : {})
	};
}

function previewGraph(): GraphDocument {
	return {
		version: '2',
		nodes: [
			snapshotNode('n_uv', 'procedural.uv'),
			snapshotNode('n_perlin', 'noise.perlin3d'),
			snapshotNode('n_remap', 'math.remap', { inMin: -1, inMax: 1, outMin: 0, outMax: 1 })
		],
		edges: [
			{
				id: 'e_uv_perlin',
				from: { node: 'n_uv', port: 'uv' },
				to: { node: 'n_perlin', port: 'position' }
			},
			{
				id: 'e_perlin_remap',
				from: { node: 'n_perlin', port: 'value' },
				to: { node: 'n_remap', port: 'x' }
			}
		],
		outputs: [{ name: 'field', from: { node: 'n_remap', port: 'value' } }],
	};
}

describe('@world-lab/runtime-webgpu planeScalarPreview', () => {
	it.skipIf(!hasWebGPU)('returns width×height RGBA8 pixels', async () => {
		const adapter = await navigator.gpu.requestAdapter();
		expect(adapter).toBeTruthy();
		const device = await adapter!.requestDevice();
		const graph = previewGraph();

		const result = await executePlaneScalarPreview({
			device,
			graph,
			output: { node: 'n_remap', port: 'value' },
			width: 8,
			height: 8
		});

		expect(result.width).toBe(8);
		expect(result.height).toBe(8);
		expect(result.pixels.byteLength).toBe(8 * 8 * 4);
		expect(result.pixels.some((byte) => byte > 0)).toBe(true);
		device.destroy();
	});
});
