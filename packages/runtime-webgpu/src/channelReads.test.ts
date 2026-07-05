import '@world-lab/graph';
import {
	getPrimitive,
	type GraphDocument,
	type Node,
	type Port,
	type PortRef,
	type PortSpec
} from '@world-lab/graph';
import { describe, expect, it } from 'vitest';

import { emitGraphVec4Eval } from './emitGraphEval.js';
import {
	assembleFullscreenFragmentModuleAsync,
	executeFullscreenFragment
} from './consumers/fullscreenFragment.js';
import { createStandardLibraryResolver } from './moduleResolver.js';
import {
	buildPassGraphWithChannelReads,
	planIndependentGraphFramePasses,
	resolveChannelDependencies
} from './graphFramePlan.js';
import { parseChannelIndex } from './graphReachability.js';
import { buildPassOrder } from './frameGraph/order.js';
import { GraphFrameExecutor } from './graphFrameExecutor.js';
import { shouldSkipWebGPUTest } from './testSupport/webgpuTestEnv.js';

function ports(specs: readonly PortSpec[], direction: 'in' | 'out'): Port[] {
	return specs.map((spec) => ({
		id: spec.name,
		name: spec.name,
		direction,
		dataType: spec.dataType,
		space: spec.space ?? 'none'
	}));
}

function node(id: string, primitiveId: string, params?: Record<string, unknown>): Node {
	const primitive = getPrimitive(primitiveId);
	if (!primitive) throw new Error(`Unknown primitive: ${primitiveId}`);
	return {
		id,
		primitive: primitiveId,
		...(params ? { params } : {}),
		inputs: ports(primitive.inputs, 'in'),
		outputs: ports(primitive.outputs, 'out')
	};
}

function ref(nodeId: string, primitiveId: string, direction: 'in' | 'out', index: number): PortRef {
	const primitive = getPrimitive(primitiveId)!;
	const spec = (direction === 'in' ? primitive.inputs : primitive.outputs)[index]!;
	return { node: nodeId, port: spec.name };
}

function coloredVec4Node(id: string): Node {
	const result = node(id, 'vector.vec4f');
	for (const [index, value] of [0.2, 0.55, 0.9, 1].entries()) {
		result.inputs[index]!.default = value;
	}
	return result;
}

function channelPipelineGraph(): GraphDocument {
	return {
		version: '2',
		nodes: [
			node('plane', 'geometry.plane'),
			node('persist', 'buffer.persist'),
			node('vertex', 'stage.vertex'),
			coloredVec4Node('base'),
			node('fragment-a', 'stage.fragment'),
			node('display-a', 'target.display'),
			node('channel', 'input.channel', { channel: 0, sourceDisplayId: 'display-a' }),
			node('fragment-b', 'stage.fragment'),
			node('display-b', 'target.display')
		],
		edges: [
			{ id: 'e1', from: ref('plane', 'geometry.plane', 'out', 0), to: ref('persist', 'buffer.persist', 'in', 0) },
			{ id: 'e2', from: ref('persist', 'buffer.persist', 'out', 0), to: ref('vertex', 'stage.vertex', 'in', 0) },
			{ id: 'e3', from: ref('vertex', 'stage.vertex', 'out', 0), to: ref('fragment-a', 'stage.fragment', 'in', 0) },
			{ id: 'e4', from: ref('base', 'vector.vec4f', 'out', 0), to: ref('fragment-a', 'stage.fragment', 'in', 1) },
			{ id: 'e5', from: ref('fragment-a', 'stage.fragment', 'out', 0), to: ref('display-a', 'target.display', 'in', 0) },
			{ id: 'e6', from: ref('vertex', 'stage.vertex', 'out', 0), to: ref('fragment-b', 'stage.fragment', 'in', 0) },
			{ id: 'e7', from: ref('channel', 'input.channel', 'out', 0), to: ref('fragment-b', 'stage.fragment', 'in', 1) },
			{ id: 'e8', from: ref('fragment-b', 'stage.fragment', 'out', 0), to: ref('display-b', 'target.display', 'in', 0) }
		],
		outputs: [
			{ name: 'base_output', from: ref('base', 'vector.vec4f', 'out', 0) },
			{ name: 'channel_output', from: ref('channel', 'input.channel', 'out', 0) }
		]
	};
}

function twoChannelGraph(): GraphDocument {
	return {
		version: '2',
		nodes: [
			node('channel-0', 'input.channel', { channel: 0, sourceDisplayId: 'a' }),
			node('channel-1', 'input.channel', { channel: 1, sourceDisplayId: 'b' }),
			node('add', 'vector.add.vec4f')
		],
		edges: [
			{
				id: 'a',
				from: ref('channel-0', 'input.channel', 'out', 0),
				to: ref('add', 'vector.add.vec4f', 'in', 0)
			},
			{
				id: 'b',
				from: ref('channel-1', 'input.channel', 'out', 0),
				to: ref('add', 'vector.add.vec4f', 'in', 1)
			}
		],
		outputs: [{ name: 'image', from: ref('add', 'vector.add.vec4f', 'out', 0) }]
	};
}

