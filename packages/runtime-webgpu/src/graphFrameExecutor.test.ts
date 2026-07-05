import '@world-lab/graph';
import {
	effectiveGraphDocument,
	getPrimitive,
	type GraphDocument
} from '@world-lab/graph';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GraphFrameExecutor } from './graphFrameExecutor.js';
import * as graphFramePlan from './graphFramePlan.js';
import * as order from './frameGraph/order.js';
import { ResourceRealizer } from './frameGraph/realize.js';
import { PipelineGraphExecutor } from './pipelineGraph.js';
import { BufferFeedbackExecutor } from './consumers/bufferFeedback.js';
import { cosinePalettePipelineGraph } from '../test/sampleGraphs.js';

const hasWebGPU =
	typeof globalThis.navigator !== 'undefined' &&
	'gpu' in globalThis.navigator &&
	globalThis.navigator.gpu !== undefined;

function mockDevice() {
	const textures: GPUTexture[] = [];
	const createTexture = vi.fn((_descriptor: GPUTextureDescriptor) => {
		const texture = {
			createView: vi.fn(),
			destroy: vi.fn()
		} as unknown as GPUTexture;
		textures.push(texture);
		return texture;
	});
	return {
		device: { createTexture } as unknown as GPUDevice,
		createTexture,
		textures
	};
}

function dualTargetPipelineGraph(): GraphDocument {
	const graph = cosinePalettePipelineGraph();
	const effect = graph.nodes.find((node) => node.id === 'n_effect')!;
	const fragment = graph.nodes.find((node) => node.id === 'n_fragment')!;
	const display = graph.nodes.find((node) => node.id === 'n_display')!;
	const effectInputs = graph.edges.filter((edge) => edge.to.node === 'n_effect');
	const vertexFragment = graph.edges.find((edge) => edge.id === 'e_vertex_fragment')!;
	const effectFragment = graph.edges.find((edge) => edge.id === 'e_effect_fragment')!;
	const fragmentDisplay = graph.edges.find((edge) => edge.id === 'e_fragment_display')!;
	return {
		...graph,
		nodes: [
			...graph.nodes,
			{ ...effect, id: 'n_effect_b' },
			{ ...fragment, id: 'n_fragment_b' },
			{ ...display, id: 'n_display_b' }
		],
		edges: [
			...graph.edges,
			...effectInputs.map((edge) => ({
				...edge,
				id: `${edge.id}_b`,
				to: { ...edge.to, node: 'n_effect_b' }
			})),
			{
				...vertexFragment,
				id: 'e_vertex_fragment_b',
				to: { ...vertexFragment.to, node: 'n_fragment_b' }
			},
			{
				...effectFragment,
				id: 'e_effect_fragment_b',
				from: { ...effectFragment.from, node: 'n_effect_b' },
				to: { ...effectFragment.to, node: 'n_fragment_b' }
			},
			{
				...fragmentDisplay,
				id: 'e_fragment_display_b',
				from: { ...fragmentDisplay.from, node: 'n_fragment_b' },
				to: { ...fragmentDisplay.to, node: 'n_display_b' }
			}
		],
		outputs: []
	};
}

function withBufferFeedback(graph: GraphDocument, width = 4, height = 4): GraphDocument {
	const primitive = getPrimitive('target.bufferFeedback')!;
	return {
		...graph,
		nodes: [
			...graph.nodes,
			{
				id: 'n_buffer_feedback',
				primitive: primitive.id,
				params: { gridWidth: width, gridHeight: height },
				inputs: [],
				outputs: []
			}
		]
	};
}