describe('channel reads', () => {
	it('parses only integer channel indices in the supported range', () => {
		expect(parseChannelIndex(3, 'test')).toBe(3);
		for (const value of [-1, 4, 1.5, '1']) {
			expect(() => parseChannelIndex(value, 'test')).toThrow(/integer 0-3/);
		}
	});

	it('emits self-contained sampling metadata without requiring a UV node', () => {
		const graph = channelPipelineGraph();
		const emitted = emitGraphVec4Eval(graph, ref('channel', 'input.channel', 'out', 0));
		expect(emitted.usedChannels).toEqual([0]);
		expect(emitted.body.join('\n')).toContain(
			'position.xy / vec2<f32>(textureDimensions(channel0))'
		);
	});

	it('assembles distinct texture and sampler bindings for every used channel', async () => {
		const graph = twoChannelGraph();
		const output = ref('add', 'vector.add.vec4f', 'out', 0);
		const assembly = await assembleFullscreenFragmentModuleAsync(
			graph,
			output,
			createStandardLibraryResolver()
		);
		expect([...assembly.channelBindings]).toEqual([
			[0, { textureBinding: 0, samplerBinding: 1 }],
			[1, { textureBinding: 2, samplerBinding: 3 }]
		]);
		expect(assembly.code).toContain('@binding(0) var channel0: texture_2d<f32>');
		expect(assembly.code).toContain('@binding(3) var channel1Sampler: sampler');
	});

	it('rejects a missing channel texture before creating GPU objects', async () => {
		const graph = twoChannelGraph();
		await expect(
			executeFullscreenFragment({
				device: {} as GPUDevice,
				graph,
				output: ref('add', 'vector.add.vec4f', 'out', 0),
				width: 4,
				height: 4,
				host: { iTime: 0 },
				target: {} as GPUTexture,
				channelTargets: new Map([[0, {} as GPUTexture]])
			})
		).rejects.toThrow(/Missing channel target for channel 1/);
	});

	it('resolves display ids to target ids and orders the producer before the consumer', () => {
		const graph = channelPipelineGraph();
		const passes = planIndependentGraphFramePasses(graph);
		const dependencies = resolveChannelDependencies(graph, passes);
		expect(dependencies).toEqual([
			{ consumerId: 'channel_output', channel: 0, sourceTargetId: 'base_output' }
		]);
		const order = buildPassOrder(buildPassGraphWithChannelReads(passes, dependencies));
		expect(order.order.indexOf('base_output')).toBeLessThan(
			order.order.indexOf('channel_output')
		);
	});

	it('rejects unknown source displays during dependency resolution', () => {
		const graph = channelPipelineGraph();
		graph.nodes.find((candidate) => candidate.id === 'channel')!.params!.sourceDisplayId =
			'missing';
		expect(() =>
			resolveChannelDependencies(graph, planIndependentGraphFramePasses(graph))
		).toThrow(/unknown display/);
	});

	it('rejects two sources assigned to the same channel in one pass', () => {
		const graph = channelPipelineGraph();
		graph.nodes.push(
			node('channel-conflict', 'input.channel', {
				channel: 0,
				sourceDisplayId: 'display-b'
			}),
			node('channel-add', 'vector.add.vec4f')
		);
		const fragmentInput = graph.edges.find((edge) => edge.id === 'e7')!;
		graph.edges = [
			...graph.edges.filter((edge) => edge.id !== 'e7'),
			{
				id: 'conflict-a',
				from: fragmentInput.from,
				to: ref('channel-add', 'vector.add.vec4f', 'in', 0)
			},
			{
				id: 'conflict-b',
				from: ref('channel-conflict', 'input.channel', 'out', 0),
				to: ref('channel-add', 'vector.add.vec4f', 'in', 1)
			},
			{
				id: 'conflict-output',
				from: ref('channel-add', 'vector.add.vec4f', 'out', 0),
				to: fragmentInput.to
			}
		];
		graph.outputs[1] = {
			name: 'channel_output',
			from: ref('channel-add', 'vector.add.vec4f', 'out', 0)
		};

		expect(() =>
			resolveChannelDependencies(graph, planIndependentGraphFramePasses(graph))
		).toThrow(/conflicting sources for channel 0/);
	});

	it.skipIf(shouldSkipWebGPUTest())(
		'renders a same-frame channel read from the producer target',
		async () => {
			const adapter = await navigator.gpu!.requestAdapter();
			expect(adapter).toBeTruthy();
			const device = await adapter!.requestDevice();
			const executor = new GraphFrameExecutor();
			try {
				const result = await executor.execute({
					device,
					graph: channelPipelineGraph(),
					width: 8,
					height: 8,
					host: { iTime: 0, iFrame: 0, pointers: {} }
				});
				const producer = result.targets.base_output!;
				const consumer = result.targets.channel_output!;
				for (let channel = 0; channel < 4; channel += 1) {
					expect(consumer[channel]).toBeGreaterThanOrEqual(producer[channel]! - 1);
					expect(consumer[channel]).toBeLessThanOrEqual(producer[channel]! + 1);
				}
				expect(producer[2]).toBeGreaterThan(producer[0]!);
			} finally {
				executor.dispose();
				device.destroy();
			}
		}
	);
});