describe('GraphFrameExecutor', () => {
	let pipelineSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		pipelineSpy = vi
			.spyOn(PipelineGraphExecutor.prototype, 'execute')
			.mockResolvedValue({ width: 4, height: 4, pixels: new Uint8Array(64) });
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('routes each frame through pass ordering and resource realization', async () => {
		const orderSpy = vi.spyOn(order, 'buildPassOrder');
		const realizeSpy = vi.spyOn(ResourceRealizer.prototype, 'realizeAll');
		const advanceSpy = vi.spyOn(ResourceRealizer.prototype, 'advanceFrame');
		const graph = effectiveGraphDocument(cosinePalettePipelineGraph());
		const mock = mockDevice();

		await new GraphFrameExecutor().execute({
			device: mock.device,
			graph,
			width: 4,
			height: 4,
			host: { iTime: 0, iFrame: 0, pointers: {} }
		});

		expect(orderSpy).toHaveBeenCalledTimes(1);
		expect(realizeSpy).toHaveBeenCalledTimes(1);
		expect(advanceSpy).toHaveBeenCalledTimes(1);
	});

	it('reuses realized texture identity across unchanged frames', async () => {
		const graph = effectiveGraphDocument(cosinePalettePipelineGraph());
		const mock = mockDevice();
		const executor = new GraphFrameExecutor();
		const input = {
			device: mock.device,
			graph,
			width: 4,
			height: 4,
			host: { iTime: 0, iFrame: 0, pointers: {} }
		};

		await executor.execute(input);
		await executor.execute({ ...input, host: { ...input.host, iFrame: 1 } });

		expect(mock.createTexture).toHaveBeenCalledTimes(1);
		expect(pipelineSpy.mock.calls[0]?.[0].target).toBe(mock.textures[0]);
		expect(pipelineSpy.mock.calls[1]?.[0].target).toBe(mock.textures[0]);
	});

	it('disposes realized resources and is safe before first execution', async () => {
		const disposeSpy = vi.spyOn(ResourceRealizer.prototype, 'dispose');
		const executor = new GraphFrameExecutor();
		executor.dispose();
		expect(disposeSpy).not.toHaveBeenCalled();

		const mock = mockDevice();
		await executor.execute({
			device: mock.device,
			graph: effectiveGraphDocument(cosinePalettePipelineGraph()),
			width: 4,
			height: 4,
			host: { iTime: 0, iFrame: 0, pointers: {} }
		});
		executor.dispose();

		expect(disposeSpy).toHaveBeenCalledTimes(1);
		expect(mock.textures[0]?.destroy).toHaveBeenCalledTimes(1);
	});

	it('cascades disposal to the buffer-feedback executor', () => {
		const disposeSpy = vi.spyOn(BufferFeedbackExecutor.prototype, 'dispose');

		new GraphFrameExecutor().dispose();

		expect(disposeSpy).toHaveBeenCalledTimes(1);
	});

	it('recreates and disposes resources when the device identity changes', async () => {
		const disposeSpy = vi.spyOn(ResourceRealizer.prototype, 'dispose');
		const first = mockDevice();
		const second = mockDevice();
		const graph = effectiveGraphDocument(cosinePalettePipelineGraph());
		const executor = new GraphFrameExecutor();

		await executor.execute({
			device: first.device,
			graph,
			width: 4,
			height: 4,
			host: { iTime: 0, iFrame: 0, pointers: {} }
		});
		await executor.execute({
			device: second.device,
			graph,
			width: 4,
			height: 4,
			host: { iTime: 0, iFrame: 1, pointers: {} }
		});

		expect(disposeSpy).toHaveBeenCalledTimes(1);
		expect(first.textures[0]?.destroy).toHaveBeenCalledTimes(1);
		expect(second.createTexture).toHaveBeenCalledTimes(1);
		expect(pipelineSpy.mock.calls[1]?.[0].target).toBe(second.textures[0]);
	});

	it('throws when an ordered pass has no matching frame pass', async () => {
		const originalBuild = graphFramePlan.buildIndependentPassGraph;
		vi.spyOn(graphFramePlan, 'buildIndependentPassGraph').mockImplementation((passes) => {
			const graph = originalBuild(passes);
			const firstTarget = graph.targets[0]!;
			return {
				...graph,
				targets: [...graph.targets, { ...firstTarget, id: 'unplanned-target' }],
				passes: graph.passes.map((pass) => ({
					...pass,
					writeTarget: 'unplanned-target'
				}))
			};
		});
		const mock = mockDevice();

		await expect(
			new GraphFrameExecutor().execute({
				device: mock.device,
				graph: effectiveGraphDocument(cosinePalettePipelineGraph()),
				width: 4,
				height: 4,
				host: { iTime: 0, iFrame: 0, pointers: {} }
			})
		).rejects.toThrow(/no matching GraphFramePass/);
		expect(pipelineSpy).not.toHaveBeenCalled();
	});

	it('passes the same iTime and iFrame to every pass in a frame', async () => {
		const graph = effectiveGraphDocument(cosinePalettePipelineGraph());
		const mock = mockDevice();
		await new GraphFrameExecutor().execute({
			device: mock.device,
			graph,
			width: 4,
			height: 4,
			host: {
				iTime: 1.25,
				iFrame: 7,
				pointers: { image: [0.5, 0.5, 0, 0] }
			}
		});

		expect(pipelineSpy).toHaveBeenCalledTimes(1);
		expect(pipelineSpy.mock.calls[0]?.[0].host).toEqual({
			iTime: 1.25,
			iFrame: 7,
			iMouse: [0.5, 0.5, 0, 0]
		});
	});

	it('merges buffer feedback pixels without sharing the pipeline resource lifecycle', async () => {
		const pixels = new Uint8Array(64).fill(17);
		const bufferExecute = vi
			.spyOn(BufferFeedbackExecutor.prototype, 'execute')
			.mockResolvedValue({ pixels });
		const graph = withBufferFeedback(effectiveGraphDocument(cosinePalettePipelineGraph()));
		const mock = mockDevice();
		const executor = new GraphFrameExecutor();

		const first = await executor.execute({
			device: mock.device,
			graph,
			width: 4,
			height: 4,
			host: { iTime: 0, iFrame: 0, pointers: {} }
		});
		await executor.execute({
			device: mock.device,
			graph,
			width: 4,
			height: 4,
			host: { iTime: 0, iFrame: 1, pointers: {} }
		});

		expect(bufferExecute).toHaveBeenCalledTimes(2);
		expect(first.targets.n_buffer_feedback).toBe(pixels);
		expect(mock.createTexture).toHaveBeenCalledTimes(1);
	});

	it('rejects a buffer-feedback grid that differs from the frame viewport', async () => {
		const graph = withBufferFeedback(
			effectiveGraphDocument(cosinePalettePipelineGraph()),
			8,
			4
		);
		await expect(
			new GraphFrameExecutor().execute({
				device: mockDevice().device,
				graph,
				width: 4,
				height: 4,
				host: { iTime: 0, iFrame: 0, pointers: {} }
			})
		).rejects.toThrow(/must match the frame viewport/);
		expect(pipelineSpy).not.toHaveBeenCalled();
	});

	it.skipIf(!hasWebGPU)('renders all independent targets on a device', async () => {
		pipelineSpy.mockRestore();
		const { requestGpuDevice } = await import('./device.js');
		const { device } = await requestGpuDevice();
		const graph = effectiveGraphDocument(cosinePalettePipelineGraph());
		const result = await new GraphFrameExecutor().execute({
			device,
			graph,
			width: 32,
			height: 32,
			host: { iTime: 0.5, iFrame: 1, pointers: {} }
		});
		expect(Object.keys(result.targets)).toEqual(['image']);
		expect(result.targets.image?.length).toBe(32 * 32 * 4);
		device.destroy();
	});

	it.skipIf(!hasWebGPU)('reads back every target in a multi-target graph', async () => {
		pipelineSpy.mockRestore();
		const { requestGpuDevice } = await import('./device.js');
		const { device } = await requestGpuDevice();
		const graph = effectiveGraphDocument(dualTargetPipelineGraph());
		const executor = new GraphFrameExecutor();
		const result = await executor.execute({
			device,
			graph,
			width: 32,
			height: 32,
			host: { iTime: 0.5, iFrame: 1, pointers: {} }
		});

		expect(Object.keys(result.targets).sort()).toEqual([
			'pipeline_image_n_display',
			'pipeline_image_n_display_b'
		]);
		for (const pixels of Object.values(result.targets)) {
			expect(pixels.length).toBe(32 * 32 * 4);
		}

		executor.dispose();
		device.destroy();
	});
});
